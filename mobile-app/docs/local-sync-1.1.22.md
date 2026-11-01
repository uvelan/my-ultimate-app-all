# Pause transfers fix — 1.1.22

Pause previously went through the same busy-action guard as chapter preparation,
so tapping it during a lengthy preparation did nothing. It also only set a native
flag: a blocked socket read could continue waiting for its 30–120 second timeout.
Late preparation could subsequently enqueue work and clear that pause flag.

The pause action now bypasses the busy guard, cancels the current preparation,
disables automatic sync immediately, and displays pausing/paused feedback. Old
preparation, snapshots and progress events cannot restore an active phase. A new
explicit Sync or Reconnect is required to resume.

Native cancellation closes active transfer sockets and invalidates the worker's
revision permanently. An old enqueue/reconnect/scheduling task cannot clear pause;
an old worker cannot make requests or publish progress after a quick resume. A
foreground service uses its Android start ID when stopping, so the old operation
cannot stop a newly resumed service. Hashing, extraction and publication also check
for cancellation. Partial downloads, verified audio and playback are retained.

Pause affects phone transfers. It does not cancel chapter generation already queued
on the PC; generated chapters remain reusable when transfers resume.

Regression tests cover a native blocked read, rapid pause/resume, stale work,
preservation of files, a failed persistence callback, a slow chapter fetch and a
snapshot arriving after pause. Actual device Wi-Fi and service-lifecycle testing
remains necessary.
