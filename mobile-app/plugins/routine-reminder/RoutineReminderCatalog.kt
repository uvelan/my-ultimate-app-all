package com.uvelan.ultimateapp

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

// Access is serialized by the same main-thread bridge as the timer.
internal class RoutineReminderCatalog(context: Context) {
    private val prefs = context.getSharedPreferences("routine_reminder", Context.MODE_PRIVATE)
    private val history = RoutineReminderHistory(context)
    private val owner get() = history.owner

    private data class Entry(
        val preset: ReminderPreset,
        val version: Int,
        val deleted: Boolean,
        val operationId: String,
        val pending: Boolean,
        val submitted: Set<String> = emptySet(),
    ) {
        fun toJson() = preset.toJson().put("version", version).put("deleted", deleted)
            .put("operationId", operationId).put("pending", pending).put("submitted", JSONArray(submitted))

        fun mutation() = preset.toJson().put("expectedVersion", version).put("deleted", deleted)
            .put("operationId", operationId)

        companion object {
            fun fromJson(json: JSONObject) = Entry(
                ReminderPreset.fromJson(json), json.getInt("version"), json.getBoolean("deleted"),
                json.getString("operationId"), json.optBoolean("pending"),
                json.optJSONArray("submitted")?.objects { getString(it) }?.toSet().orEmpty(),
            )

            fun local(preset: ReminderPreset) = Entry(preset, 0, false, UUID.randomUUID().toString(), true)
        }
    }

    fun prepareAccountChange() { entries() }

    fun bindAccount(userId: String) {
        check(owner == userId) { "The reminder account changed." }
        if (prefs.getBoolean(CLAIMED, false)) return
        val local = decode(prefs.getString(key(null), null))
        val claimed = decode(prefs.getString(key(userId), null)) + local
        check(prefs.edit().putString(key(userId), encode(claimed)).remove(key(null))
            .putBoolean(CLAIMED, true).commit()) { "Could not link the saved reminders." }
    }

    fun presets() = entries().filterNot { it.deleted }.map { it.preset }

    fun operationIds() = entries().associate { it.preset.id to it.operationId }

    fun pendingCount() = entries().count { it.pending }

    fun conflicts() = prefs.getInt(key(owner) + ":conflicts", 0)

    fun save(preset: ReminderPreset, expectedOperationId: String) {
        val entries = entries()
        val previous = entries.find { it.preset.id == preset.id && !it.deleted }
        val updated = if (preset.id.isEmpty()) {
            entries + Entry.local(preset.copy(id = UUID.randomUUID().toString()))
        } else {
            requireNotNull(previous) { "This reminder was deleted." }
            check(previous.operationId == expectedOperationId) { "This reminder changed. Reopen it before saving." }
            entries.map { if (it == previous) it.copy(preset = preset, operationId = UUID.randomUUID().toString(), pending = true) else it }
        }
        save(owner, updated, conflicts = 0)
    }

    fun delete(id: String) {
        val current = entries()
        val updated = current.map {
            if (it.preset.id == id && !it.deleted) it.copy(deleted = true, operationId = UUID.randomUUID().toString(), pending = true)
            else it
        }
        if (current != updated) save(owner, updated, conflicts = 0)
    }

    fun batch(userId: String): String {
        check(owner == userId) { "The reminder account changed." }
        val current = entries()
        val pending = current.filter { it.pending }.take(50)
        val submitted = pending.map { it.operationId }.toSet()
        val updated = current.map { if (it.operationId in submitted) it.copy(submitted = it.submitted + it.operationId) else it }
        if (updated != current) save(userId, updated)
        return JSONArray(pending.map { it.mutation() }).toString()
    }

    fun merge(userId: String, payload: String): Boolean {
        check(owner == userId) { "The reminder account changed." }
        val response = JSONObject(payload)
        val current = entries()
        val remote = response.getJSONArray("activities").objects { Entry.fromJson(getJSONObject(it)) }
            .associateBy { it.preset.id }
        val outcomes = response.getJSONArray("outcomes").objects { getJSONObject(it) }
            .associateBy { it.getString("operationId") }
        var conflicts = 0
        val localIds = current.map { it.preset.id }.toSet()
        val merged = current.mapNotNull { local ->
            val incoming = remote[local.preset.id]
            val outcome = outcomes[local.operationId]?.getString("status")
            when {
                incoming != null && incoming.version < local.version -> local
                !local.pending -> incoming ?: local
                incoming?.operationId == local.operationId -> incoming
                // An earlier upload may have committed before its response reached this phone.
                incoming != null && !incoming.deleted && incoming.version > local.version &&
                    incoming.operationId in local.submitted -> local.copy(version = incoming.version, submitted = emptySet())
                outcome == "conflict" -> { conflicts++; incoming }
                else -> local
            }
        } + remote.values.filter { it.preset.id !in localIds }
        if (merged == current && conflicts == 0) return false
        save(userId, merged, conflicts.takeIf { it > 0 })
        return true
    }

    private fun entries(): List<Entry> {
        if (!prefs.getBoolean(MIGRATED, false)) {
            val legacy = prefs.getString("presets", null)?.let { json ->
                JSONArray(json).objects { ReminderPreset.fromJson(getJSONObject(it)) }
            } ?: prefs.getString("preset", null)?.let { listOf(ReminderPreset.fromJson(JSONObject(it))) }.orEmpty()
            val editor = prefs.edit().putString(key(owner), encode(legacy.map { Entry.local(it) }))
                .remove("presets").remove("preset").putBoolean(MIGRATED, true)
            if (owner != null || history.hasBoundAccount) editor.putBoolean(CLAIMED, true)
            check(editor.commit()) { "Could not preserve the saved reminders." }
        }
        return decode(prefs.getString(key(owner), null))
    }

    private fun save(userId: String?, entries: List<Entry>, conflicts: Int? = null) {
        val editor = prefs.edit().putString(key(userId), encode(entries))
        if (conflicts != null) editor.putInt(key(userId) + ":conflicts", conflicts)
        check(editor.commit()) { "Could not save reminders." }
    }

    private fun key(userId: String?) = "reminder_catalog:" + (userId ?: "local")
    private fun encode(entries: List<Entry>) = JSONArray(entries.map { it.toJson() }).toString()
    private fun decode(value: String?) = value?.let { JSONArray(it).objects { Entry.fromJson(getJSONObject(it)) } }.orEmpty()

    companion object {
        private const val MIGRATED = "reminder_catalog_migrated"
        private const val CLAIMED = "reminder_catalog_claimed"
        private fun <T> JSONArray.objects(read: JSONArray.(Int) -> T) = List(length()) { read(it) }
    }
}
