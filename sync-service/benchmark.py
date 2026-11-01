"""Offline, isolated generation benchmark; never mutates the live job database."""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import sqlite3
import tempfile
import time
import wave
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--state', type=Path, default=Path(__file__).parent / '.state')
    parser.add_argument('--threads', default='8,1,2,4,8')
    parser.add_argument('--repeats', type=int, default=2)
    parser.add_argument('--passages', type=int, default=2)
    parser.add_argument('--variants', default='baseline',
                        help='Cumulative experiments: baseline,frozen-weights,autotune,trim-cache,cache-retained,bounded-cache')
    args = parser.parse_args()
    thread_counts = [int(value) for value in args.threads.split(',')]
    variants = args.variants.split(',')
    if any(value < 1 for value in thread_counts):
        parser.error('thread counts must be positive')
    if any(value not in ('baseline', 'frozen-weights', 'autotune', 'trim-cache', 'cache-retained', 'bounded-cache') for value in variants):
        parser.error('unknown experiment variant')
    if 'baseline' in variants[1:]:
        parser.error('baseline must run before experiments')
    if args.repeats < 1 or args.passages < 1:
        parser.error('repeats and passages must be positive')
    # Use only existing cached model/voice files. Do not make network requests.
    os.environ['HF_HUB_OFFLINE'] = '1'
    os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
    db = sqlite3.connect((args.state / 'jobs.sqlite3').resolve().as_uri() + '?mode=ro', uri=True)

    def idle():
        if db.execute("SELECT COUNT(*) FROM jobs WHERE status IN ('queued','generating')").fetchone()[0]:
            raise RuntimeError('Sync has pending work. Run the benchmark after it finishes.')

    idle()
    row = db.execute("SELECT payload FROM jobs WHERE status='ready' ORDER BY created DESC LIMIT 1").fetchone()
    if not row:
        raise RuntimeError('A completed chapter is required for representative input')
    payload = json.loads(row[0])
    payload['chunks'] = payload['chunks'][:args.passages]
    payload['paragraphs'] = payload['chunks']
    from ultimate_sync.engine import KokoroEngine
    import torch
    import numpy as np
    engine = KokoroEngine('cuda', manage_cuda_cache=False)
    started = time.perf_counter()
    engine.load()
    pipeline = engine.pipeline
    print(json.dumps({'model_load_seconds': time.perf_counter() - started,
                      'default_threads': torch.get_num_threads(), 'torch': torch.__version__,
                      'gpu': engine.status['gpu'], 'passages': len(payload['chunks']),
                      'characters': sum(map(len, payload['chunks']))}), flush=True)
    pipeline_type = type(pipeline)
    original_g2p, original_infer = pipeline.g2p, pipeline_type.infer
    stage = {}

    def g2p(*a, **kw):
        started = time.perf_counter()
        try:
            return original_g2p(*a, **kw)
        finally:
            stage['text_seconds'] += time.perf_counter() - started

    def infer(*a, **kw):
        torch.cuda.synchronize()
        started = time.perf_counter()
        try:
            return original_infer(*a, **kw)
        finally:
            torch.cuda.synchronize()
            stage['inference_seconds'] += time.perf_counter() - started

    pipeline.g2p = g2p
    pipeline_type.infer = staticmethod(infer)
    results = []
    output_dir = args.state / 'benchmarks'
    output_dir.mkdir(parents=True, exist_ok=True)
    report = output_dir / ('generation-' + dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '.json')
    with tempfile.TemporaryDirectory(prefix='sync-benchmark-') as directory:
        output = Path(directory) / 'chapter.wav'
        # Separate warmup from measured runs (model kernels/voice are initially cold).
        stage.update(text_seconds=0, inference_seconds=0)
        engine.render({**payload, 'chunks': ['This is a warmup sentence.']}, output, lambda _: None)
        reference = None
        frozen = False
        trim_cache = False
        for variant in variants:
            engine.manage_cuda_cache = variant == 'bounded-cache'
            if variant == 'frozen-weights':
                removed = 0
                for module in pipeline.model.modules():
                    if hasattr(module, 'weight_g') and hasattr(module, 'weight_v'):
                        torch.nn.utils.remove_weight_norm(module)
                        removed += 1
                print(json.dumps({'frozen_weight_norm_layers': removed}), flush=True)
                frozen = True
            elif variant == 'autotune':
                torch.backends.cudnn.benchmark = True
            elif variant == 'trim-cache':
                trim_cache = True
                torch.cuda.empty_cache()
            elif variant == 'cache-retained':
                trim_cache = False
            elif variant == 'bounded-cache':
                trim_cache = False
            elif variant != 'baseline':
                raise ValueError('Unknown variant: ' + variant)
            for threads in thread_counts:
                if threads < 1:
                    raise ValueError('thread counts must be positive')
                torch.set_num_threads(threads)
                for repeat in range(args.repeats):
                    idle()
                    stage.update(text_seconds=0, inference_seconds=0)
                    torch.cuda.reset_peak_memory_stats()
                    torch.manual_seed(1234)
                    np.random.seed(1234)
                    passage_memory = []
                    def progress(value):
                        point = {'progress': value, 'allocated_mb': torch.cuda.memory_allocated() / 1024**2,
                                 'reserved_mb': torch.cuda.memory_reserved() / 1024**2}
                        if trim_cache:
                            cleanup_started = time.perf_counter()
                            torch.cuda.empty_cache()
                            point['trim_seconds'] = time.perf_counter() - cleanup_started
                            point['after_reserved_mb'] = torch.cuda.memory_reserved() / 1024**2
                        passage_memory.append(point)
                    started = time.perf_counter()
                    engine.render(payload, output, progress)
                    elapsed = time.perf_counter() - started
                    with wave.open(str(output)) as audio:
                        seconds = audio.getnframes() / audio.getframerate()
                        pcm = audio.readframes(audio.getnframes())
                        digest = hashlib.sha256(pcm).hexdigest()
                    samples = np.frombuffer(pcm, dtype='<i2').astype(np.float32)
                    if reference is None:
                        reference = samples.copy()
                    same_length = reference.shape == samples.shape
                    difference = samples - reference if same_length else None
                    result = {'variant': variant, 'threads': threads, 'repeat': repeat, 'elapsed_seconds': elapsed,
                              'frozen_weights': frozen, 'cudnn_autotune': torch.backends.cudnn.benchmark,
                              **stage, 'audio_seconds': seconds, 'pcm_sha256': digest,
                              'same_length': same_length,
                              'rms_difference_pcm': float(np.sqrt(np.mean(difference**2))) if same_length else None,
                              'max_difference_pcm': float(np.max(np.abs(difference))) if same_length else None,
                              'peak_gpu_mb': torch.cuda.max_memory_allocated() / 1024**2}
                    result.update(reserved_gpu_mb=torch.cuda.memory_reserved() / 1024**2,
                                  peak_reserved_gpu_mb=torch.cuda.max_memory_reserved() / 1024**2,
                                  passage_memory=passage_memory)
                    if engine.memory_report:
                        result['memory_report'] = engine.memory_report
                    results.append(result)
                    print(json.dumps(result), flush=True)
                    report.write_text(json.dumps(results, indent=2), encoding='utf-8')
    db.close()
    print('Results: ' + str(report), flush=True)


if __name__ == '__main__':
    main()
