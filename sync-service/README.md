# Local chapter audio sync

This service generates complete Kokoro chapters on your PC and transfers them to Android over your home network. Android plays verified local WAV files without running the phone TTS model. Internal text passages are used for generation and measured text cues; **the transfer, checkpoint and playback publication unit is a whole chapter**.

## Start on this PC

Dependencies are installed in `.venv`. Run from PowerShell:

```powershell
cd K:\Projects\my-ultimate-app-all\sync-service
.\start.ps1
```

The first chapter loads Kokoro. `auto` selects NVIDIA CUDA when available; `-Device cpu` explicitly selects CPU. This PC's GTX 1050 Ti was tested with PyTorch 2.6.0 CUDA 12.4. Keep this combination for Pascal GPUs. Initial setup on another PC requires Python 3.10–3.12 and `./setup.ps1 -Python <python.exe>`; public model assets download on first use. AMD/Intel GPU acceleration is not implemented.

## Pair Android

1. Install the new APK and connect phone and PC to the same local network.
2. Open a book in Listen, select Kokoro, and open **Local PC chapter sync**. Alternatively use Settings → Local PC chapter sync to pair first.
3. Discover/select the PC, then paste the pairing code printed by the service. You can also scan `.state/pairing.png` with the phone camera to open the pairing screen. The code expires 30 minutes after startup; restart the service to reopen pairing.
4. If discovery is blocked by your router, enter the PC's local IPv4 address manually. Allow Python on the **Private** network in Windows Firewall when prompted (TCP 8766 and multicast DNS UDP 5353). Discovery tracks the same service identity when its IP changes.
5. Choose chapter count (1–50), current chapter or after the last successfully downloaded chapter, and tap Sync. Automatic mode queues a rolling window when chapters advance and retries outstanding transfers in the background.

The Android service starts after chapter text preparation finishes. Keep Listen open until the batch is queued. The PC must remain awake and the service running. Android schedules background retries approximately every 15 minutes, subject to OS/battery delays; reopening Listen retries sooner. Force-stopping the app requires reopening it. A separate transfer notification appears while syncing; playback still uses one media notification.

## Completion and recovery

Each chapter is generated to a temporary file, then atomically published. Android resumes interrupted downloads, verifies SHA-256, file size, WAV format and measured cue timings, and atomically stores the complete chapter. Only then does the successful chapter checkpoint advance. Playback prefers this file and preserves the saved position; highlighting uses measured passage boundaries with estimated timing within each passage, rather than word-level alignment. No partial audio chapter is exposed to playback.

PC mode disables phone synthesis by default to reduce battery use. Enable **Allow phone generation** if desired. Existing downloaded chapters play offline. Voice-specific cache identities prevent using the wrong voice; changing voice while a synced chapter plays affects a subsequent chapter/new sync. Re-cache invalidates that chapter on Android and requests a fresh verified transfer. PC jobs reuse completed audio of identical text/voice settings.

## Privacy and storage

Pairing uses a pinned TLS certificate, and paired tokens are encrypted with Android Keystore. Only selected chapter text is sent to the paired PC; production login credentials stay on the phone. The Python service does not send chapter text to a cloud TTS provider. Keep `.state` private: it contains pairing credentials, chapter job text and generated audio. QR/code files grant pairing access during the pairing window. Neither `.state` nor `.venv` is tracked in Git.

Downloaded chapter WAV files persist on Android until explicitly re-cached or app data is removed. PC audio persists in `.state`; monitor free disk space for large libraries. Chapters are limited to 250,000 characters and 200 MB of PCM audio. Pause stops mobile transfers; an already generating PC chapter may finish and be reused on resume. This is a LAN service; do not expose its port to the internet.

## Terminal progress and history

Run `./start.ps1` to see an in-place terminal progress bar updated every five seconds, including model startup,
current chapter/passages, chapter and batch percentages, elapsed time, ready/failed counts,
and queued chapters. A generation batch groups the queued chapters for one phone, book,
and voice; more queued chapters join while it runs. A batch summary records total time.
Failed chapters count as attempted work in the batch percentage and are listed separately.
Progress refreshes the same line and fits the terminal width. Chapter titles, completions,
warnings, and errors print once as ordinary messages. Redirected output keeps these
milestones without carriage-return bars or repeated progress lines; history files still
retain every progress update.

The service also logs archive packaging, transfer progress/resumes, and the phone's
verification acknowledgement. "Sent" means the PC finished sending; "verified" is only
printed after the phone acknowledges the saved chapter.

History is appended to daily files inside `.state/logs/`:

- `sync-YYYY-MM-DD.log`: readable terminal events and full error tracebacks.
- `history-YYYY-MM-DD.jsonl`: structured timestamps, durations, progress, and outcomes.

Times use Asia/Kolkata. Files persist across restarts and are excluded from Git.
They contain chapter titles and identifiers, but never paragraph bodies, bearer tokens,
or pairing secrets. The pairing code remains a terminal-only startup message and its
existing dedicated pairing file. Monitor disk usage if keeping history indefinitely.

The known upstream PyTorch single-layer dropout and legacy weight-normalization warnings
are recorded as brief non-fatal compatibility notices. Inference behavior is unchanged;
unexpected warnings remain visible, and actual errors include tracebacks in the history.
After updating service code, restart it after the active generation finishes to enable
the new output. Completed audio and pairing credentials are retained.

## CUDA memory on small GPUs

The service returns unused CUDA allocator cache at passage boundaries on GPUs with
6 GB or less VRAM, and under high reserved-memory pressure on larger GPUs. It also
cleans unused cache at chapter boundaries. Model weights remain loaded. This avoids
unused allocations accumulating past the dedicated-memory budget on Windows and
slowing generation through shared system memory. Voice, precision, speed, sample
rate and chapter publication remain unchanged.

Chapter completion history includes `gpu_memory` diagnostics: live and reserved MiB,
peak allocations, cache cleanup count/time, and any cleanup error. Cache management
failure is recorded without discarding otherwise completed audio. See PERFORMANCE.md
for the full-chapter reproduction and measured results.

## Independent Google Colab conversion

Upload [Drive_Chapter_Audio.ipynb](colab/Drive_Chapter_Audio.ipynb) to Colab to convert
EPUB books or TXT/JSON chapters from Google Drive and save verified WAV/MP3 audio back to Drive.
The self-contained notebook prompts for chapter range, voice and output format,
shows progress bars, saves history and skips completed chapters when rerun.
See [input examples and instructions](colab/README.md). No running PC sync service
or mobile pairing is required; this does not import audio into the app cache.

## Verification

See [the measured performance investigation](PERFORMANCE.md) for CPU/GPU timings,
tested inference settings, delivery bottlenecks, and the isolated `benchmark.py` tool.

```powershell
.venv/Scripts/python.exe -m unittest discover -s tests -v
```

The HTTPS tests cover pairing/authentication, whole-chapter publication, range transfer, hash acknowledgement, owner isolation, restart recovery and invalid input. A synthetic chapter was also rendered on the actual NVIDIA GPU. Android integration requires the new native APK; an OTA JavaScript update alone is insufficient.

## Android 1.1.17 playback and delivery

Listen queues contiguous verified PC chapters in Android's existing media session. A native watcher adds newly downloaded chapters while the screen is locked, without a JavaScript screen controller. Playback-scoped CPU wake management, lock-screen metadata and private chapter/time checkpoints support background playback. Listen adopts the playing chapter and measured text cues when reopened. Explicit Pause and sleep timers are respected. Force-stop or leaving the Listen route ends the player.

A gap of less than 4 chapters from the current chapter uses individual downloads. Android 1.1.21 transfers ready distant chapters in resumable ZIP groups of up to three while the PC generates the remaining chapters. Archive membership is persisted so a reconnect resumes the same bytes even when additional chapters become ready. If playback catches up while generation is pending, nearby chapters return to individual delivery. Every extracted chapter still passes identity, timing, WAV and SHA-256 verification before publication.

Batch status uses one small request every three seconds. Archives are limited to 2 GB and need temporary storage on both devices. Reduce chapter count if storage is insufficient. Pause preserves the partial archive. PC archives persist in .state; monitor disk usage for large libraries.

The screen shows overall and current generation/download progress, saved/remaining counts, voice and a chapter queue. Saved means the complete chapter is verified on Android. Connection management collapses after pairing. Whole-chapter publication remains unchanged.

## Android 1.1.21 connection and retention

Pairing and reachability are displayed separately. While the sync screen is open,
short authenticated health checks run every ten seconds and when the app returns
to the foreground. Failed connections show retry timing; network failures retry
after 5, 10 and 20 seconds before waiting for the next scheduled attempt or manual
reconnect. Authentication failures require pairing again; storage/generation errors
are shown separately from network disconnects. Reconnect reuses the saved credentials,
rediscovers a changed PC address, and resumes queued/partial transfers without
enabling automatic sync. An optional manual IP can be entered in connection details.

The completion percentage counts verified files only. Chapter generation, download
bytes and verification have separate status. Preferences do not overwrite a transfer
status, and book/account/voice scopes prevent unrelated jobs from driving its progress.

Phone retention follows actual native playback checkpoints, including playback with
the screen locked: retain the current chapter, its previous ten chapters, and every
downloaded chapter ahead. For example, while playing chapter 25, chapters 15–24 and
25 onward are retained; chapters 1–14 can be removed. Cleanup is scoped to that
account and book, across voices, and only deletes files in the owned audio directory.
Other books and PC-side cached audio are retained. The currently playing file is
protected even if its metadata index disagrees. The screen reports offline storage.
