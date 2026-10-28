package com.uvelan.ultimateapp

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build
import java.util.concurrent.atomic.AtomicBoolean

/** Device-local crash information. Nothing is uploaded or sent to an audio provider. */
object PlaybackDiagnostics {
    private val installed = AtomicBoolean(false)
    private const val STORE = "playback-diagnostics"

    fun install(context: Context) {
        if (!installed.compareAndSet(false, true)) return
        val application = context.applicationContext
        val previous = Thread.getDefaultUncaughtExceptionHandler() ?: return
        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            try {
                application.getSharedPreferences(STORE, Context.MODE_PRIVATE).edit()
                    .putLong("time", System.currentTimeMillis())
                    .putString("error", "Android exception on ${thread.name}\n${error.stackTraceToString().take(24000)}")
                    .commit()
            } catch (_: Throwable) { /* Never interfere with Android's original crash handling. */ }
            previous.uncaughtException(thread, error)
        }
    }

    fun latest(context: Context): String? {
        val preferences = context.getSharedPreferences(STORE, Context.MODE_PRIVATE)
        val dismissed = preferences.getLong("dismissed", 0L)
        var time = preferences.getLong("time", 0L)
        var message = preferences.getString("error", null)
        if (Build.VERSION.SDK_INT >= 30) {
            try {
                val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
                val exit = manager.getHistoricalProcessExitReasons(context.packageName, 0, 10)
                    .filter { it.reason in listOf(ApplicationExitInfo.REASON_CRASH, ApplicationExitInfo.REASON_CRASH_NATIVE,
                        ApplicationExitInfo.REASON_LOW_MEMORY, ApplicationExitInfo.REASON_ANR) }
                    .maxByOrNull { it.timestamp }
                if (exit != null && exit.timestamp > time &&
                    (exit.reason != ApplicationExitInfo.REASON_CRASH || message.isNullOrBlank() || exit.timestamp - time > 10000)) {
                    time = exit.timestamp
                    val reason = when (exit.reason) {
                        ApplicationExitInfo.REASON_CRASH_NATIVE -> "Native crash (signal ${exit.status})"
                        ApplicationExitInfo.REASON_LOW_MEMORY -> "Android stopped the app because memory was low"
                        ApplicationExitInfo.REASON_ANR -> "Android stopped an unresponsive app"
                        else -> "Android app exception"
                    }
                    message = "$reason\n${exit.description.orEmpty()}\nMemory at exit: ${exit.pss} KB"
                }
            } catch (_: Exception) { /* Older/vendor Android builds may not expose exit history. */ }
        }
        if (time <= dismissed || System.currentTimeMillis() - time > 7 * 24 * 60 * 60 * 1000L || message.isNullOrBlank()) return null
        return "${java.util.Date(time)}\n$message"
    }

    fun dismiss(context: Context) {
        context.getSharedPreferences(STORE, Context.MODE_PRIVATE).edit()
            .putLong("dismissed", System.currentTimeMillis()).remove("error").remove("time").apply()
    }
}
