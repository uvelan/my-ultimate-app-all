package com.uvelan.ultimateapp

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import android.content.SharedPreferences
import android.os.Handler
import android.os.Looper
import android.util.AtomicFile
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

internal data class ReminderHistoryRecord(
    val id: String,
    val presetId: String,
    val title: String,
    val message: String,
    val source: String,
    val status: String,
    val recordedAt: Long,
    val startedAt: Long?,
    val countdownStartedAt: Long?,
    val plannedEndAt: Long,
    val endedAt: Long?,
    val revision: Int,
    val owner: String?,
    val group: String = "REMINDERS",
) {
    val calendarEnd get() = maxOf(recordedAt, endedAt ?: plannedEndAt)

    fun toJson(includeOwner: Boolean = false) = JSONObject()
        .put("id", id).put("presetId", presetId).put("title", title).put("message", message).put("group", group)
        .put("source", source).put("status", status).put("recordedAt", recordedAt)
        .put("startedAt", startedAt ?: JSONObject.NULL)
        .put("countdownStartedAt", countdownStartedAt ?: JSONObject.NULL)
        .put("plannedEndAt", plannedEndAt).put("endedAt", endedAt ?: JSONObject.NULL)
        .put("revision", revision).apply { if (includeOwner) put("owner", owner) }

    companion object {
        fun fromJson(json: JSONObject) = ReminderHistoryRecord(
            json.getString("id"), json.getString("presetId"), json.getString("title"), json.getString("message"),
            json.getString("source"), json.getString("status"), json.getLong("recordedAt"),
            json.time("startedAt"), json.time("countdownStartedAt"), json.getLong("plannedEndAt"),
            json.time("endedAt"), json.getInt("revision"),
            json.optString("owner").ifEmpty { null },
            json.optString("group", "REMINDERS"),
        )

        private fun JSONObject.time(key: String): Long? = if (isNull(key)) null else getLong(key)
    }
}

// Timer transitions and upload acknowledgements update the same preferences on the main thread.
internal class RoutineReminderHistory(private val context: Context) {
    private val prefs = context.getSharedPreferences("routine_reminder", Context.MODE_PRIVATE)
    private val jobs = context.getSystemService(JobScheduler::class.java)
    private val tokenFile = AtomicFile(File(context.noBackupFilesDir, "routine-reminder-grant.json"))
    val owner get() = prefs.getString(OWNER, null)
    val hasBoundAccount get() = prefs.getBoolean(BOUND, false)

    data class Grant(val owner: String, val endpoint: String, val token: String, val expiresAt: Long)

    fun record(id: String) = decode(prefs.getString(PREFIX + id, null))

    private fun records() = prefs.all.asSequence().filter { it.key.startsWith(PREFIX) }
        .mapNotNull { decode(it.value as? String) }

    private fun decode(value: String?) = value?.let {
        runCatching { ReminderHistoryRecord.fromJson(JSONObject(it)) }.getOrNull()
    }

    fun query(from: Long, to: Long, selectedId: String?) = JSONObject()
        .put("sessions", JSONArray(records().filter { it.owner == owner && it.recordedAt < to && it.calendarEnd >= from }
            .sortedByDescending { it.recordedAt }.map { it.toJson() }.toList()))
        .put("selected", selectedId?.let(::record)?.takeIf { it.owner == owner }?.toJson() ?: JSONObject.NULL)
        .put("syncReady", grant() != null)
        .put("pending", pendingIds().count { record(it)?.owner == owner })
        .put("failed", failedIds().count { record(it)?.owner == owner })
        .toString()

    fun write(editor: SharedPreferences.Editor, changes: List<ReminderHistoryRecord>) {
        if (changes.isEmpty()) return
        for (record in changes) editor.putString(PREFIX + record.id, record.toJson(includeOwner = true).toString())
        editor.putStringSet(PENDING, pendingIds() + changes.filter { it.owner != null }.map { it.id })
        editor.putStringSet(FAILED, failedIds() - changes.map { it.id }.toSet())
    }

    fun bind(userId: String): Boolean {
        require(userId.matches(Regex("[a-fA-F0-9]{24}"))) { "Invalid reminder account." }
        if (owner != userId) {
            jobs.cancel(JOB_ID)
            tokenFile.delete()
            val editor = prefs.edit().putString(OWNER, userId).putBoolean(BOUND, true)
            // Existing device-local history is claimed only by the first account on this installation.
            if (!prefs.getBoolean(BOUND, false)) {
                write(editor, records().filter { it.owner == null }.map { it.copy(owner = userId) }.toList())
            }
            check(editor.commit()) { "Could not link reminder history." }
        }
        schedule()
        return (grant()?.expiresAt ?: 0L) > System.currentTimeMillis() + 86_400_000L
    }

    fun configure(userId: String, endpoint: String, token: String, expiresAt: Long) {
        check(owner == userId) { "The reminder account changed." }
        val url = URL(endpoint)
        require(url.protocol == "https" && url.userInfo == null && url.query == null && url.ref == null)
        val data = JSONObject().put("owner", userId).put("endpoint", endpoint)
            .put("token", token).put("expiresAt", expiresAt).toString()
        val stream = tokenFile.startWrite()
        try {
            stream.write(data.toByteArray(Charsets.UTF_8))
            tokenFile.finishWrite(stream)
        } catch (error: Exception) {
            tokenFile.failWrite(stream)
            throw error
        }
        schedule()
    }

    fun clearAccount() {
        jobs.cancel(JOB_ID)
        tokenFile.delete()
        check(prefs.edit().remove(OWNER).commit()) { "Could not unlink reminder history." }
    }

    fun grant(): Grant? {
        val json = try { JSONObject(tokenFile.readFully().toString(Charsets.UTF_8)) }
        catch (_: Exception) { return null }
        val expiresAt = json.optLong("expiresAt")
        val userId = json.optString("owner")
        if (userId != owner || expiresAt <= System.currentTimeMillis()) return null
        return Grant(userId, json.getString("endpoint"), json.getString("token"), expiresAt)
    }

    private fun pendingIds() = prefs.getStringSet(PENDING, emptySet()).orEmpty()
    private fun failedIds() = prefs.getStringSet(FAILED, emptySet()).orEmpty()

    fun retryFailed() {
        val account = owner ?: return
        val retry = failedIds().filter { record(it)?.owner == account }.toSet()
        if (retry.isNotEmpty()) {
            check(prefs.edit().putStringSet(PENDING, pendingIds() + retry)
                .putStringSet(FAILED, failedIds() - retry).commit()) { "Could not retry reminder sync." }
        }
        schedule()
    }

    fun hasPending(userId: String) = pendingIds().any { record(it)?.owner == userId }

    fun batch(userId: String) = pendingIds().asSequence().mapNotNull(::record)
        .filter { it.owner == userId }.take(50).toList()

    fun settle(uploaded: List<ReminderHistoryRecord>, accepted: Set<String>, rejected: Set<String>) {
        val currentIds = uploaded.filter { record(it.id)?.revision == it.revision }.map { it.id }.toSet()
        val failed = currentIds.intersect(rejected)
        prefs.edit().putStringSet(PENDING, pendingIds() - currentIds.intersect(accepted + rejected))
            .putStringSet(FAILED, failedIds() + failed).apply()
    }

    fun invalidate(grant: Grant) {
        if (grant() == grant) tokenFile.delete()
    }

    fun schedule() {
        // Android may temporarily refuse additional jobs. The durable outbox can retry later.
        runCatching {
            val account = grant() ?: return
            if (jobs.getPendingJob(JOB_ID) != null || !hasPending(account.owner)) return
            jobs.schedule(JobInfo.Builder(JOB_ID, ComponentName(context, RoutineReminderSyncJob::class.java))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPersisted(true)
                .build())
        }
    }

    companion object {
        private const val PREFIX = "reminder_history:"
        private const val OWNER = "reminder_history_owner"
        private const val BOUND = "reminder_history_bound"
        private const val PENDING = "reminder_history_pending"
        private const val FAILED = "reminder_history_failed"
        private const val JOB_ID = 78104
    }
}

class RoutineReminderSyncJob : JobService() {
    private data class Upload(val status: Int, val accepted: Set<String> = emptySet(), val rejected: Set<String> = emptySet())
    private val main = Handler(Looper.getMainLooper())
    @Volatile private var active: JobParameters? = null
    @Volatile private var connection: HttpURLConnection? = null

    override fun onStartJob(params: JobParameters): Boolean {
        val history = RoutineReminderHistory(this)
        val grant = history.grant() ?: return false
        val batch = history.batch(grant.owner)
        if (batch.isEmpty()) return false
        active = params
        Thread {
            val result = try { upload(params, grant, batch) } catch (_: Exception) { Upload(503) }
            main.post {
                if (active !== params) return@post
                active = null
                val sameGrant = history.grant() == grant
                if (sameGrant) {
                    if (result.status in 200..299 || result.status == 400) {
                        history.settle(batch, result.accepted, result.rejected)
                    }
                    if (result.status == 401 || result.status == 403) history.invalidate(grant)
                }
                val status = result.status
                val transient = status in 300..399 || status in listOf(404, 408, 425, 429) || status >= 500
                val retry = sameGrant && (transient || (status in 200..299 || status == 400) && history.hasPending(grant.owner))
                jobFinished(params, retry)
                if (!retry && (!sameGrant || status in 200..299)) main.postDelayed({ history.schedule() }, 1000)
            }
        }.start()
        return true
    }

    override fun onStopJob(params: JobParameters): Boolean {
        if (active === params) {
            active = null
            connection?.disconnect()
        }
        return true
    }

    private fun upload(params: JobParameters, grant: RoutineReminderHistory.Grant, records: List<ReminderHistoryRecord>): Upload {
        val request = URL(grant.endpoint).openConnection() as HttpURLConnection
        connection = request
        try {
            if (active !== params) return Upload(503)
            val data = JSONObject().put("sessions", JSONArray(records.map { it.toJson() })).toString().toByteArray(Charsets.UTF_8)
            request.requestMethod = "POST"
            request.instanceFollowRedirects = false
            request.connectTimeout = 15_000
            request.readTimeout = 20_000
            request.setRequestProperty("Authorization", "Bearer ${grant.token}")
            request.setRequestProperty("Content-Type", "application/json")
            request.doOutput = true
            request.setFixedLengthStreamingMode(data.size)
            request.outputStream.use { it.write(data) }
            val status = request.responseCode
            val ids = records.map { it.id }.toSet()
            if (status == 400) return Upload(status, rejected = ids)
            if (status !in 200..299) return Upload(status)
            val response = JSONObject(request.inputStream.bufferedReader().use { it.readText() })
            val accepted = response.getJSONArray("acknowledged").ids()
            val rejected = response.getJSONArray("rejected").ids()
            check(accepted.intersect(rejected).isEmpty() && accepted + rejected == ids)
            return Upload(status, accepted, rejected)
        } finally {
            request.disconnect()
            if (connection === request) connection = null
        }
    }

    private fun JSONArray.ids() = (0 until length()).map { getString(it) }.toSet()
}
