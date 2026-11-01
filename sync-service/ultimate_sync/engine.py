from __future__ import annotations

import hashlib
import json
import os
import shutil
import threading
import time
import wave
import warnings
from contextlib import contextmanager
from pathlib import Path

from .state import State
from .progress import ProgressReporter
from .cuda_memory import CudaMemoryBudget


@contextmanager
def model_warnings(events):
    captured = []
    try:
        with warnings.catch_warnings(record=True) as captured:
            yield
    finally:
        for warning in captured:
            message = str(warning.message)
            known = ('dropout option adds dropout after all but last recurrent layer' in message
                     or ('torch.nn.utils.weight_norm' in message and 'deprecated' in message))
            if events:
                events.emit('model_notice' if known else 'model_warning',
                            ('Model compatibility notice (non-fatal): ' if known else 'Model warning: ') + message)
            elif known:
                print('Model compatibility notice (non-fatal): ' + message, flush=True)
            if not known:
                warnings.warn_explicit(warning.message, warning.category, warning.filename, warning.lineno)


class KokoroEngine:
    """One GPU model, one chapter at a time; never publish a partial chapter."""
    def __init__(self, device='auto', manage_cuda_cache=True):
        self.requested_device = device
        self.pipeline = None
        self.events = None
        self.manage_cuda_cache = manage_cuda_cache
        self.cuda_cache = None
        self.memory_report = None
        self.status = {'ready': False, 'device': 'not loaded', 'gpu': None, 'error': None}

    def load(self):
        if self.pipeline is not None:
            return
        started = time.monotonic()
        self.status.update(phase='loading model', error=None)
        if self.events:
            self.events.emit('model_loading', 'Loading Kokoro model; the first chapter includes model startup time.')
        # Use OS-trusted CAs (including managed Windows roots), never disable TLS verification.
        import truststore
        truststore.inject_into_ssl()
        import torch
        from kokoro import KPipeline
        device = 'cuda' if torch.cuda.is_available() and self.requested_device != 'cpu' else 'cpu'
        if self.requested_device == 'cuda' and device != 'cuda':
            raise RuntimeError('CUDA is unavailable. Install the matching GPU runtime, or choose --device cpu.')
        if device == 'cuda':
            # Check that the installed binary really supports this GPU architecture.
            probe = torch.ones((8, 8), device='cuda')
            (probe @ probe).sum().item()
            torch.cuda.synchronize()
        with model_warnings(self.events):
            self.pipeline = KPipeline(lang_code='a', device=device, repo_id='hexgrad/Kokoro-82M')
        self.status = {'ready': True, 'device': device,
                       'gpu': torch.cuda.get_device_name(0) if device == 'cuda' else None, 'error': None}
        if device == 'cuda':
            self.cuda_cache = CudaMemoryBudget(torch.cuda)
        if self.events:
            self.events.emit('model_ready', f'Kokoro ready on {self.status["gpu"] or device} in {time.monotonic() - started:.1f}s',
                             device=device, elapsed_seconds=round(time.monotonic() - started, 2))

    @contextmanager
    def _memory_scope(self):
        cache = self.cuda_cache if self.manage_cuda_cache else None
        self.memory_report = None
        if cache:
            cache.begin()
        try:
            yield cache
        finally:
            if cache:
                cache.release(force=True)
                self.memory_report = cache.summary()
                if cache.error and self.events:
                    self.events.emit('gpu_cache_warning', 'GPU cache cleanup warning: ' + cache.error[:300])

    def render(self, payload: dict, output: Path, progress):
        self.load()
        self.status.update(phase='generating', error=None)
        import numpy as np
        import torch
        frames = 0
        segments = []
        output.parent.mkdir(parents=True, exist_ok=True)
        with self._memory_scope() as cache, wave.open(str(output), 'wb') as stream:
            stream.setnchannels(1)
            stream.setsampwidth(2)
            stream.setframerate(24000)
            with torch.inference_mode():
                for index, text in enumerate(payload['chunks']):
                    start = frames
                    produced = False
                    for result in self.pipeline(text, voice=payload['voice'], speed=1):
                        samples = result.audio
                        if samples is None:
                            continue
                        if hasattr(samples, 'detach'):
                            samples = samples.detach().cpu().numpy()
                        samples = np.asarray(samples, dtype=np.float32).reshape(-1)
                        if not samples.size or not np.isfinite(samples).all():
                            raise RuntimeError('Kokoro returned incomplete audio')
                        stream.writeframesraw((np.clip(samples, -1, 1) * 32767).astype('<i2').tobytes())
                        frames += samples.size
                        produced = True
                        if frames * 2 + 44 > 200_000_000:
                            raise RuntimeError('Chapter exceeds the 200 MB audio limit')
                    if not produced:
                        raise RuntimeError('Kokoro could not narrate a passage')
                    segments.append({'text': text, 'start': start / 24000, 'end': frames / 24000})
                    if cache:
                        cache.release()
                    progress((index + 1) / len(payload['chunks']))
        return {'version': 1, 'title': payload['title'], 'paragraphs': payload['paragraphs'], 'segments': segments}


class Worker:
    def __init__(self, state: State, engine: KokoroEngine):
        self.state, self.engine = state, engine
        self.stop = threading.Event()
        self.engine.events = state.events
        self.reporter = ProgressReporter(state, engine)
        self.thread = threading.Thread(target=self.run, name='kokoro-chapter-worker', daemon=True)

    def run(self):
        monitor = threading.Thread(target=self._heartbeat, name='sync-progress', daemon=True)
        monitor.start()
        try:
            while not self.stop.is_set():
                try:
                    job = self.state.next_job()
                    if not job:
                        self.stop.wait(1)
                        continue
                    self._process(job)
                except Exception as error:
                    self.state.events.exception('worker_error', f'Worker error; retrying in 5s: {error}', error)
                    self.stop.wait(5)
        finally:
            monitor.join(2)

    def _heartbeat(self):
        while not self.stop.wait(5):
            try:
                self.reporter.heartbeat()
            except Exception as error:
                self.state.events.exception('progress_error', f'Progress reporting failed: {error}', error)

    def _process(self, job):
        job_id = job['id']
        partial = self.state.root / (job_id + '.part')
        try:
            payload = json.loads(job['payload'])
            self.engine.status.update(error=None, phase='generating' if self.engine.status.get('ready') else 'loading model')
            self.reporter.start(job, payload)
            if shutil.disk_usage(self.state.root).free < 500_000_000:
                raise RuntimeError('At least 500 MB of free PC storage is required')
            def progress(value):
                self.state.update(job_id, 'generating', value)
                self.reporter.progress(value)
            sync = self.engine.render(payload, partial, progress)
            with partial.open('rb') as completed:
                checksum = hashlib.file_digest(completed, 'sha256').hexdigest()
            manifest = {'version': 1, 'jobId': job_id, 'requestKey': payload['requestKey'],
                    'chapterId': payload['chapterId'], 'bookId': payload['bookId'],
                    'voice': payload['voice'], 'model': 'kokoro-v1.0', 'sampleRate': 24000,
                    'bytes': partial.stat().st_size, 'sha256': checksum, 'sync': sync,
                    'device': self.engine.status['device']}
            os.replace(partial, self.state.root / (job_id + '.wav'))
            self.state.update(job_id, 'ready', 1, result=manifest)
            self.engine.status.update(error=None, phase='idle')
            self.reporter.finish(manifest=manifest, memory=getattr(self.engine, 'memory_report', None))
        except Exception as error:
            try:
                partial.unlink(missing_ok=True)
            except OSError as cleanup_error:
                self.state.events.exception('cleanup_error', f'Could not remove partial audio: {cleanup_error}', cleanup_error, job_id=job_id)
            self.engine.status['error'] = str(error)[:300]
            self.engine.status['phase'] = 'error'
            self.state.update(job_id, 'error', error=str(error)[:300])
            if self.reporter.current:
                self.reporter.finish(error=error)
            else:
                self.state.events.exception('chapter_failed', f'Chapter job failed: {error}', error, job_id=job_id)
