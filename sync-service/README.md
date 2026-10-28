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

## Verification

```powershell
.venv/Scripts/python.exe -m unittest discover -s tests -v
```

The HTTPS tests cover pairing/authentication, whole-chapter publication, range transfer, hash acknowledgement, owner isolation, restart recovery and invalid input. A synthetic chapter was also rendered on the actual NVIDIA GPU. Android integration requires the new native APK; an OTA JavaScript update alone is insufficient.

## Android 1.1.17 playback and delivery

Listen queues contiguous verified PC chapters in Android's existing media session. A native watcher adds newly downloaded chapters while the screen is locked, without a JavaScript screen controller. Playback-scoped CPU wake management, lock-screen metadata and private chapter/time checkpoints support background playback. Listen adopts the playing chapter and measured text cues when reopened. Explicit Pause and sleep timers are respected. Force-stop or leaving the Listen route ends the player.

A gap of less than 4 chapters from the current chapter uses individual downloads. At a gap of 4 or more, the PC generates the distant batch first, then transfers one resumable ZIP. If playback catches up while generation is pending, nearby chapters return to individual delivery. Every extracted chapter still passes identity, timing, WAV and SHA-256 verification before publication. Re-queue older pending transfers through Sync to apply this policy.

Batch status uses one small request every three seconds. Archives are limited to 2 GB and need temporary storage on both devices. Reduce chapter count if storage is insufficient. Pause preserves the partial archive. PC archives persist in .state; monitor disk usage for large libraries.

The screen shows overall and current generation/download progress, saved/remaining counts, voice and a chapter queue. Saved means the complete chapter is verified on Android. Connection management collapses after pairing. Whole-chapter publication remains unchanged.
