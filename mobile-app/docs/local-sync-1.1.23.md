# Reuse an active sync — 1.1.23

Starting sync is idempotent while its current worker is running or requested.
Repeated taps, automatic updates and reconnect calls reuse that worker rather than
launching more foreground services or workers waiting to run again afterward.
New chapters can still be added to its queue. Existing pending chapters keep their
batch/archive membership and progress; automatic preparation skips queued chapters.

Idle queue inspection and worker retirement are atomic relative to a start request,
so work arriving just as a run completes is still handled. Run ownership is unique:
an old worker's cleanup cannot clear a replacement worker. After Pause, only one
resume request waits for the cancelled worker to exit; the pause guarantees remain.

The UI preserves the real phase and percentage when work joins an active run.
Tests exercise simultaneous native start calls, duplicate calls during a run,
idle handoff, cancellation/resume, queue reuse and avoiding redundant preparation.
