package com.uvelan.ultimateapp

import android.content.Context
import android.net.Uri
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest
import java.util.UUID
import java.util.zip.ZipFile

/** User-selected Drive ZIPs are data, never filesystem paths or database IDs. */
object DriveAudioImport {
    private val lock = Any()
    private val sessions = mutableMapOf<String, File>()
    private val id = Regex("[a-f0-9]{64}")
    private fun text(value: String) = value.replace(Regex("<[^>]*>"), " ").replace(Regex("[#*~_>]"), "")
        .replace(Regex("[\\s\\p{Z}]+"), " ").trim()
    private fun body(value: String, title: String): String {
        val normalized = text(value); val heading = text(title)
        return if (heading.isNotEmpty() && (normalized.startsWith("$heading ") || normalized.startsWith("$heading. ") || normalized == heading))
            normalized.removePrefix(heading).trimStart(' ', '.', ':') else normalized
    }
    private fun json(zip: ZipFile, path: String, limit: Int = 4_000_000): JSONObject {
        val entry = zip.getEntry(path) ?: error("Package is missing $path")
        check(entry.size in 1..limit.toLong()) { "Invalid package metadata size" }
        val bytes = zip.getInputStream(entry).use { input ->
            val output = java.io.ByteArrayOutputStream(); val buffer = ByteArray(8192)
            while (true) {
                val count = input.read(buffer); if (count < 0) break
                check(output.size() + count <= limit) { "Package metadata is too large" }
                output.write(buffer, 0, count)
            }
            output.toByteArray()
        }
        check(bytes.size <= limit) { "Package metadata is too large" }
        return JSONObject(String(bytes, Charsets.UTF_8))
    }
    private fun catalog(zip: ZipFile): JSONObject {
        val catalog = json(zip, "book.json")
        check(catalog.optString("schema") == "ultimate-drive-audio" && catalog.optInt("schemaVersion") == 1) { "Unsupported audio package" }
        check(catalog.getString("bookId").matches(Regex("epub-[a-f0-9]{64}")))
        check(catalog.getJSONArray("chapters").length() <= 10000 && catalog.getJSONObject("recordings").length() <= 10000)
        return catalog
    }
    fun open(context: Context, source: String): String = synchronized(lock) {
        check(sessions.isEmpty()) { "Close the current Drive import first" }
        // Remove abandoned private imports left by a killed app process.
        context.cacheDir.listFiles()?.filter { it.name.startsWith("drive-import-") && it.name.endsWith(".zip") }?.forEach { it.delete() }
        val uri = Uri.parse(source)
        check(uri.scheme == "content" || (uri.scheme == "file" && File(uri.path!!).canonicalPath.startsWith(context.cacheDir.canonicalPath + File.separator))) { "Choose a package using the file picker" }
        val file = File(context.cacheDir, "drive-import-${UUID.randomUUID()}.zip")
        try {
            context.contentResolver.openInputStream(uri)!!.use { input ->
                FileOutputStream(file).use { output ->
                    val buffer = ByteArray(65536); var total = 0L
                    while (true) {
                        val count = input.read(buffer); if (count < 0) break
                        total += count
                        check(total <= 4_000_000_000L && context.cacheDir.usableSpace > count + 30_000_000) { "Not enough storage, or package exceeds 4 GB. Export a smaller range." }
                        output.write(buffer, 0, count)
                    }
                    output.fd.sync()
                }
            }
            val data = ZipFile(file).use { zip ->
                val names = mutableSetOf<String>(); val entries = zip.entries()
                while (entries.hasMoreElements()) {
                    val entry = entries.nextElement()
                    check(names.add(entry.name) && names.size <= 30000) { "Duplicate or excessive ZIP entries" }
                }
                catalog(zip)
            }
            val token = UUID.randomUUID().toString(); sessions[token] = file
            JSONObject().put("token", token).put("catalog", data).toString()
        } catch (error: Exception) { file.delete(); throw error }
    }
    fun manifest(token: String, identity: String): String = synchronized(lock) {
        check(id.matches(identity)) { "Invalid recording identity" }
        ZipFile(sessions[token] ?: error("Choose the package again")).use { zip ->
            val record = catalog(zip).getJSONObject("recordings").getJSONObject(identity)
            check(record.getString("manifestFile") == "chapters/$identity.json")
            json(zip, "chapters/$identity.json").toString()
        }
    }
    fun importChapter(context: Context, token: String, raw: String): String = synchronized(lock) {
        val request = JSONObject(raw); val identity = request.getString("identity")
        check(id.matches(identity))
        ZipFile(sessions[token] ?: error("Choose the package again")).use { zip ->
            val data = catalog(zip)
            val manifest = json(zip, "chapters/$identity.json")
            val entry = zip.getEntry("chapters/$identity.wav") ?: error("Missing chapter audio")
            publish(context, request, data, manifest, entry.size) { zip.getInputStream(entry) }
        }
    }
    fun publish(context: Context, request: JSONObject, catalog: JSONObject, manifest: JSONObject,
                audioSize: Long, openAudio: () -> java.io.InputStream): String {
        check(catalog.optString("schema") == "ultimate-drive-audio" && catalog.optInt("schemaVersion") == 1)
        check(catalog.getString("bookId").matches(Regex("epub-[a-f0-9]{64}")))
        val identity = request.getString("identity"); val key = request.getString("key")
        check(id.matches(identity) && key.matches(Regex("[a-f0-9]{16}")))
        for (field in listOf("userId", "bookId", "chapterId")) check(request.getString(field).length in 1..500)
        check(request.getInt("chapterIndex") >= 0)
        val record = catalog.getJSONObject("recordings").getJSONObject(identity)
        check(manifest.optString("schema") == "ultimate-drive-chapter" && manifest.optInt("schemaVersion") == 1)
        check(manifest.getString("identity") == identity && manifest.getString("bookId") == catalog.getString("bookId"))
        check(manifest.getString("chapterId") == record.getString("chapterId"))
        check(manifest.getString("voice") in listOf("af_bella", "af_heart") && manifest.getString("voice") == request.getString("voice"))
        check(manifest.getString("model") == "kokoro-v1.0" && manifest.getString("format") == "wav" && manifest.getInt("sampleRate") == 24000) { "Import requires Kokoro 24 kHz WAV audio" }
        val hash = manifest.getString("sha256"); val size = manifest.getLong("bytes")
        check(id.matches(hash) && size in 45..200_000_000L && hash == record.getString("sha256") && size == record.getLong("bytes"))
        check(record.getString("audioFile") == "chapters/$identity.wav")
        val sync = manifest.getJSONObject("sync"); val paragraphs = sync.getJSONArray("paragraphs")
        val sourceText = (0 until paragraphs.length()).joinToString(" ") { paragraphs.getString(it) }
        val expected = request.getString("expectedText")
        check(expected.isNotBlank() && body(sourceText, sync.getString("title")) == expected) { "Chapter text does not match this mobile book" }
        val segments = sync.getJSONArray("segments"); var end = 0.0
        check(sync.getInt("version") == 1 && segments.length() in 1..10000)
        for (index in 0 until segments.length()) {
            val segment = segments.getJSONObject(index); val start = segment.getDouble("start"); val next = segment.getDouble("end")
            check(start.isFinite() && next.isFinite() && kotlin.math.abs(start - end) < .001 && next > start && segment.getString("text").isNotBlank()) { "Invalid audio timings" }
            end = next
        }
        val spokenText = (0 until segments.length()).joinToString(" ") { segments.getJSONObject(it).getString("text") }
        check(body(spokenText, sync.getString("title")) == expected) { "Spoken passages do not match chapter text" }
        check(kotlin.math.abs(end - (size - 44) / 48000.0) < .01) { "Audio duration differs from chapter timings" }
        val directory = File(context.filesDir, "local-pc-audio").apply { mkdirs() }
        check(directory.usableSpace > size + 30_000_000) { "Not enough free phone storage" }
        val partial = File(directory, "drive-${UUID.randomUUID()}.part")
        val output = File(directory, "kokoro-drive-$key-${hash.take(16)}-${UUID.randomUUID()}.wav")
        return try {
            check(audioSize == size) { "Audio size differs from manifest" }
            openAudio().use { input -> DriveAudioChecks.copyVerified(input, partial, size, hash) }
            // Immutable URI; an existing playback file is never overwritten.
            if (output.exists()) partial.delete() else check(partial.renameTo(output)) { "Unable to save imported chapter" }
            val mobileSync = JSONObject(sync.toString()).put("title", request.getString("title")).put("paragraphs", request.getJSONArray("paragraphs"))
            val artifact = JSONObject().put("key", key).put("userId", request.getString("userId")).put("bookId", request.getString("bookId"))
                .put("chapterId", request.getString("chapterId")).put("chapterIndex", request.getInt("chapterIndex"))
                .put("voice", request.getString("voice")).put("chunkTarget", request.optInt("chunkTarget", 1000))
                .put("uri", Uri.fromFile(output).toString()).put("bytes", size).put("sha256", hash).put("sync", mobileSync)
            LocalSyncStore.commit(context, artifact)
            artifact.toString()
        } finally { partial.delete() }
    }
    fun close(token: String) = synchronized(lock) { sessions.remove(token)?.delete(); true }
}
