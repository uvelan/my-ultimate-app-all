from __future__ import annotations

import hashlib
import json
import os
import shutil
import threading
import time
import wave
from pathlib import Path

from .state import State


class KokoroEngine:
    """One GPU model, one chapter at a time; never publish a partial chapter."""
    def __init__(self, device='auto'):
        self.requested_device = device
        self.pipeline = None
        self.status = {'ready': False, 'device': 'not loaded', 'gpu': None, 'error': None}

    def load(self):
        if self.pipeline is not None:
            return
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
        self.pipeline = KPipeline(lang_code='a', device=device, repo_id='hexgrad/Kokoro-82M')
        self.status = {'ready': True, 'device': device,
                       'gpu': torch.cuda.get_device_name(0) if device == 'cuda' else None, 'error': None}

    def render(self, payload: dict, output: Path, progress):
        self.load()
        import numpy as np
        import torch
        frames = 0
        segments = []
        output.parent.mkdir(parents=True, exist_ok=True)
        with wave.open(str(output), 'wb') as stream:
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
                    progress((index + 1) / len(payload['chunks']))
        return {'version': 1, 'title': payload['title'], 'paragraphs': payload['paragraphs'], 'segments': segments}


class Worker:
    def __init__(self, state: State, engine: KokoroEngine):
        self.state, self.engine = state, engine
        self.stop = threading.Event()
        self.thread = threading.Thread(target=self.run, name='kokoro-chapter-worker', daemon=True)

    def run(self):
        while not self.stop.is_set():
            job = self.state.next_job()
            if not job:
                self.stop.wait(1)
                continue
            job_id = job['id']
            partial = self.state.root / (job_id + '.part')
            try:
                if shutil.disk_usage(self.state.root).free < 500_000_000:
                    raise RuntimeError('At least 500 MB of free PC storage is required')
                payload = json.loads(job['payload'])
                sync = self.engine.render(payload, partial, lambda value: self.state.update(job_id, 'generating', value))
                with partial.open('rb') as completed:
                    checksum = hashlib.file_digest(completed, 'sha256').hexdigest()
                manifest = {'version': 1, 'jobId': job_id, 'requestKey': payload['requestKey'],
                            'chapterId': payload['chapterId'], 'bookId': payload['bookId'],
                            'voice': payload['voice'], 'model': 'kokoro-v1.0', 'sampleRate': 24000,
                            'bytes': partial.stat().st_size, 'sha256': checksum, 'sync': sync,
                            'device': self.engine.status['device']}
                os.replace(partial, self.state.root / (job_id + '.wav'))
                self.state.update(job_id, 'ready', 1, result=manifest)
            except Exception as error:
                partial.unlink(missing_ok=True)
                self.engine.status['error'] = str(error)[:300]
                self.state.update(job_id, 'error', error=str(error)[:300])
