package com.uvelan.ultimateapp

import android.app.Activity
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.provider.Settings
import android.widget.RemoteViews
import android.widget.Toast
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

internal data class ReminderPreset(
    val id: String,
    val title: String,
    val message: String,
    val durationMinutes: Int,
    val extensionMinutes: Int,
    val intervalMinutes: Int,
    val routineEnabled: Boolean,
    val group: String = "REMINDERS",
) {
    fun toJson() = JSONObject()
        .put("id", id)
        .put("title", title)
        .put("message", message)
        .put("durationMinutes", durationMinutes)
        .put("extensionMinutes", extensionMinutes)
        .put("intervalMinutes", intervalMinutes)
        .put("routineEnabled", routineEnabled)
        .put("group", group)

    companion object {
        const val ORIGINAL_ID = "original"

        fun fromJson(json: JSONObject) = ReminderPreset(
            json.optString("id", ORIGINAL_ID),
            json.getString("title"),
            json.getString("message"),
            json.getInt("durationMinutes"),
            json.getInt("extensionMinutes"),
            json.optInt("intervalMinutes"),
            json.optBoolean("routineEnabled", true),
            json.optString("group", "REMINDERS"),
        )
    }
}

internal data class ReminderRun(
    val id: String,
    val preset: ReminderPreset,
    val endElapsed: Long,
    val endWallTime: Long,
    val bootCount: Int,
    val finished: Boolean = false,
    val nextProgress: Long? = null,
    val sessionId: String = id,
) {
    fun toJson() = JSONObject()
        .put("id", id)
        .put("preset", preset.toJson())
        .put("endElapsed", endElapsed)
        .put("endWallTime", endWallTime)
        .put("bootCount", bootCount)
        .put("finished", finished)
        .put("nextProgress", nextProgress)
        .put("sessionId", sessionId)

    companion object {
        fun fromJson(json: JSONObject) = ReminderRun(
            json.getString("id"),
            ReminderPreset.fromJson(json.getJSONObject("preset")),
            json.getLong("endElapsed"),
            json.getLong("endWallTime"),
            json.getInt("bootCount"),
            json.getBoolean("finished"),
            if (json.has("nextProgress")) json.getLong("nextProgress") else null,
            json.optString("sessionId", json.getString("id")),
        )
    }
}

// The shortcut, receiver, and React module serialize timer changes on the main thread.
internal class RoutineReminder(private val context: Context) {
    private val prefs = context.getSharedPreferences("routine_reminder", Context.MODE_PRIVATE)
    private val alarms = context.getSystemService(AlarmManager::class.java)
    private val notifications = context.getSystemService(NotificationManager::class.java)
    private val history = RoutineReminderHistory(context)
    private val catalog = RoutineReminderCatalog(context)
    private val bootCount get() = Settings.Global.getInt(context.contentResolver, Settings.Global.BOOT_COUNT, -1)

    fun presets(): List<ReminderPreset> = catalog.presets()

    fun savePreset(preset: ReminderPreset, expectedOperationId: String) {
        require(preset.title.isNotBlank() && preset.title.length <= 40) { "Enter an activity name." }
        require(preset.group in setOf("PERSONAL", "OFFICE", "REMINDERS")) { "Choose an activity group." }
        require(preset.message.isNotBlank() && preset.message.length <= 180) { "Enter a completion message." }
        require(preset.durationMinutes in 1..5999) { "Enter a duration from 1 minute to 99 hours and 59 minutes." }
        require(preset.extensionMinutes in listOf(5, 10, 15, 30)) { "Choose an extension length." }
        require(preset.intervalMinutes == 0 || preset.intervalMinutes in 1 until preset.durationMinutes) {
            "Enter an interval shorter than the countdown duration."
        }
        catalog.save(preset, expectedOperationId)
    }

    fun deletePreset(id: String) {
        check(accountRuns().none { it.preset.id == id }) { "Stop this reminder before deleting it." }
        catalog.delete(id)
    }

    fun canSchedule() = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms.canScheduleExactAlarms()

    fun notificationSettings(progress: Boolean = false): String? {
        createChannels()
        if (!notifications.areNotificationsEnabled()) return Settings.ACTION_APP_NOTIFICATION_SETTINGS
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channels = if (progress) listOf(PROGRESS_CHANNEL) else listOf(COUNTDOWN_CHANNEL, FINISHED_CHANNEL)
            return channels.firstOrNull { notifications.getNotificationChannel(it).importance == NotificationManager.IMPORTANCE_NONE }
        }
        return null
    }

    fun canVibrate(): Boolean = Build.VERSION.SDK_INT < Build.VERSION_CODES.O ||
        notifications.getNotificationChannel(FINISHED_CHANNEL).shouldVibrate()

    fun start(id: String, fromShortcut: Boolean = false): Boolean {
        val preset = checkNotNull(presets().find { it.id == id && (!fromShortcut || it.routineEnabled) }) {
            "Save and enable this activity for Routines in Ultimate App."
        }
        val runs = current()
        if (runs.any { it.preset.id == id && history.record(it.sessionId)?.owner == history.owner }) return false
        arm(runs, preset, preset.durationMinutes, source = if (fromShortcut) "routine" else "manual")
        return true
    }

    fun current() = reconcile()
    fun accountRuns() = current().filter { history.record(it.sessionId)?.owner == history.owner }
    fun restore(afterBoot: Boolean, republish: Boolean) {
        reconcile(reschedule = true, republish = republish, afterBoot = afterBoot)
        history.schedule()
    }

    private fun reconcile(reschedule: Boolean = false, republish: Boolean = false, afterBoot: Boolean = false): List<ReminderRun> {
        val legacy = prefs.contains("run")
        val saved = readList("runs", "run", ReminderRun::fromJson)
        val now = SystemClock.elapsedRealtime()
        val boot = bootCount
        val rebased = saved.map { run ->
            val rebooted = if (boot == -1) afterBoot else boot != run.bootCount
            if (!run.finished && rebooted) rebase(run, now, boot) else run
        }
        val updated = rebased.map { run ->
            if (!run.finished && run.endElapsed <= now) run.copy(finished = true, nextProgress = null) else run
        }
        val wallNow = System.currentTimeMillis()
        val historyChanges = updated.mapIndexedNotNull { index, run ->
            val prior = history.record(run.sessionId)
            val completed = run.finished && !saved[index].finished
            when {
                completed -> (prior ?: unknownHistory(run, wallNow)).copy(
                    status = "completed", endedAt = wallNow, revision = (prior?.revision ?: 0) + 1,
                )
                prior == null -> unknownHistory(run, wallNow)
                else -> null
            }
        }
        if (legacy || updated != saved || historyChanges.isNotEmpty()) saveRuns(updated, historyChanges)
        if (legacy) {
            notifications.cancel(COUNTDOWN_ID)
            notifications.cancel(FINISHED_ID)
        }
        for ((index, run) in updated.withIndex()) {
            val before = saved[index]
            if (run.finished && !before.finished) {
                cancelAlarms(run)
                clearNotifications(run)
                showFinished(run, alert = true)
            } else if (run.finished) {
                if (republish || legacy) showFinished(run, alert = false)
            } else if (reschedule || legacy || run != before) {
                if (canSchedule()) schedule(run)
                if (republish || legacy || run != before) showCountdown(run)
            }
        }
        return updated
    }

    fun handle(action: String?, id: String?) {
        if (action == EXPIRE) {
            current()
            return
        }
        val runs = current()
        val run = runs.find { it.id == id } ?: return
        when (action) {
            STOP -> {
                val record = if (run.finished) null else history.record(run.sessionId)?.let {
                    it.copy(status = "stopped", endedAt = System.currentTimeMillis(), revision = it.revision + 1)
                }
                saveRuns(runs.filterNot { it.id == id }, listOfNotNull(record))
                cancelAlarms(run)
                clearNotifications(run)
            }
            EXTEND -> if (run.finished) arm(runs, run.preset, run.preset.extensionMinutes, replacing = run)
            PROGRESS -> if (!run.finished) postProgress(runs, run)
        }
    }

    private fun arm(
        runs: List<ReminderRun>, preset: ReminderPreset, minutes: Int,
        replacing: ReminderRun? = null, source: String = "unknown",
    ) {
        check(notificationSettings() == null) { "Enable reminder notifications in Ultimate App." }
        check(canSchedule()) { "Allow alarms and reminders in Ultimate App." }
        val now = SystemClock.elapsedRealtime()
        val wallNow = System.currentTimeMillis()
        val duration = minutes * MINUTE_MS
        val id = UUID.randomUUID().toString()
        val run = ReminderRun(
            id, preset, now + duration, wallNow + duration, bootCount,
            nextProgress = preset.intervalMinutes.takeIf { it in 1 until minutes }?.let { now + it * MINUTE_MS },
            sessionId = replacing?.sessionId ?: id,
        )
        if (run.nextProgress != null) check(notificationSettings(progress = true) == null) {
            "Enable reminder progress notifications in Ultimate App."
        }
        try {
            schedule(run)
            val previous = replacing?.let { history.record(it.sessionId) }
            val record = previous?.copy(
                status = "running", countdownStartedAt = wallNow, plannedEndAt = run.endWallTime,
                endedAt = null, revision = previous.revision + 1,
            ) ?: ReminderHistoryRecord(
                run.sessionId, preset.id, preset.title, preset.message, source, "running",
                wallNow, wallNow, wallNow, run.endWallTime, null, 1, history.owner, preset.group,
            )
            saveRuns(runs.filterNot { it.id == replacing?.id } + run, listOf(record))
        } catch (error: IllegalStateException) {
            cancelAlarms(run)
            throw error
        }
        replacing?.let { clearNotifications(it) }
        showCountdown(run)
    }

    private fun postProgress(runs: List<ReminderRun>, run: ReminderRun) {
        val due = run.nextProgress ?: return
        val now = SystemClock.elapsedRealtime()
        if (now < due) return
        val interval = run.preset.intervalMinutes * MINUTE_MS
        // Keep intervals anchored to the start time and coalesce missed ticks during sleep.
        val next = due + ((now - due) / interval + 1) * interval
        val updated = run.copy(nextProgress = next.takeIf { it < run.endElapsed })
        saveRuns(runs.map { if (it.id == run.id) updated else it })
        if (canSchedule()) scheduleProgress(updated)
        if (now < run.endElapsed) showProgress(updated)
    }

    private fun rebase(run: ReminderRun, now: Long, boot: Int): ReminderRun {
        val remaining = (run.endWallTime - System.currentTimeMillis()).coerceAtLeast(0)
        val end = now + remaining
        return run.copy(endElapsed = end, bootCount = boot, nextProgress = run.nextProgress?.let { end - (run.endElapsed - it) })
    }

    private fun <T> readList(key: String, legacyKey: String, decode: (JSONObject) -> T): List<T> {
        val stored = prefs.getString(key, null)?.let(::JSONArray)
        if (stored != null) return List(stored.length()) { decode(stored.getJSONObject(it)) }
        return prefs.getString(legacyKey, null)?.let { listOf(decode(JSONObject(it))) }.orEmpty()
    }

    private fun unknownHistory(run: ReminderRun, now: Long) = ReminderHistoryRecord(
        run.sessionId, run.preset.id, run.preset.title, run.preset.message, "unknown",
        if (run.finished) "completed" else "running", minOf(now, run.endWallTime),
        null, null, run.endWallTime, null, 1, history.owner, run.preset.group,
    )

    private fun saveRuns(runs: List<ReminderRun>, historyChanges: List<ReminderHistoryRecord> = emptyList()) {
        val editor = prefs.edit().putString("runs", JSONArray(runs.map { it.toJson() }).toString()).remove("run")
        history.write(editor, historyChanges)
        check(editor.commit()) { "Could not save reminders." }
        if (historyChanges.isNotEmpty()) history.schedule()
    }

    private fun schedule(run: ReminderRun) {
        scheduleAlarm(EXPIRE, run.id, run.endElapsed, allowWhileIdle = true)
        scheduleProgress(run)
    }

    // Progress updates can wait through Doze, leaving the idle alarm budget for completion.
    private fun scheduleProgress(run: ReminderRun) {
        run.nextProgress?.let { scheduleAlarm(PROGRESS, run.id, it, allowWhileIdle = false) }
    }

    private fun scheduleAlarm(action: String, id: String, time: Long, allowWhileIdle: Boolean) {
        val intent = checkNotNull(pending(action, id, PendingIntent.FLAG_UPDATE_CURRENT))
        try {
            if (allowWhileIdle) alarms.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, time, intent)
            else alarms.setExact(AlarmManager.ELAPSED_REALTIME_WAKEUP, time, intent)
        } catch (error: SecurityException) {
            throw IllegalStateException("Allow alarms and reminders in Ultimate App.", error)
        }
    }

    private fun cancelAlarms(run: ReminderRun) {
        for (action in listOf(EXPIRE, PROGRESS)) {
            pending(action, run.id, PendingIntent.FLAG_NO_CREATE)?.let {
                alarms.cancel(it)
                it.cancel()
            }
        }
    }

    private fun pending(action: String, id: String, flags: Int): PendingIntent? =
        PendingIntent.getBroadcast(
            context, 0,
            Intent(context, RoutineReminderReceiver::class.java)
                .setAction(action)
                .setData(Uri.fromParts("routine-reminder", id, null)),
            flags or PendingIntent.FLAG_IMMUTABLE,
        )

    private fun createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val countdown = NotificationChannel(COUNTDOWN_CHANNEL, "Activity countdowns", NotificationManager.IMPORTANCE_LOW)
        countdown.setSound(null, null)
        val finished = NotificationChannel(FINISHED_CHANNEL, "Activity alerts", NotificationManager.IMPORTANCE_HIGH)
        finished.setSound(null, null)
        finished.vibrationPattern = VIBRATION
        val progress = NotificationChannel(PROGRESS_CHANNEL, "Activity progress", NotificationManager.IMPORTANCE_DEFAULT)
        progress.setSound(null, null)
        notifications.createNotificationChannels(listOf(countdown, finished, progress))
    }

    @Suppress("DEPRECATION")
    private fun builder(channel: String): Notification.Builder {
        createChannels()
        return (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(context, channel)
        else Notification.Builder(context))
            .setSmallIcon(R.drawable.ic_routine_reminder)
            .setVisibility(Notification.VISIBILITY_PRIVATE)
    }

    private fun clearNotifications(run: ReminderRun) {
        for (id in listOf(COUNTDOWN_ID, FINISHED_ID, PROGRESS_ID)) notifications.cancel(run.id, id)
    }

    private fun details(run: ReminderRun): PendingIntent {
        val uri = Uri.Builder().scheme("my-ultimate-app").authority("activity-history")
            .appendQueryParameter("sessionId", run.sessionId).build()
        val intent = Intent(Intent.ACTION_VIEW, uri, context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun countdown(run: ReminderRun, channel: String, title: String): Notification.Builder {
        val remaining = (run.endElapsed - SystemClock.elapsedRealtime()).coerceAtLeast(1)
        val content = RemoteViews(context.packageName, R.layout.routine_reminder_countdown).apply {
            setTextViewText(R.id.routine_reminder_title, title)
            setChronometerCountDown(R.id.routine_reminder_clock, true)
            setChronometer(R.id.routine_reminder_clock, run.endElapsed, null, true)
        }
        val notification = builder(channel)
            .setContentTitle(title)
            .setContentText("Time remaining")
            .setContentIntent(details(run))
            .setShowWhen(false)
            .setStyle(Notification.DecoratedCustomViewStyle())
            .setCustomContentView(content)
            .setCustomBigContentView(content)
            .addAction(Notification.Action.Builder(null, "Stop", pending(STOP, run.id, PendingIntent.FLAG_UPDATE_CURRENT)).build())
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) notification.setTimeoutAfter(remaining)
        return notification
    }

    @Suppress("DEPRECATION")
    private fun showCountdown(run: ReminderRun) {
        val notification = countdown(run, COUNTDOWN_CHANNEL, run.preset.title)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(Notification.PRIORITY_LOW)
        notifications.notify(run.id, COUNTDOWN_ID, notification.build())
    }

    private fun showProgress(run: ReminderRun) {
        val notification = countdown(run, PROGRESS_CHANNEL, "${run.preset.title} · Progress")
        notifications.notify(run.id, PROGRESS_ID, notification.build())
    }

    @Suppress("DEPRECATION")
    private fun showFinished(run: ReminderRun, alert: Boolean) {
        val stop = pending(STOP, run.id, PendingIntent.FLAG_UPDATE_CURRENT)
        val notification = builder(FINISHED_CHANNEL)
            .setContentTitle("${run.preset.title} · Time’s up")
            .setContentText(run.preset.message)
            .setContentIntent(details(run))
            .setStyle(Notification.BigTextStyle().bigText(run.preset.message))
            .setPriority(Notification.PRIORITY_HIGH)
            .setOnlyAlertOnce(!alert)
            .setDeleteIntent(stop)
            .addAction(Notification.Action.Builder(null, "Stop", stop).build())
            .addAction(Notification.Action.Builder(null, "Extend ${run.preset.extensionMinutes} min", pending(EXTEND, run.id, PendingIntent.FLAG_UPDATE_CURRENT)).build())
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O && alert) notification.setVibrate(VIBRATION)
        if (!alert && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            notification.setGroup("restored_routine_reminder").setGroupAlertBehavior(Notification.GROUP_ALERT_SUMMARY)
        }
        notifications.notify(run.id, FINISHED_ID, notification.build())
    }

    companion object {
        const val START = "com.uvelan.ultimateapp.START_ROUTINE_REMINDER"
        const val START_NAMED = "com.uvelan.ultimateapp.START_NAMED_ROUTINE_REMINDER"
        const val STOP = "routine-reminder.stop"
        const val EXTEND = "routine-reminder.extend"
        private const val EXPIRE = "routine-reminder.expire"
        private const val PROGRESS = "routine-reminder.progress"
        const val FINISHED_CHANNEL = "routine_reminder_alerts"
        const val PROGRESS_CHANNEL = "routine_reminder_progress"
        private const val COUNTDOWN_CHANNEL = "routine_reminder_countdown"
        private const val COUNTDOWN_ID = 78101
        private const val FINISHED_ID = 78102
        private const val PROGRESS_ID = 78103
        private const val MINUTE_MS = 60_000L
        private val VIBRATION = longArrayOf(0, 450)
    }
}

class RoutineReminderShortcutActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        try {
            val id = when (intent.action) {
                RoutineReminder.START -> ReminderPreset.ORIGINAL_ID
                RoutineReminder.START_NAMED -> intent.data?.takeIf { it.scheme == "routine-reminder" }?.schemeSpecificPart
                else -> null
            }
            if (id != null) RoutineReminder(applicationContext).start(id, fromShortcut = true)
        } catch (error: IllegalStateException) {
            Toast.makeText(this, error.message, Toast.LENGTH_LONG).show()
        } finally {
            finish()
        }
    }
}

class RoutineReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val reminder = RoutineReminder(context)
        try {
            when (intent.action) {
                Intent.ACTION_BOOT_COMPLETED -> reminder.restore(afterBoot = true, republish = true)
                Intent.ACTION_MY_PACKAGE_REPLACED -> reminder.restore(afterBoot = false, republish = true)
                AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED -> reminder.restore(afterBoot = false, republish = false)
                else -> reminder.handle(intent.action, intent.data?.schemeSpecificPart)
            }
        } catch (error: IllegalStateException) {
            android.util.Log.w("RoutineReminder", "Unable to update routine reminder", error)
            if (intent.action == RoutineReminder.EXTEND) {
                Toast.makeText(context, error.message, Toast.LENGTH_LONG).show()
            }
        }
    }
}
