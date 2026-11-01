# Drive → chapter audio

Upload `Drive_Chapter_Audio.ipynb` to Google Colab. This notebook is self-contained;
the Python files here are only needed for development and notebook regeneration.
It runs independently of the PC sync service, database, web app and mobile app.

1. Select **Runtime → Change runtime type → GPU**.
2. Run setup, then mount Drive and approve Google's Drive access prompt.
3. Run the remaining cells. Select a book number, a starting option, how many chapters to process, and parallel chapters (press Enter for 2).
   Conversion starts automatically using the defaults at the top of the code cell.

Books are listed automatically from `/content/drive/MyDrive/Myepub/` (EPUB files
directly inside that folder, in natural filename order). There is no path prompt.
Change `BOOK_DIRECTORY` in code to use another folder.

Automatic output: `/content/drive/MyDrive/Myepub/UltimateAudio/MyBook-<source-hash>/`

## EPUB input

Select an EPUB from the list. The converter follows the book's primary
reading order (OPF spine), extracts visible body text, and uses the first H1/H2
heading as the section title. It skips navigation documents, EPUB 2 guide entries
marked cover/contents, non-linear supplemental documents, and image-only pages.
Scripts, styles, navigation elements and explicitly hidden text are not narrated.
Encrypted chapter text is unsupported.

The notebook displays the last verified successful section and previous requested
batch end, including their titles. Section 1 means the first retained text document, which
can include a preface or title page; it may differ from the printed chapter number.
Each EPUB text document is one conversion section. If a book stores several chapters
inside one document, they are converted together; if it splits a chapter into several
documents, each is processed separately. Continuation follows this reading order.
Nested output folders are excluded from the book picker.

## Continuing with a new batch

After selecting the book, choose:

1. **Continue after last successful chapter** (default): verifies existing audio
   and starts after the highest successful section in reading order.
2. **Continue after previous batch end**: starts after the end requested for the
   previous batch, even if that batch stopped early. This can leave unfinished
   chapters behind; choose option 1 to continue from verified progress instead.
3. **Custom section range**: enter an inclusive range such as `461-470`, a single
   section such as `461`, or `all`. These are EPUB section numbers, not necessarily
   printed chapter numbers. This option also saves its requested end for the next batch.

For options 1–2, enter a positive whole number for **How many chapters to process?**
Option 3 asks for the custom range instead. All options then ask for parallel workers.
Choose
**Parallel chapters** from 1–8, or press Enter to keep the default of 2. The
selection is capped at the end of the book. With no saved success, option 1 starts
at the beginning. No model loads when there are no chapters left.

The requested batch boundaries are saved to Drive before generation begins in
`batch-state-<voice>-<format>.json`. Each book, voice and format keeps separate
resume positions. Older outputs can supply the last verified success immediately;
the previous-batch option becomes available after a batch is requested with this
version. Neither option repairs gaps before its chosen starting position.

For example, after requesting sections 101–110 and saving only through 106,
option 1 starts at 107; option 2 starts at 111. Run the final `interactive()` cell
again for each new batch. After updating the notebook, rerun the definitions in
cell 4 before running cell 5; wait for any current batch to finish first.

## TXT / JSON input

The `load_chapters()` / `convert()` Python functions also support TXT/JSON for
advanced code use; the interactive picker lists EPUB books only.

Use one input folder per book, containing UTF-8 TXT files (one chapter per file,
e.g. `Chapter 350.txt`), or a JSON file like this:

```json
{"chapters": [
  {"number": 350, "title": "Chapter 350", "paragraphs": ["First paragraph.", "Second paragraph."]},
  {"number": 351, "title": "Chapter 351", "text": "Chapter text here."}
]}
```

JSON also accepts a top-level chapter list or single chapter object, plain-text
`content`, and explicit `chunks` from local-sync payloads. Chapter numbers are
one-based (`number` or `chapterNumber`); omitted numbers use list order starting at 1.
Zero-based app indexes are not interpreted as chapter numbers. The first number
in a TXT filename supplies its chapter number; unnumbered files use natural file
order. Duplicate numbers are rejected. Standalone HTML, rich-text objects and database
backups must first be exported to the documented plain-text format.

For manual ranges in advanced Python use, `select_chapters()` accepts `350-365`,
`350`, or `all`. Ranges are inclusive. The interactive workflow uses continuation
and a chapter count, or custom range option 3. Defaults are Bella
and WAV (24 kHz mono PCM16, speed 1), suitable for the current native WAV validator.
Edit `VOICE`, `AUDIO_FORMAT`, and `SESSION_MINUTES` at the top of the definitions
cell to change defaults. MP3 (128 kbps) is available for independent listening, but
a future mobile importer would need separate compressed-audio validation.
Model and voice settings match the local generator; different hardware/runtime
versions can produce small differences in the samples.

Two progress bars show chapters and passages, elapsed time and ETA. A per-run
`history-*.jsonl` records completion, failures and timings in Drive. One failed
chapter does not stop the remaining batch. Stop using Colab's interrupt button.

At completion (also after an interrupt), a batch summary lists each chapter's
status, audio duration, and processing elapsed time, plus total audio duration and
total batch wall time. Already-saved chapters are labeled separately; failed or
unprocessed chapters do not add audio to the total. The total line and saved summary
also include the configured parallel chapter worker/thread count. Chapter processing times may
overlap during parallel generation/saving, so their sum is not batch wall time.
The same summary is saved as `history/batch-summary-<run-id>.json` in the book's
Drive folder. A forced runtime termination cannot write a final summary.

## Automatic book package and future mobile import

The book folder name combines the EPUB filename and its source checksum, so books
with the same filename but different content stay separate. Different ranges from
the same EPUB accumulate in the same folder without replacing earlier chapters.

```text
UltimateAudio/<book-name>-<source-hash>/
  source.epub                 original book, checksum-verified
  book.json                   full chapter map and completed recordings index
  batch-state-af_bella-wav.json previous requested batch boundaries
  chapters/<identity>.wav     verified complete audio
  chapters/<identity>.json    chapter identity, text and exact timing segments
  history/history-*.jsonl     per-run progress/completion/error history
```

`book.json` uses schema `ultimate-drive-audio`, version 1. It records a portable
book ID derived from the original EPUB SHA-256, source filename/size/checksum,
and the complete chapter map: stable chapter ID, EPUB document path, one-based
section number, zero-based chapter index, title and normalized-text SHA-256.
Each completed recording includes relative audio/manifest paths, provider/model,
voice, sample rate, format, byte count and SHA-256. Chapter manifests also retain
the spoken paragraphs and timing segments. Only complete, copy-verified recordings
are indexed. A rerun recovers missing index entries from verified chapter manifests.
History and earlier chapter outputs remain across subsequent range conversions.

For a future mobile Drive importer: locate `book.json`; verify the schema, source,
relative paths, file sizes, checksums, WAV format and timing bounds; match the EPUB
source/document and normalized text to the actual mobile book/chapter; then assign
the current account's private audio identity and publish through native cache
validation. Portable IDs are not mobile database IDs. Do not match by chapter number
or book title alone. Do not copy a Drive manifest directly into the private cache.
The original EPUB is included so a missing mobile book can be imported consistently.
Android 1.1.24 implements this through a user-selected ZIP and strict actual-text matching.
It does not retain a Google OAuth session or automatically poll Drive.

Each chapter is generated on Colab's local disk, copied to Drive with SHA-256
verification, and marked complete by publishing its timing JSON last. Content-based
filenames prevent title collisions; the JSON records chapter number, title, voice
and checksum. Matching outputs are verified and skipped on rerun without loading
the model. Text, voice or format changes produce new identities; old files remain.
Resume works between chapters; an interrupted chapter restarts from its beginning.
Do not run two converters simultaneously against the same output folder.

This produces a portable book package for a future Drive importer. Android 1.1.24 can import the exported ZIP into the currently opened mobile book
through the system file picker (choose Google Drive as the provider). Drive synchronization/visibility
is managed by Google; disconnected runtimes cannot save further progress.
GPU availability and runtime limits depend on the Colab account. A new runtime
repeats setup and model loading. Setup uses Colab's existing PyTorch build.

## Python 3.13 installation fix

The PyPI Kokoro/Misaki 0.9.4 releases exclude Python 3.13 in their package metadata.
For Python 3.13, setup installs fixed, immutable revisions from the official
`hexgrad/kokoro` and `hexgrad/misaki` repositories, plus compatible spaCy 3.8
dependencies. Python 3.10–3.12 continues using the published 0.9.4 packages.
Setup preserves the installed Torch/CUDA and NumPy versions with pip constraints.
It does not bypass Python compatibility checks globally.

If you used an older notebook and installation failed, upload this updated notebook
and run its setup cell again. Restart the runtime if Colab requests it, then rerun
setup and continue. No Drive outputs are deleted. Full installation output is shown
in the cell and saved to `/content/ultimate-colab-setup.log`. A fresh-process import
check and small CUDA calculation must pass before setup reports success. These
checks do not benchmark or validate full speech generation on your assigned GPU.

See the [upstream Python 3.13 packaging issue](https://github.com/hexgrad/kokoro/issues/342).

## Free Colab GPU tuning

- Detect the assigned GPU, rather than assuming T4 hardware or a fixed quota.
  Setup checks for CUDA before downloading dependencies, skips tools/packages
  already installed, and keeps Colab's GPU-compatible PyTorch.
- Stage EPUBs on runtime disk before ZIP reads. Generate WAV/MP3 locally and copy
  only completed output to Drive, with verification.
- Keep an independent model loaded in each active chapter worker for the whole
  conversion. Rerun only the final `interactive()` cell for another range. With
  one worker, the model can be reused across calls in the same runtime.
- Use inference mode and float32. Retain CUDA allocator cache between chapters on
  roomy GPUs; release unused cache under memory pressure, or on GPUs with at most
  6 GiB. Avoid cuDNN exhaustive autotuning for changing text/audio shapes. Mixed
  precision and compilation are not enabled without audio validation on that GPU.
- `SESSION_MINUTES` defaults to 0 (complete the requested range). If set to a positive
  number in code, it stops before starting
  another chapter after that budget, and always finishes/saves the chapter already
  running. This is a user budget, not a prediction of Google's runtime cutoff.
  Set 0 for no voluntary limit. Unexpected runtime termination can still lose
  the current unsaved chapter; completed verified chapters are skipped on rerun.
- Completion manifests/history include generation time, audio duration, audio
  seconds per generation second, peak live GPU MiB, and reserved MiB. Use these to
  compare the first (cold) chapter with later warm chapters. No Colab speedup is
  claimed without measurements from an actual assigned runtime.

## Reading utilization correctly

Colab's **GPU RAM** graph shows memory occupancy, not GPU compute activity. An
82M-parameter speech model does not need all 15 GiB just to run efficiently.
Filling RAM or starting multiple independent model workers is not evidence of
better throughput. Measure audio seconds generated per wall-clock second.

The passage bar now shows GPU compute utilization and device memory from a
best-effort background `nvidia-smi` sample every two seconds. Each completed chapter
prints generation speed, sampled average GPU utilization and Drive-save time.
History records model-load time, validation/encoding time, Drive publication time,
and generation metrics; chapter manifests retain generation/utilization metrics.
Sampling is device-wide and approximate, not per-process kernel profiling. Short
chapters may have no samples; unsupported monitoring is reported as unavailable
rather than 0%, and cannot prevent narration. The first chapter includes cold-start
work. Compare several warm chapters before drawing conclusions.

High utilization during generation suggests that filling more VRAM will not help.
Low utilization plus long Drive-save times indicates storage waits between chapters;
low generation utilization needs investigation of CPU text preparation and inference
dispatch. These observations guide further tuning; they do not establish a cause on
their own. See [NVIDIA utilization documentation](https://docs.nvidia.com/deploy/nvidia-smi/index.html).

## Parallel generation and Drive saving

`PARALLEL_DRIVE_SAVE = True` overlaps GPU generation of the next chapter with
copying and checksum-verifying the previous chapter on Drive. The configured chapter workers generate
audio while one background worker saves it. Each chapter worker owns its model. At most
one chapter save is in flight plus the bounded set of concurrent/prefetched chapters. If Drive
falls behind, generation waits before queuing another save, bounding local storage.
Each chapter has separate temporary files so a later chapter cannot overwrite
audio still uploading. Only the main thread publishes the book catalog and updates
history/completed counts after both chapter files have been verified.

The chapter bar counts chapters prepared; `ready` counts completed Drive saves.
Normal completion, time-budget stops and user interruption drain the pending save
before returning. A forced runtime termination cannot drain it; rerun to recover.
Drive-save failures are reported in history and remain retryable. Set the flag to
False to use serial saving for a comparison. Benefit depends on measured Drive wait
time; this does not claim faster GPU inference. A sampled 100% GPU reading already
indicates compute activity despite low VRAM occupancy. Chapter concurrency is configurable as described below; measure actual throughput
and sample the resulting audio on your assigned GPU.

References: [Colab Drive I/O](https://colab.research.google.com/notebooks/io.ipynb),
[Kokoro](https://github.com/hexgrad/kokoro),
[EPUB reading order](https://www.w3.org/TR/epub-33/),
[Colab runtime limits](https://research.google.com/colaboratory/faq.html).

Development: run `python colab/build_notebook.py` from `sync-service` after changing
the module or this README; the resulting notebook embeds both and needs no clone.

## Import into Android 1.1.24

For direct Drive sync, Android 1.1.25 reads the chapter files directly; no ZIP is needed.
Before connecting, enable Google Drive API and create an Android OAuth client in
[Google Cloud using these official instructions](https://developer.android.com/identity/authorization).
Use package `com.uvelan.ultimateapp` and release SHA-1
`47:BC:4A:5D:5F:A1:7A:55:FE:6A:EC:D1:69:EB:C4:5F:CD:2F:19:80`.
Add `https://www.googleapis.com/auth/drive.readonly` to the consent configuration
and add your Drive Google email as a test user if the app is in Testing mode.
Then use Listen → Sync → Connect / refresh Drive books, select the book folder,
and tap Sync chapters directly from Drive.
Set `CREATE_MOBILE_PACKAGE = True` in code if you want the ZIP fallback.
With that option enabled, Colab exports the selected completed range to
`exports/mobile-audio-<start>-<end>-af_bella.zip` inside the book folder. It includes
`book.json`, the original EPUB, and complete WAV/timing pairs for that range. Old
chapters remain in the main library. ZIP export is capped below 4 GB; use smaller
ranges for a phone. `CREATE_MOBILE_PACKAGE` now defaults to False to avoid ZIP creation/upload overhead for direct sync.
For already-generated audio, use the Python conversion functions with the same
range: verified chapters are skipped and the package is created without regenerating narration.

On Android, open the same book in Listen, open Sync, and choose **Choose audio ZIP
from Drive**. Select Google Drive in Android's file picker, browse to the exported
ZIP, and select it. Android 1.1.27 downloads all available catalog chapters from the current mobile
chapter onward. The PC chapter-count setting does not limit cloud downloads. The app maps chapter titles then verifies
the actual prose; EPUB section numbers are never blindly used as database IDs.
Unmatched chapters are skipped. Audio size, SHA-256, WAV format and contiguous
timing bounds are verified natively before publication to private offline storage.
Select Bella in Listen to play Bella recordings. Existing verified compatible
chapters are skipped. Completed imports remain usable after disconnecting Drive.

Keep the screen open while importing. Stop takes effect after the active package
read or chapter finishes; already imported chapters remain. Re-select the same ZIP
to continue. A package is temporarily cached on the phone and removed when the
import closes. No PC pairing, public sharing link, OAuth client ID or broad storage
permission is needed. Google Drive must be available in the device's document picker.

## Configurable concurrent chapter generation

`CHAPTER_WORKERS = 2` near the top of cell 4 is the default. Change it to 1 for
serial generation / lower memory, or another integer up to 8 for an experiment.
The parallel-chapter prompt defaults to this setting: press Enter for 2, or enter
1–8 for the current batch. The batch chapter count and parallel worker count are separate.
Each worker has its own Kokoro pipeline, tokenizer state, and CUDA stream.
CPU pronunciation calls are serialized to protect shared speech backends; GPU
inference runs outside that lock.
This is concurrent independent inference, not a padded batch passed into the
single-sequence model. Voice, speed, chapter text and WAV/timing publication remain
the same. GPU allocation/utilization metrics are device-wide across the workers.

Slot progress bars show the concurrent chapters. CPU encoding and Drive publication
remain in the parent flow, with one Drive-save worker and one catalog/history
writer. Prepared chapters can finish out of order internally, but verified catalog
publication follows the selected range order. Local lookahead is bounded by the
worker count. Verified existing audio is skipped before models are loaded.

The optional session budget stops starting new GPU work when reached, then allows
already-started chapters to save. Interrupt stops lookahead, waits for active
workers to reach a passage boundary, and cleans local partial files. Model startup
or an in-flight CUDA call may delay cancellation. A memory error is reported; use
1 worker and rerun to skip already verified chapters.

Two workers are not guaranteed to beat one on a busy T4. Compare batch elapsed
time and audio seconds/second on the same range/voice, and listen to samples.
Concurrent scheduling can change floating-point/random details; exact PCM equality
is not promised. Automated tests cover independent workers, overlap, out-of-order
completion, catalog preservation, resume, failures, and budget behavior using test
renderers. Real T4 throughput/audio quality still requires an actual Colab run.
