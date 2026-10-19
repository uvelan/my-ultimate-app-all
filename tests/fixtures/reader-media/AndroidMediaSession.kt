package android.media.session
import android.content.Context
import android.content.Intent
import android.media.MediaMetadata
import android.os.Handler
class MediaSession(context: Context, tag: String) {
    companion object { const val FLAG_HANDLES_MEDIA_BUTTONS = 1; const val FLAG_HANDLES_TRANSPORT_CONTROLS = 2; var latest: MediaSession? = null; var count = 0 }
    init { latest = this; count++ }
    var isActive = false
    var released = false
    var installedCallback: Callback? = null
    var metadataSnapshot: MediaMetadata? = null; private set
    var state: PlaybackState? = null; private set
    fun setFlags(flags: Int) {}
    fun setCallback(callback: Callback?, handler: Handler? = null) { installedCallback = callback }
    fun setMetadata(value: MediaMetadata) { metadataSnapshot = value }
    fun setPlaybackState(value: PlaybackState) { state = value }
    fun release() { released = true }
    open class Callback {
        open fun onPlay() {}; open fun onPause() {}; open fun onSkipToNext() {}; open fun onSkipToPrevious() {}; open fun onStop() {}
        open fun onMediaButtonEvent(intent: Intent): Boolean = false
    }
}
class PlaybackState(val actions: Long, val state: Int, val speed: Float) {
    companion object {
        const val ACTION_PLAY = 1L; const val ACTION_PAUSE = 2L; const val ACTION_PLAY_PAUSE = 4L
        const val ACTION_SKIP_TO_NEXT = 8L; const val ACTION_SKIP_TO_PREVIOUS = 16L; const val ACTION_STOP = 32L
        const val STATE_PLAYING = 3; const val STATE_PAUSED = 2; const val PLAYBACK_POSITION_UNKNOWN = -1L
    }
    class Builder {
        private var actions = 0L; private var state = 0; private var speed = 0f
        fun setActions(value: Long) = apply { actions = value }
        fun setState(value: Int, position: Long, rate: Float, updatedAt: Long) = apply { state = value; speed = rate }
        fun build() = PlaybackState(actions, state, speed)
    }
}
