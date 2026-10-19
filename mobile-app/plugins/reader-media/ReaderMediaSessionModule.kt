package com.uvelan.ultimateapp

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.view.KeyEvent
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

/** Reader TTS only. The audiobook player retains its own audio/media session. */
class ReaderMediaSessionModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    private val main = Handler(Looper.getMainLooper())
    private var session: MediaSession? = null
    private var wakeLock: PowerManager.WakeLock? = null
    @Volatile private var destroyed = false

    override fun getName() = "ReaderMediaSession"

    private fun emit(action: String) {
        if (destroyed || session?.isActive != true || !reactApplicationContext.hasActiveReactInstance()) return
        val event = Arguments.createMap()
        event.putString("action", action)
        reactApplicationContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("ReaderMediaAction", event)
    }

    @Suppress("DEPRECATION")
    private fun createSession(): MediaSession {
        val created = MediaSession(reactApplicationContext, "UltimateReaderTts")
        created.setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS or MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS)
        created.setCallback(object : MediaSession.Callback() {
            private fun dispatch(action: String) {
                if (destroyed || session !== created || !created.isActive) return
                if (action == "pause" || action == "stop") releaseWakeLock()
                emit(action)
                if (action == "stop") deactivateNow()
            }
            override fun onPlay() { dispatch("play") }
            override fun onPause() { dispatch("pause") }
            override fun onSkipToNext() { dispatch("next") }
            override fun onSkipToPrevious() { dispatch("prev") }
            override fun onStop() { dispatch("stop") }
            override fun onMediaButtonEvent(intent: Intent): Boolean {
                if (destroyed || session !== created || !created.isActive) return false
                val key = intent.getParcelableExtra<KeyEvent>(Intent.EXTRA_KEY_EVENT) ?: return super.onMediaButtonEvent(intent)
                val action = when (key.keyCode) {
                    KeyEvent.KEYCODE_MEDIA_PLAY -> "play"
                    KeyEvent.KEYCODE_MEDIA_PAUSE -> "pause"
                    KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, KeyEvent.KEYCODE_HEADSETHOOK -> "toggle"
                    KeyEvent.KEYCODE_MEDIA_NEXT -> "next"
                    KeyEvent.KEYCODE_MEDIA_PREVIOUS -> "prev"
                    KeyEvent.KEYCODE_MEDIA_STOP -> "stop"
                    else -> return super.onMediaButtonEvent(intent)
                }
                if (key.action == KeyEvent.ACTION_DOWN && key.repeatCount == 0) {
                    dispatch(action)
                }
                return true // Key-up/repeats must not dispatch a second toggle.
            }
        }, main)
        return created
    }

    @ReactMethod
    fun update(title: String, chapter: String, isPlaying: Boolean, rate: Double) {
        main.post {
            if (destroyed) return@post
            val active = session ?: createSession().also { session = it }
            active.setMetadata(MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, chapter)
                .putString(MediaMetadata.METADATA_KEY_ALBUM, title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, title)
                .putString(MediaMetadata.METADATA_KEY_DISPLAY_TITLE, title)
                .putString(MediaMetadata.METADATA_KEY_DISPLAY_SUBTITLE, chapter).build())
            val speed = if (rate.isFinite() && rate > 0 && rate <= 4) rate.toFloat() else 1f
            active.setPlaybackState(PlaybackState.Builder()
                .setActions(PlaybackState.ACTION_PLAY or PlaybackState.ACTION_PAUSE or PlaybackState.ACTION_PLAY_PAUSE or
                    PlaybackState.ACTION_SKIP_TO_NEXT or PlaybackState.ACTION_SKIP_TO_PREVIOUS or PlaybackState.ACTION_STOP)
                .setState(if (isPlaying) PlaybackState.STATE_PLAYING else PlaybackState.STATE_PAUSED,
                    PlaybackState.PLAYBACK_POSITION_UNKNOWN, if (isPlaying) speed else 0f, SystemClock.elapsedRealtime()).build())
            active.isActive = true
            if (isPlaying) acquireWakeLock() else releaseWakeLock()
        }
    }

    // Notifee's foreground service keeps the process important, but its native
    // HeadlessTask implementation does not acquire RN's CPU wake lock.
    @SuppressLint("WakelockTimeout")
    private fun acquireWakeLock() {
        val lock = wakeLock ?: (reactApplicationContext.getSystemService(Context.POWER_SERVICE) as PowerManager)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ultimateapp:reader-tts")
            .also { it.setReferenceCounted(false); wakeLock = it }
        if (!lock.isHeld) lock.acquire()
    }

    private fun releaseWakeLock() {
        wakeLock?.let { if (it.isHeld) it.release() }
    }

    private fun deactivateNow() {
        releaseWakeLock()
        session?.let { it.isActive = false; it.setCallback(null); it.release() }
        session = null
    }

    @ReactMethod
    fun deactivate() { main.post { deactivateNow() } }

    override fun invalidate() {
        destroyed = true
        main.post { deactivateNow() }
        super.invalidate()
    }
}
