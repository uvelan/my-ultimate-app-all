package com.uvelan.ultimateapp

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.uimanager.ViewManager
import java.util.concurrent.Executors

class RoutineReminderPackage : ReactPackage {
    @Suppress("OVERRIDE_DEPRECATION")
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
        listOf(RoutineReminderModule(reactContext))

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}

internal class RoutineReminderModule(private val context: ReactApplicationContext) :
    ReactContextBaseJavaModule(context) {
    private val reminder = RoutineReminder(context)
    private val history = RoutineReminderHistory(context)

    override fun getName() = "RoutineReminder"

    @ReactMethod
    fun getState(promise: Promise) = runOnMain(promise) {
        val notificationSettings = reminder.notificationSettings()
        Arguments.createMap().apply {
            putBoolean("notificationsEnabled", notificationSettings == null)
            putBoolean("progressNotificationsEnabled", reminder.notificationSettings(progress = true) == null)
            putBoolean("exactAlarmsEnabled", reminder.canSchedule())
            putBoolean("vibrationEnabled", reminder.canVibrate())
            putArray("presets", Arguments.createArray().apply {
                for (preset in reminder.presets()) {
                    pushMap(Arguments.createMap().apply {
                        putString("id", preset.id)
                        putString("title", preset.title)
                        putString("message", preset.message)
                        putInt("durationMinutes", preset.durationMinutes)
                        putInt("extensionMinutes", preset.extensionMinutes)
                        putInt("intervalMinutes", preset.intervalMinutes)
                        putBoolean("routineEnabled", preset.routineEnabled)
                    })
                }
            })
            putArray("runs", Arguments.createArray().apply {
                for (run in reminder.current()) {
                    pushMap(Arguments.createMap().apply {
                        putString("id", run.id)
                        putString("sessionId", run.sessionId)
                        putString("presetId", run.preset.id)
                        putString("title", run.preset.title)
                        putString("message", run.preset.message)
                        putInt("extensionMinutes", run.preset.extensionMinutes)
                        putInt("intervalMinutes", run.preset.intervalMinutes)
                        putBoolean("finished", run.finished)
                        val remaining = (run.endElapsed - android.os.SystemClock.elapsedRealtime()).coerceAtLeast(0)
                        putDouble("endsAt", (System.currentTimeMillis() + remaining).toDouble())
                    })
                }
            })
        }
    }

    @ReactMethod
    fun savePreset(
        id: String, title: String, message: String, durationMinutes: Int, extensionMinutes: Int,
        intervalMinutes: Int, routineEnabled: Boolean, promise: Promise,
    ) = runOnMain(promise) {
        reminder.savePreset(ReminderPreset(id, title.trim(), message.trim(), durationMinutes, extensionMinutes, intervalMinutes, routineEnabled))
    }

    @ReactMethod
    fun deletePreset(id: String, promise: Promise) = runOnMain(promise) { reminder.deletePreset(id) }

    @ReactMethod
    fun getHistory(from: Double, to: Double, selectedId: String?, promise: Promise) = runOnMain(promise) {
        reminder.current()
        history.query(from.toLong(), to.toLong(), selectedId)
    }

    @ReactMethod
    fun bindHistoryAccount(userId: String, promise: Promise) = runOnMain(promise) { history.bind(userId) }

    @ReactMethod
    fun configureHistory(userId: String, endpoint: String, token: String, expiresAt: Double, promise: Promise) =
        runOnMain(promise) { history.configure(userId, endpoint, token, expiresAt.toLong()) }

    @ReactMethod
    fun clearHistoryAccount(promise: Promise) = runOnMain(promise) { history.clearAccount() }

    @ReactMethod
    fun retryHistorySync(promise: Promise) = runOnMain(promise) { history.retryFailed() }

    @ReactMethod
    fun syncShortcuts(promise: Promise) {
        UiThreadUtil.runOnUiThread {
            try {
                val presets = reminder.presets()
                shortcutWorker.execute {
                    try {
                        val state = RoutineReminderShortcuts.sync(context, presets)
                        promise.resolve(Arguments.createMap().apply {
                            putInt("limit", state.limit)
                            putBoolean("retry", state.retry)
                            putArray("published", Arguments.createArray().apply { state.published.forEach(::pushString) })
                        })
                    } catch (error: Exception) {
                        promise.reject("ROUTINE_SHORTCUTS", error)
                    }
                }
            } catch (error: Exception) {
                promise.reject("ROUTINE_SHORTCUTS", error)
            }
        }
    }

    @ReactMethod
    fun start(id: String, promise: Promise) = runOnMain(promise) { reminder.start(id) }

    @ReactMethod
    fun stop(id: String, promise: Promise) = runOnMain(promise) { reminder.handle(RoutineReminder.STOP, id) }

    @ReactMethod
    fun extend(id: String, promise: Promise) = runOnMain(promise) { reminder.handle(RoutineReminder.EXTEND, id) }

    @ReactMethod
    fun openSettings(kind: String, promise: Promise) = runOnMain(promise) {
        val intent = when (kind) {
            "alarms" -> Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${context.packageName}"))
            "vibration" -> channelSettings(RoutineReminder.FINISHED_CHANNEL)
            "progress" -> notificationSettings(progress = true)
            else -> notificationSettings()
        }
        context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    private fun notificationSettings(progress: Boolean = false): Intent {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
        }
        val blocked = reminder.notificationSettings(progress)
        return if (blocked == null || blocked == Settings.ACTION_APP_NOTIFICATION_SETTINGS) {
            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
        } else {
            channelSettings(blocked)
        }
    }

    private fun channelSettings(channel: String) = Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
        .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
        .putExtra(Settings.EXTRA_CHANNEL_ID, channel)

    private fun runOnMain(promise: Promise, block: () -> Any?) {
        UiThreadUtil.runOnUiThread {
            try {
                val result = block()
                promise.resolve(if (result == Unit) null else result)
            } catch (error: Exception) {
                promise.reject("ROUTINE_REMINDER", error)
            }
        }
    }

    companion object {
        private val shortcutWorker = Executors.newSingleThreadExecutor()
    }
}
