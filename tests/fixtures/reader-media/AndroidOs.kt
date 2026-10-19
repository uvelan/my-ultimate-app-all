package android.os
class Looper { companion object { fun getMainLooper() = Looper() } }
class Handler(looper: Looper) { fun post(block: () -> Unit): Boolean { block(); return true } }
object SystemClock { fun elapsedRealtime() = 12345L }
class PowerManager {
    companion object { const val PARTIAL_WAKE_LOCK = 1 }
    val locks = mutableListOf<WakeLock>()
    fun newWakeLock(level: Int, tag: String) = WakeLock().also { locks.add(it) }
    class WakeLock {
        var isHeld = false; private set
        var usesReferenceCounting = true; private set
        var acquisitions = 0; private set
        var releases = 0; private set
        fun setReferenceCounted(value: Boolean) { usesReferenceCounting = value }
        fun acquire() { isHeld = true; acquisitions++ }
        fun release() { isHeld = false; releases++ }
    }
}
