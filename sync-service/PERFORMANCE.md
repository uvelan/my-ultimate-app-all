# Local sync performance investigation — 2026-10-30

## Full-chapter follow-up: confirmed cache pressure and fix

The earlier short-passage tests below did not reproduce the allocator growth seen
over a full chapter. The slow live batch ended with 15/15 chapters ready; its final
chapter took 319.03 seconds to generate 832.05 seconds of audio. The idle service
still occupied nearly all 4 GB VRAM. Windows reported approximately 3.4 GiB shared
GPU memory for its Python process.

After stopping that idle instance, a controlled offline full-chapter comparison used
the same 16 passages (14,398 characters), Bella voice, float32 and speed 1:

| Configuration | Generation seconds | Retained CUDA reserved memory |
| --- | ---: | ---: |
| Fresh process, cache retained | 159.56 | 4,106 MiB |
| Release cache after each passage | 85.70 | 692 MiB |
| Retain cache again in the same process | 106.88 | 4,158 MiB |
| Production guard, full-chapter run 1 | 66.14 | 688 MiB |
| Production guard, consecutive run 2 | 65.98 | 748 MiB |

Peak live CUDA allocations stayed near 1,765 MiB. Between passages only roughly
550–560 MiB were live, while the unbounded allocator retained more than the physical
VRAM capacity, leaving less room for Windows graphics and temporary inference work.
The same-process release/retain comparison supports cache pressure as a cause of
the slowdown. Timings also depend on warmup, driver residency and other applications;
the full difference from the earlier 319-second service run is not an isolated
estimate of cache cleanup alone.

All five seeded benchmark outputs have identical PCM SHA-256:
`512bbacef52b737fd0dd085e97380eae06e6a2474c9fa374d465cf34f1894f4d`.
The two production runs each reclaimed cache 16 times, costing 0.18/0.17 seconds
total. No voice, checkpoint, precision, speech-rate or output-format changes were used.

The fix is enabled in `KokoroEngine`: return unused cache of at least 256 MiB at
passage boundaries on GPUs up to 6 GiB, or when reserved cache reaches 75% of capacity
on larger GPUs. Chapter boundaries also release unused cache. The model remains
loaded. Completion history records memory/cleanup statistics. Cleanup failures are
reported without invalidating completed audio.

Same-drive history writes measured 0.27 ms median, 1.24 ms maximum across 20 samples.
This does not account for the observed generation slowdown. Phone transfer throughput
was not remeasured by these GPU-only tests.

Reproduce while the sync queue is idle, with only one model process using the GPU:

```powershell
.venv/Scripts/python.exe -u benchmark.py --threads 8 --repeats 1 --passages 16 --variants baseline,trim-cache,cache-retained
.venv/Scripts/python.exe -u benchmark.py --threads 8 --repeats 2 --passages 16 --variants bounded-cache
```

Raw reports are kept privately in `.state/benchmarks/`. All 23 service tests passed.
The idle service was restarted with the fix after testing; existing audio and pairing
data were retained.

## Earlier short-passage investigation

The measured bottleneck is model inference. The tested CPU and inference settings
did not produce a meaningful speed improvement. The running service was not
restarted or reconfigured, and existing jobs/audio were not changed.

## Measurements

Hardware: NVIDIA GTX 1050 Ti (4 GB), Intel i7-9700K (8 cores).
Runtime: PyTorch 2.6.0+cu124, Kokoro 0.9.4, CUDA inference, float32.
The service queue was empty (142 completed chapters). An isolated process loaded
cached assets offline and read representative input through read-only SQLite.
The existing service remained loaded, so GPU memory headroom was lower than in a
single-process deployment. Audio output was temporary and removed on exit.

One 913-character passage produced 53.45 seconds of audio:

| CPU threads | Generation seconds |
| --- | ---: |
| 8, initial run | 4.177 |
| 1 | 4.129 |
| 2 | 4.129 |
| 4 | 4.128 |
| 8, repeat | 4.143 |

Text preparation took 0.013–0.019 seconds. Thread changes are within roughly 1%
of the final default run; this single-pass sweep does not justify a setting change.
Preparing text ahead cannot recover substantial time on this sample.

A second experiment used two passages (1,890 characters), producing 112.8 seconds
of audio. Each configuration ran three times after a separate initial warmup:

| Configuration | Median generation seconds | Peak allocated GPU memory, approximately |
| --- | ---: | ---: |
| Existing baseline | 8.710 | 1,774 MiB |
| Freeze 89 weight-normalization layers | 8.692 | 1,547 MiB |
| Frozen weights plus cuDNN autotuning | 8.699 | 1,547 MiB |

The baseline's first measured run took 9.090 seconds; subsequent runs took 8.710
and 8.700 seconds. Median inference time was 8.660 seconds, text preparation
0.027 seconds. Inference includes CUDA execution and audio/duration copies to CPU;
CUDA synchronization brackets it to avoid measuring only kernel dispatch.
GPU utilization was observed at 90% during the experiment, not sampled as an average.

All nine seeded runs had exactly identical PCM SHA-256 and duration. Freezing
weights reduced peak allocated GPU memory by about 227 MiB, but the speed difference
was below 0.3%. This validates only the tested passages and voice. None of these
experimental settings was enabled in production.

Autotuning was tested cumulatively after frozen weights. It was not tested alone.
Input lengths vary between chapters, so these repeated-input measurements cannot
establish its cold-input performance. PyTorch also notes algorithm-selection
overhead for variable input sizes:
https://docs.pytorch.org/tutorials/recipes/recipes/tuning_guide.html

## Delivery findings

Historical logs contain 38 chapter completions: 32,873.85 seconds of audio generated
in 4,555.94 seconds (about 7.2 times playback speed). The latest complete 15-chapter
generation batch took 2,193.45 seconds; packaging took 5.81 seconds and sending its
653 MB archive took 32.31 seconds. These are PC-side times, excluding phone
extraction/verification. Earlier recorded transfers ranged from 15.94 to 285.77
seconds, so network conditions also vary.

`LocalSyncBatch.kt` queues the distant group, then waits for every chapter before
requesting its ZIP. The transfer therefore starts after generation, leaving ready
chapters on the PC. Delivering ready chapters or small consecutive groups while
generation continues is the clearest software change to make chapters available
earlier. It would require Android changes and an APK build. It would not make the
model synthesize faster, and total batch-time savings must be measured; they are
bounded by how much transfer/verification can overlap generation, less any new
request/packaging overhead. Existing nearby-chapter delivery already downloads
individually.

Follow-up: Android 1.1.21 now implements ready-subset ZIP transfers of up to three
chapters and persists archive membership for reconnect/resume. Its tests verify
ready-subset transfer while later chapters remain queued. Device-level latency and
total-time improvements have not yet been measured; inference settings remain unchanged.

## Reproduce

Run from `sync-service` only when the queue is idle:

```powershell
.venv/Scripts/python.exe -u benchmark.py --threads 8,1,2,4,8 --repeats 1 --passages 1
.venv/Scripts/python.exe -u benchmark.py --threads 8 --repeats 3 --passages 2 --variants baseline,frozen-weights,autotune
```

The benchmark refuses to start a measured run with queued/generating jobs, but it
does not reserve the service: do not enqueue sync work while benchmarking. It uses
cached model/voice assets only and writes timestamped JSON reports to ignored
`.state/benchmarks/`, without chapter text or credentials. Variants are cumulative
and affect only the benchmark process. The model stays float32; no speech-speed,
sample-rate, checkpoint, or text changes are used to claim a speed improvement.

Validation: benchmark compiled successfully; all 17 sync-service tests passed.
