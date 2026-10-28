package com.uvelan.ultimateapp

/** Sleeps between chunks without polling or discarding completed audio. */
class KokoroGenerationGate(initialLimit: Int) {
    private val monitor = Object()
    private var limit = initialLimit.coerceAtLeast(0)
    private var hot = false
    private var cancelled = false
    @Volatile var checkpointSamples: Long? = null; private set
    fun checkpoint(samples: Long) = synchronized(monitor) { checkpointSamples = samples; monitor.notifyAll() }
    fun updateLimit(value: Int) = synchronized(monitor) { limit = value.coerceAtLeast(0); monitor.notifyAll() }
    fun updateThermal(value: Boolean) = synchronized(monitor) { hot = value; monitor.notifyAll() }
    fun cancel() = synchronized(monitor) { cancelled = true; monitor.notifyAll() }
    fun await(index: Int, waiting: (Boolean, Boolean) -> Unit) = synchronized(monitor) {
        var reported: Pair<Boolean, Boolean>? = null
        while (!cancelled && checkpointSamples == null && (hot || index >= limit)) {
            val reason = Pair(hot, limit == 0)
            if (reason != reported) { waiting(reason.first, reason.second); reported = reason }
            monitor.wait()
        }
        check(!cancelled) { "Audio generation cancelled." }
    }
}
