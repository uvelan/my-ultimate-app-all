package com.uvelan.ultimateapp
import com.facebook.react.bridge.*
import android.media.session.MediaSession
import android.view.KeyEvent
import android.content.Intent

fun main(args: Array<String>) {
    val context = ReactApplicationContext()
    val module = ReaderMediaSessionModule(context)
    var retainedCallback: MediaSession.Callback? = null
    val snapshots = mutableListOf<Any?>()
    for (command in args) {
        when (command) {
            "playing" -> module.update("Actual Book", "Chapter 1", true, 1.25)
            "playingAgain" -> module.update("Actual Book", "Chapter 2", true, 1.5)
            "paused" -> module.update("Actual Book", "Chapter 1", false, 1.25)
            "invalidRate" -> module.update("Actual Book", "Chapter 1", true, Double.NaN)
            "play" -> MediaSession.latest?.installedCallback?.onPlay()
            "pause" -> MediaSession.latest?.installedCallback?.onPause()
            "next" -> MediaSession.latest?.installedCallback?.onSkipToNext()
            "prev" -> MediaSession.latest?.installedCallback?.onSkipToPrevious()
            "stop" -> MediaSession.latest?.installedCallback?.onStop()
            "saveCallback" -> { retainedCallback = MediaSession.latest?.installedCallback }
            "oldCallback" -> retainedCallback?.onPlay()
            "toggleDown" -> MediaSession.latest?.installedCallback?.onMediaButtonEvent(Intent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE)))
            "toggleUp" -> MediaSession.latest?.installedCallback?.onMediaButtonEvent(Intent(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE)))
            "toggleRepeat" -> MediaSession.latest?.installedCallback?.onMediaButtonEvent(Intent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, 1)))
            "deactivate" -> module.deactivate()
            "invalidate" -> module.invalidate()
        }
        val session = MediaSession.latest
        snapshots.add(linkedMapOf("command" to command, "active" to session?.isActive, "released" to session?.released,
            "sessions" to MediaSession.count, "held" to context.power.locks.any { it.isHeld }, "locks" to context.power.locks.size,
            "acquisitions" to context.power.locks.sumOf { it.acquisitions }, "releases" to context.power.locks.sumOf { it.releases },
            "refCounted" to context.power.locks.firstOrNull()?.usesReferenceCounting,
            "state" to session?.state?.state, "speed" to session?.state?.speed, "actions" to session?.state?.actions,
            "metadata" to session?.metadataSnapshot?.values, "events" to context.events.toList()))
    }
    println(json(snapshots))
}
