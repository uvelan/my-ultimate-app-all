package com.uvelan.ultimateapp

import android.content.Context
import org.json.JSONObject
import org.json.JSONArray
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.zip.ZipFile

/** Nearby chapters arrive individually; distant chapters share one verified, resumable transfer. */
object LocalSyncBatch {
    fun playbackIndex(context: Context, entry: JSONObject): Int {
        val checkpoint = JSONObject(LocalSyncStore.read(context, "local-pc-playback.json", "{}"))
        val payload = entry.getJSONObject("payload")
        return if (checkpoint.optString("userId") == entry.optString("userId") && checkpoint.optString("bookId") == payload.optString("bookId") && checkpoint.optLong("updated") >= entry.optLong("playbackRevision")) checkpoint.optInt("chapterIndex", entry.optInt("playbackIndex")) else entry.optInt("playbackIndex")
    }
    fun distant(context: Context, entry: JSONObject) = entry.getInt("chapterIndex") - playbackIndex(context, entry) >= 4
    fun process(context: Context, config: JSONObject, selected: JSONObject, stopped: () -> Boolean,
                commit: (JSONObject, JSONObject, String) -> Unit) {
        val all = LocalSyncStore.queue(context)
        val group = (0 until all.length()).map { all.getJSONObject(it) }.filter {
            it.optString("batchId") == selected.optString("batchId") && it.optString("state") != "complete" && it.has("payload")
        }.toMutableList()
        for (entry in group) {
            if (stopped()) return
            if (entry.optString("jobId").isEmpty()) {
                val id = LocalSyncNet.request(config, "/v1/chapters", entry.getJSONObject("payload")).getString("id")
                entry.put("jobId", id); LocalSyncStore.updateJob(context, entry.getString("requestKey")) { it.put("jobId", id) }
            }
        }
        while (!stopped()) {
            val states = try {
                LocalSyncNet.request(config, "/v1/batches/status", JSONObject().put("jobs", JSONArray(group.map { it.getString("jobId") }))).getJSONArray("jobs")
            } catch (error: SyncHttpException) {
                if (error.status == 404) for (entry in group) LocalSyncStore.updateJob(context, entry.getString("requestKey")) { it.remove("jobId") }
                throw error
            }
            val results = (0 until states.length()).map { states.getJSONObject(it) }.associateBy { it.getString("id") }
            check(results.size == group.size) { "Wrong batch status response" }
            for (entry in group) {
                val result = results[entry.getString("jobId")] ?: error("Missing chapter status")
                LocalSyncStore.jobState(context, entry.getString("requestKey"), if (result.optString("status") == "ready") "pc-ready" else result.optString("status"))
                if (result.optString("status") in listOf("error", "cancelled")) {
                    LocalSyncStore.updateJob(context, entry.getString("requestKey")) { it.remove("jobId") }
                    error(result.optString("error", "PC generation failed"))
                }
            }
            // Playback may catch up while a distant batch is still generating.
            // Let the outer runner deliver the now-nearby chapter individually.
            if (!distant(context, group.minBy { it.getInt("chapterIndex") })) return
            val ready = results.values.count { it.optString("status") == "ready" }
            val progress = results.values.sumOf { if (it.optString("status") == "ready") 1.0 else it.optDouble("progress", 0.0) } / group.size
            val active = group.firstOrNull { results[it.getString("jobId")]?.optString("status") != "ready" } ?: selected
            LocalSyncStore.publish(context, JSONObject().put("phase", "batch-generating").put("progress", progress)
                .put("batchTotal", group.size).put("batchReady", ready).put("chapterIndex", active.getInt("chapterIndex"))
                .put("chapterId", active.getJSONObject("payload").getString("chapterId")))
            if (ready > 0) {
                // Transfer ready chapters while the PC continues generating the rest.
                // Persist the exact archive membership so a reconnect resumes the same
                // bytes even if more chapters become ready while this transfer is paused.
                val previousPlan = group.firstNotNullOfOrNull { it.optJSONArray("deliveryJobs") }
                val previousIds = previousPlan?.let { plan -> (0 until plan.length()).map { plan.getString(it) } }
                val available = if (previousIds != null) group.filter { it.getString("jobId") in previousIds }
                    else group.filter { results[it.getString("jobId")]?.optString("status") == "ready" }.take(3)
                val ids = previousIds ?: available.map { it.getString("jobId") }
                LocalSyncRunner.activate(available.first())
                if (previousIds == null) for (entry in available) LocalSyncStore.updateJob(context, entry.getString("requestKey")) {
                    it.put("deliveryJobs", JSONArray(ids))
                }
                val bundle = LocalSyncNet.request(config, "/v1/bundles", JSONObject().put("jobs", JSONArray(ids)))
                val archive = download(context, config, bundle, stopped)
                try {
                    val manifests = bundle.getJSONArray("chapters")
                    check(manifests.length() == ids.size) { "Wrong batch response" }
                    ZipFile(archive).use { zip ->
                        for (entry in available) {
                            check(!stopped()) { "Sync paused" }
                            val id = entry.getString("jobId")
                            val manifest = (0 until manifests.length()).map { manifests.getJSONObject(it) }.single { it.getString("jobId") == id }
                            val key = manifest.getString("requestKey"); val hash = manifest.getString("sha256")
                            check(key == entry.getString("requestKey") && key.matches(Regex("[a-f0-9]{16}")) && hash.matches(Regex("[a-f0-9]{64}")))
                            val item = zip.getEntry("$id.wav") ?: error("Batch is missing a chapter")
                            check(item.size == manifest.getLong("bytes") && item.size in 45..200_000_000L)
                            val partial = File(context.filesDir, "local-pc-audio/kokoro-pc-$key-${hash.take(16)}.wav.part")
                            partial.parentFile!!.mkdirs()
                            zip.getInputStream(item).use { input -> FileOutputStream(partial).use { output ->
                                val buffer = ByteArray(65536); var total = 0L
                                while (true) { check(!stopped()) { "Sync paused" }; val count = input.read(buffer); check(!stopped()) { "Sync paused" }; if (count < 0) break
                                    total += count; check(total <= item.size); output.write(buffer, 0, count) }
                                check(total == item.size); output.fd.sync()
                            } }
                            // Shared commit validates each WAV/hash/timing before publishing that chapter.
                            commit(entry, manifest, id)
                        }
                    }
                    archive.delete()
                } catch (failure: Exception) { throw failure }
                group.removeAll(available.toSet())
                if (group.isEmpty()) return
                continue
            }
            Thread.sleep(3000)
        }
    }
    private fun download(context: Context, config: JSONObject, bundle: JSONObject, stopped: () -> Boolean): File {
        val id = bundle.getString("id"); val hash = bundle.getString("sha256"); val size = bundle.getLong("bytes")
        check(id.matches(Regex("[a-f0-9]{40}")) && hash.matches(Regex("[a-f0-9]{64}")) && size in 45..2_000_000_000L)
        val directory = File(context.filesDir, "local-pc-audio").apply { mkdirs() }
        val partial = File(directory, "batch-$id.zip.part")
        if (partial.length() > size) partial.delete()
        check(directory.usableSpace > size * 2 - partial.length() + 30_000_000) { "Not enough phone storage for this batch. Choose fewer chapters." }
        if (partial.length() < size) {
            check(!stopped()) { "Sync paused" }
            val request = LocalSyncNet.connection(config, "/v1/bundles/$id/audio", transfer = true)
            request.readTimeout = 120_000
            try {
                val offset = partial.length()
                if (offset > 0) request.setRequestProperty("Range", "bytes=$offset-")
                val code = request.responseCode
                if (code != 200 && code != 206) throw SyncHttpException(code, "Batch download failed ($code)")
                if (code == 206) check(request.getHeaderField("Content-Range")?.startsWith("bytes $offset-") == true)
                FileOutputStream(partial, code == 206 && offset > 0).use { output -> request.inputStream.use { input ->
                    var total = if (code == 206) offset else 0L; val buffer = ByteArray(65536)
                    while (true) { check(!stopped()) { "Sync paused" }; val count = input.read(buffer); check(!stopped()) { "Sync paused" }; if (count < 0) break
                        total += count; check(total <= size); output.write(buffer, 0, count)
                        if (total == size || total % 1048576 < count) LocalSyncStore.publish(context, JSONObject().put("phase", "batch-downloading").put("progress", total.toDouble() / size)
                            .put("batchTotal", bundle.getJSONArray("chapters").length()).put("downloadedBytes", total).put("totalBytes", size))
                    }
                    check(total == size); output.fd.sync()
                } }
            } finally { LocalSyncRunner.transfers.release(request) }
        }
        check(partial.length() == size)
        val digest = MessageDigest.getInstance("SHA-256")
        partial.inputStream().use { input -> val buffer = ByteArray(65536); while (true) { check(!stopped()) { "Sync paused" }; val count = input.read(buffer); if (count < 0) break; digest.update(buffer, 0, count) } }
        if (digest.digest().joinToString("") { "%02x".format(it) } != hash) { partial.delete(); error("Batch checksum failed. Retry sync.") }
        return partial
    }
}
