# PC audio sync improvements in 1.1.21

The connection card now distinguishes a paired PC from one that is reachable and
authenticated. Health checks run while the screen is visible and on foreground
return. They have short timeouts, do not overlap, and show disconnect/authentication
failures instead of silently retaining an old success state.

Reconnect uses the stored credentials and pinned PC identity, rediscovers a changed
address, resumes queued work, and preserves the automatic-sync preference. A manual
IP remains available. Invalid credentials open pairing controls instead. Interrupted
network operations retain job IDs and partial files; retries occur after 5, 10 and
20 seconds. Server, generation and storage errors are distinct from disconnects.

Saved counts and the overall completion percentage use verified phone files, not
estimated generation percentages. The current operation has separate generation,
download-byte and verification status. Missing files do not count as saved. Status
includes account/book/voice and the actual queued range, so changing preferences or
reopening a screen cannot substitute unrelated work or a stale selected range. A
persisted active phase with no running worker is shown as needing resume.
Older completed jobs recover missing book/voice metadata from their matching saved
artifacts, so upgrading does not make the queue appear empty.

Nearby chapters download individually. Ready distant chapters transfer in ZIP groups
of up to three while the PC generates the remainder. Exact archive membership is
persisted across reconnects, including partially committed groups, so additional
ready chapters cannot change the archive being resumed. Existing PC endpoints support
this without an API upgrade. Whole-chapter identity, timing, format and hash checks
still precede publication.

Native playback checkpoints trigger phone cleanup even while the screen is locked.
Keep the current chapter, ten preceding chapters, and all downloaded chapters ahead.
For chapter 25, retain chapters 15–24 and chapter 25 onward; remove chapters 1–14.
Cleanup applies only to that account and book, across voices, inside the owned audio
folder. It protects the actual playing file, removes corresponding cache/queue
records, and drops obsolete previous playlist entries. Other books and PC audio stay
available. Storage shown in the screen is the verified saved-audio size.

## Validation

- TypeScript checks and targeted sync/listening/playback tests.
- Actual Kotlin JVM retention tests: boundary, future chapters, account/book isolation,
  playing-file protection, negative indices, and paths outside the owned folder.
- HTTPS service test: transfer a ready subset while other chapters stay queued;
  generating another chapter cannot change the resumed archive or its bytes.
- Signed ARM64 Android release build, version 1.1.21, version code 25.

Physical-device checks remain necessary: interrupt Wi-Fi mid-transfer, restart the
PC service, reconnect after a changed PC IP, resume a paused batch, and advance
through chapter 25 with the screen locked to verify cleanup and uninterrupted audio.
