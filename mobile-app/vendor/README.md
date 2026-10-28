# Offline narration runtime

`withKokoro` downloads the official Sherpa ONNX v1.12.23 Android AAR during Expo prebuild and verifies its SHA-256 before use. The binary is not checked into Git. Both the AAR and Kotlin API are pinned to the same version; updating one requires updating the other.

Runtime: https://github.com/k2-fsa/sherpa-onnx/releases/tag/v1.12.23

The Android app downloads the official quantized Kokoro v1.0 model only when the user selects Download voice model. It verifies the archive SHA-256 and installs it atomically in private app storage. Chapter text is synthesized locally; it is never sent to a server by the Kokoro provider. The voice IDs are from the **v1.0** catalog: `af_heart = 3`, `af_bella = 2`. The v1.1 catalog has different voices and must not be substituted.

Model: https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-int8-multi-lang-v1_0.tar.bz2

Sherpa ONNX and Kokoro are Apache-2.0. See the upstream source and model LICENSE files. The runtime also incorporates third-party components, including ONNX Runtime and eSpeak NG; their notices and source links are retained in `plugins/kokoro/NOTICE.md`.

## Android callback compatibility

Sherpa 1.12.23 looks up the exact JNI method `invoke([F)Ljava/lang/Integer;`. Kotlin 2 invokedynamic lambdas expose a generic method instead. The native library then calls JNI with a pending `NoSuchMethodError`, which aborts Android with signal 6. Use the tracked `KokoroCallback` concrete class and retain its ProGuard rule; do not replace it with an inline lambda.

The regression check in `tests/mobile-kokoro-native.test.cjs` reflects the exact signature and verifies continue/cancel return values. An Android 36.1 x86_64 emulator reproduced the old crash using the pinned AAR and real quantized model. With the concrete callback, the same test generated female Heart speech, stopped generation after a cancellation callback, and completed WAV playback without a native abort. This validates the Android JNI path; physical-device playback remains a separate check.

## Progressive Android playback

Listen settings offer a saved target of 200–2,000 characters (default 1,000). Narration groups whole paragraphs around this soft target. Individual paragraphs remain intact up to the 4,000-character native limit; longer paragraphs continue at sentence/word boundaries without dropping text. Targets apply on the next chapter or an explicit re-cache and are included in Kokoro cache identities. Kokoro emits one immutable, finalized WAV per text chunk while also appending the same PCM to the final chapter WAV. Listen queues these pieces immediately; it keeps playing the current piece when the complete chapter enters the cache. Playback positions use cumulative PCM sample counts, and only generated audio can be sought. Sentence highlighting inside each measured chunk still uses estimated sentence weights, rather than word-level forced alignment. Temporary pieces are deleted when their chapter request is cancelled or left. Reader and Listen settings link to a separate Diagnostics screen for device-local crash reports and the latest 100 audio events; chapter text and credentials are excluded from event logs.

## Battery and voice handoffs

Foreground Kokoro synthesis waits for Play, then maintains at most two upcoming chunks. Pausing sets its work budget to zero; a monitor sleeps between chunks without polling. Android severe thermal warnings also suspend synthesis. CPU synthesis runs at background scheduling priority with the established two-thread configuration; hardware-specific energy savings have not been measured on an S25 Ultra. Kokoro does not pre-generate the next chapter. Reader releases its display wake lock on blur. Listen uses Expo's foreground MediaSession notification without an additional Notifee card; Reader retains its TTS notification.

Voice changes checkpoint exact PCM through the playing chunk, discard upcoming old-voice queue entries, and generate only the remaining text. Cached chapters can be split into measured WAV passages locally while preserving position. The merged mixed-voice session is temporary and never overwrites a uniform-voice cache entry.

## Resume after app closure

Generated Kokoro WAVs live in private persistent app storage. Resume metadata pins the selected book's generated chunks and final chapter file, keeps a small playback cursor (throttled to two-second writes with immediate pause/background/unmount flushes), and restores the current passage before playback. Partial chapters rebuild a PCM prefix from saved chunks and synthesize only the remaining text. A saved chunk plan survives changes to the preferred target; explicit Re-cache clears the bookmark and applies the new target. Resume history retains at most five books within a 200 MB budget, with the current chapter protected. Completed bookmarks release temporary pieces when a full chapter file is available.
