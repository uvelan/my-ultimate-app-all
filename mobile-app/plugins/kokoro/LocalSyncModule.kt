package com.uvelan.ultimateapp

import android.app.*
import android.app.job.*
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import android.os.*
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONArray
import org.json.JSONObject
import java.io.*
import java.net.InetAddress
import java.net.URL
import java.security.KeyStore
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.cert.X509Certificate
import java.util.concurrent.*
import java.util.concurrent.atomic.AtomicBoolean
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.net.ssl.*

/** A paired PC is identified by its TLS key and service ID, never its DHCP address. */
object LocalSyncStore {
    private val lock = Any()
    @Volatile var active: JSONObject? = null
    private fun file(context: Context, name: String) = File(context.filesDir, name)
    fun read(context: Context, name: String, fallback: String): String = synchronized(lock) {
        try { file(context, name).readText() } catch (_: Exception) { fallback }
    }
    fun write(context: Context, name: String, value: String) = synchronized(lock) {
        val target = file(context, name); val temp = File(target.path + ".tmp")
        FileOutputStream(temp).use { it.write(value.toByteArray()); it.fd.sync() }
        check(temp.renameTo(target)) { "Unable to save sync progress" }
    }
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey("ultimate-local-sync", null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder("ultimate-local-sync", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    fun config(context: Context): JSONObject? = synchronized(lock) {
        try {
            val encoded = Base64.decode(read(context, "local-sync-config", ""), Base64.NO_WRAP)
            if (encoded.size <= 12) return null
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, encoded.copyOfRange(0, 12)))
            JSONObject(String(cipher.doFinal(encoded.copyOfRange(12, encoded.size))))
        } catch (_: Exception) { null }
    }
    fun saveConfig(context: Context, config: JSONObject) = synchronized(lock) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
        write(context, "local-sync-config", Base64.encodeToString(cipher.iv + cipher.doFinal(config.toString().toByteArray()), Base64.NO_WRAP))
    }
    fun queue(context: Context) = JSONArray(read(context, "local-sync-queue.json", "[]"))
    fun artifacts(context: Context) = JSONArray(read(context, "local-sync-artifacts.json", "[]"))
    fun status(context: Context) = JSONObject(read(context, "local-sync-status.json", "{\"phase\":\"idle\"}"))
    fun connectionStatus(context: Context) = JSONObject(read(context, "local-sync-connection.json", "{\"state\":\"unknown\"}"))
    fun connectionStatus(context: Context, state: String, message: String = "", host: String = "") = synchronized(lock) {
        val value = connectionStatus(context).put("state", state).put("message", message).put("checkedAt", System.currentTimeMillis())
        if (host.isNotEmpty()) value.put("host", host)
        if (state == "connected") value.put("lastConnectedAt", System.currentTimeMillis())
        write(context, "local-sync-connection.json", value.toString())
        LocalSyncModule.emit(JSONObject().put("phase", "connection-changed").put("connection", value))
    }
    fun paused(context: Context) = context.getSharedPreferences("local-sync", 0).getBoolean("paused", true)
    fun pause(context: Context, value: Boolean) { context.getSharedPreferences("local-sync", 0).edit().putBoolean("paused", value).apply() }
    fun updateQueue(context: Context, transform: (JSONArray) -> Unit) = synchronized(lock) {
        val jobs = queue(context); transform(jobs); write(context, "local-sync-queue.json", jobs.toString())
    }
    fun updateJob(context: Context, key: String, transform: (JSONObject) -> Unit) = updateQueue(context) { jobs ->
        for (index in 0 until jobs.length()) jobs.getJSONObject(index).let { if (it.getString("requestKey") == key) transform(it) }
    }
    fun jobState(context: Context, key: String, state: String) = synchronized(lock) {
        val jobs = queue(context)
        val entry = (0 until jobs.length()).map { jobs.getJSONObject(it) }.find { it.optString("requestKey") == key }
        if (entry != null && entry.optString("state") != state) {
            entry.put("state", state); write(context, "local-sync-queue.json", jobs.toString())
        }
    }
    fun publish(context: Context, value: JSONObject) {
        if (!LocalSyncRunner.transfers.workerIsCurrent()) return
        if (paused(context) && value.optString("phase") in listOf("queued", "generating", "downloading", "batch-generating", "batch-downloading", "verifying", "chapter-ready", "complete")) return
        active?.let { scope -> for (key in listOf("userId", "bookId", "voice", "chapterId", "chapterIndex", "rangeStart", "rangeEnd")) {
            if (!value.has(key) && scope.has(key)) value.put(key, scope.get(key))
        } }
        value.put("updatedAt", System.currentTimeMillis())
        write(context, "local-sync-status.json", value.toString())
        LocalSyncModule.emit(value)
    }
    fun commit(context: Context, artifact: JSONObject) = synchronized(lock) {
        val entries = artifacts(context); val next = JSONArray()
        for (index in 0 until entries.length()) if (entries.getJSONObject(index).getString("key") != artifact.getString("key")) next.put(entries.getJSONObject(index))
        next.put(artifact); write(context, "local-sync-artifacts.json", next.toString())
    }
    fun invalidateArtifact(context: Context, key: String) = synchronized(lock) {
        val entries = artifacts(context); val kept = JSONArray()
        for (index in 0 until entries.length()) {
            val entry = entries.getJSONObject(index)
            if (entry.getString("key") == key) File(android.net.Uri.parse(entry.getString("uri")).path!!).delete() else kept.put(entry)
        }
        write(context, "local-sync-artifacts.json", kept.toString())
    }
    /** Retain current/future chapters and exactly ten preceding chapters, across voices. */
    fun pruneBehindPlayback(context: Context): Int = synchronized(lock) {
        val playback = JSONObject(read(context, "local-pc-playback.json", "{}"))
        val cutoff = playback.optInt("chapterIndex", -1) - 10
        if (cutoff <= 0 || playback.optString("userId").isEmpty() || playback.optString("bookId").isEmpty()) return 0
        val directory = File(context.filesDir, "local-pc-audio").canonicalFile
        val entries = artifacts(context); val kept = JSONArray(); val removed = mutableSetOf<String>(); var bytes = 0L
        val playingUri = android.net.Uri.parse(playback.optString("uri"))
        if (playingUri.scheme != "file" || playingUri.path == null) return 0
        val playing = ChapterAudio(playback.getString("userId"), playback.getString("bookId"), playback.getInt("chapterIndex"), File(playingUri.path!!))
        for (index in 0 until entries.length()) {
            val item = entries.getJSONObject(index)
            val uri = android.net.Uri.parse(item.optString("uri"))
            val file = if (uri.scheme == "file" && uri.path != null) File(uri.path!!) else null
            if (file != null && LocalSyncRetention.removeOlder(directory, ChapterAudio(item.optString("userId"), item.optString("bookId"),
                    item.optInt("chapterIndex", -1), file), playing)) {
                removed.add(item.getString("key")); bytes += item.optLong("bytes")
            } else kept.put(item)
        }
        if (removed.isNotEmpty()) {
            write(context, "local-sync-artifacts.json", kept.toString())
            val queue = queue(context); val retained = JSONArray()
            for (index in 0 until queue.length()) {
                val entry = queue.getJSONObject(index)
                if (entry.optString("state") != "complete" || entry.optString("requestKey") !in removed) retained.put(entry)
            }
            write(context, "local-sync-queue.json", retained.toString())
            write(context, "local-sync-cleanup.json", JSONObject().put("chapters", removed.size).put("bytes", bytes)
                .put("updatedAt", System.currentTimeMillis()).toString())
        }
        removed.size
    }
}

class LocalSyncRetentionReceiver : android.content.BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val pending = goAsync()
        LocalSyncRunner.executor.execute { try { LocalSyncStore.pruneBehindPlayback(context) } catch (_: Exception) { /* Retry on the next checkpoint/snapshot. */ } finally { pending.finish() } }
    }
}

class SyncHttpException(val status: Int, message: String) : IOException(message)

object LocalSyncNet {
    private val main = Handler(Looper.getMainLooper())
    @Synchronized fun discover(context: Context): JSONArray {
        val result = JSONArray(); val latch = CountDownLatch(1); val finished = AtomicBoolean(false)
        val manager = context.getSystemService(Context.NSD_SERVICE) as NsdManager
        val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        val multicast = wifi.createMulticastLock("ultimate-local-discovery").apply { setReferenceCounted(false); acquire() }
        lateinit var listener: NsdManager.DiscoveryListener
        val pending = java.util.ArrayDeque<NsdServiceInfo>(); var resolving = false
        fun resolveNext() {
            if (finished.get() || resolving || pending.isEmpty()) return
            resolving = true
            manager.resolveService(pending.removeFirst(), object : NsdManager.ResolveListener {
                override fun onResolveFailed(service: NsdServiceInfo, error: Int) { resolving = false; resolveNext() }
                override fun onServiceResolved(service: NsdServiceInfo) {
                    if (!finished.get()) synchronized(result) {
                        val attributes = service.attributes
                        val id = attributes["id"]?.toString(Charsets.UTF_8)
                        val hosts = if (Build.VERSION.SDK_INT >= 34) service.hostAddresses else listOfNotNull(service.host)
                        for (address in hosts) {
                            val host = address.hostAddress
                            if (id != null && host != null && !host.contains(':')) result.put(JSONObject()
                                .put("id", id).put("name", service.serviceName).put("host", host).put("port", service.port))
                        }
                    }
                    resolving = false; resolveNext()
                }
            })
        }
        fun finish() {
            if (!finished.compareAndSet(false, true)) return
            try { manager.stopServiceDiscovery(listener) } catch (_: Exception) { }
            if (multicast.isHeld) multicast.release(); latch.countDown()
        }
        listener = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(type: String) {}
            override fun onServiceFound(service: NsdServiceInfo) { if (!finished.get()) { pending.add(service); resolveNext() } }
            override fun onServiceLost(service: NsdServiceInfo) {}
            override fun onDiscoveryStopped(type: String) { finish() }
            override fun onStartDiscoveryFailed(type: String, error: Int) { finish() }
            override fun onStopDiscoveryFailed(type: String, error: Int) { finish() }
        }
        main.post { try { manager.discoverServices("_ultimate-tts._tcp.", NsdManager.PROTOCOL_DNS_SD, listener) } catch (_: Exception) { finish() } }
        main.postDelayed({ finish() }, 6000)
        if (!latch.await(8, TimeUnit.SECONDS)) main.post { finish() }
        return synchronized(result) { JSONArray(result.toString()) }
    }
    fun connection(config: JSONObject, path: String, transfer: Boolean = false): HttpsURLConnection {
        val host = config.getString("host")
        check(host.matches(Regex("[0-9.]+"))) { "Use a local IPv4 address" }
        val address = InetAddress.getByName(host)
        check(address.isSiteLocalAddress || address.isLoopbackAddress || address.isLinkLocalAddress) { "PC must be on the local network" }
        val pin = config.getString("pin")
        check(pin.matches(Regex("[a-f0-9]{64}"))) { "Invalid PC certificate fingerprint" }
        val trust = object : X509TrustManager {
            override fun getAcceptedIssuers() = emptyArray<X509Certificate>()
            override fun checkClientTrusted(chain: Array<X509Certificate>, auth: String) { error("Client certificates are not used") }
            override fun checkServerTrusted(chain: Array<X509Certificate>, auth: String) {
                check(chain.isNotEmpty()); chain[0].checkValidity()
                val actual = MessageDigest.getInstance("SHA-256").digest(chain[0].encoded).joinToString("") { "%02x".format(it) }
                check(MessageDigest.isEqual(actual.toByteArray(), pin.toByteArray())) { "PC identity changed. Pair again using its new code." }
            }
        }
        val ssl = SSLContext.getInstance("TLS").apply { init(null, arrayOf(trust), SecureRandom()) }
        return (URL("https://$host:${config.getInt("port")}$path").openConnection() as HttpsURLConnection).apply {
            sslSocketFactory = ssl.socketFactory; hostnameVerifier = HostnameVerifier { _, _ -> true }
            instanceFollowRedirects = false; connectTimeout = 10000; readTimeout = 30000
            setRequestProperty("Connection", "close")
            if (config.has("token")) setRequestProperty("Authorization", "Bearer ${config.getString("token")}")
            if (transfer) LocalSyncRunner.transfers.track(this)
        }
    }
    fun request(config: JSONObject, path: String, body: JSONObject? = null): JSONObject {
        val transfer = path != "/v1/health" && path != "/v1/pair" && path != "/v1/jobs/" + "0".repeat(40)
        val request = connection(config, path, transfer)
        if (path == "/v1/health" || path == "/v1/jobs/" + "0".repeat(40)) { request.connectTimeout = 3000; request.readTimeout = 5000 }
        if (path == "/v1/bundles") request.readTimeout = 120_000
        try {
            if (body != null) {
                request.requestMethod = "POST"; request.doOutput = true
                request.setRequestProperty("Content-Type", "application/json")
                request.outputStream.use { it.write(body.toString().toByteArray()) }
            }
            val code = request.responseCode
            val input = if (code in 200..299) request.inputStream else request.errorStream
            val bytes = ByteArrayOutputStream()
            input?.use { stream -> val buffer = ByteArray(16384); while (true) {
                val count = stream.read(buffer); if (count < 0) break
                check(bytes.size() + count <= 2_000_000) { "PC response is too large" }; bytes.write(buffer, 0, count)
            } }
            val result = JSONObject(bytes.toString("UTF-8"))
            if (code !in 200..299) throw SyncHttpException(code, result.optString("error", "PC request failed ($code)"))
            return result
        } finally { if (transfer) LocalSyncRunner.transfers.release(request) else request.disconnect() }
    }
    fun resolve(context: Context, original: JSONObject): JSONObject {
        var failure: Exception? = null
        try {
            health(context, original)
            return original
        } catch (error: Exception) { failure = error }
        val found = discover(context)
        for (index in 0 until found.length()) {
            val peer = found.getJSONObject(index)
            if (peer.getString("id") == original.getString("id")) {
                val config = JSONObject(original.toString()).put("host", peer.getString("host")).put("port", peer.getInt("port"))
                try {
                    health(context, config)
                    LocalSyncStore.saveConfig(context, config); return config
                } catch (error: Exception) { failure = error /* A PC may advertise several network adapters. */ }
            }
        }
        throw IOException("PC unavailable. Check Wi-Fi and the PC sync service.", failure)
    }
    fun health(context: Context, config: JSONObject): JSONObject {
        val health = request(config, "/v1/health")
        check(health.getString("id") == config.getString("id")) { "PC identity changed. Pair again using its new code." }
        // /health is public on older PC services. Confirm the saved token still works.
        if (config.has("token")) {
            try { request(config, "/v1/jobs/" + "0".repeat(40)) }
            catch (error: SyncHttpException) { if (error.status != 404) throw error }
        }
        LocalSyncStore.connectionStatus(context, "connected", host = config.getString("host"))
        return health
    }
    fun failure(context: Context, error: Exception) {
        if (!LocalSyncRunner.transfers.workerIsCurrent()) return
        val causes = generateSequence<Throwable>(error) { it.cause }.toList()
        val auth = causes.any { (it is SyncHttpException && it.status == 401) || it is java.security.cert.CertificateException ||
            it is SSLPeerUnverifiedException || it.message?.contains("identity changed") == true }
        LocalSyncStore.connectionStatus(context, if (auth) "pairing-required" else "disconnected",
            if (auth) "PC authentication failed. Pair again using the code on your PC." else "PC disconnected. Check Wi-Fi and that the PC sync service is running.")
    }
    fun connectionFailure(error: Exception): Boolean = generateSequence<Throwable>(error) { it.cause }.any {
        it is java.net.SocketException || it is java.net.SocketTimeoutException || it is java.net.UnknownHostException ||
            it is SSLException || it is EOFException || (it is SyncHttpException && it.status == 401) ||
            it.message?.startsWith("PC unavailable.") == true
    }
    fun download(context: Context, config: JSONObject, jobId: String, manifest: JSONObject, stop: () -> Boolean): File {
        check(jobId.matches(Regex("[a-f0-9]{40}")))
        val key = manifest.getString("requestKey"); val hash = manifest.getString("sha256"); val size = manifest.getLong("bytes")
        check(key.matches(Regex("[a-f0-9]{16}")) && hash.matches(Regex("[a-f0-9]{64}")) && size in 45..200_000_000L)
        val directory = File(context.filesDir, "local-pc-audio").apply { mkdirs() }
        val output = File(directory, "kokoro-pc-$key-${hash.take(16)}.wav")
        val partial = File(directory, output.name + ".part")
        if (partial.length() > size) partial.delete()
        check(directory.usableSpace > size - partial.length() + 30_000_000) { "Not enough free phone storage" }
        if (partial.length() < size) {
            check(!stop()) { "Sync paused" }
            val request = connection(config, "/v1/jobs/$jobId/audio", transfer = true)
            try {
                val offset = partial.length()
                if (offset > 0) request.setRequestProperty("Range", "bytes=$offset-")
                val code = request.responseCode
                if (code != 200 && code != 206) throw SyncHttpException(code, "PC audio download failed ($code)")
                if (code == 206) check(request.getHeaderField("Content-Range")?.startsWith("bytes $offset-") == true)
                FileOutputStream(partial, code == 206 && offset > 0).use { stream ->
                    request.inputStream.use { input -> val buffer = ByteArray(65536); var total = if (code == 206) offset else 0L
                        while (true) {
                            check(!stop()) { "Sync paused" }; val count = input.read(buffer); check(!stop()) { "Sync paused" }; if (count < 0) break
                            total += count; check(total <= size) { "Unexpected audio length" }; stream.write(buffer, 0, count)
                            if (total == size || total % 1048576 < count) LocalSyncStore.publish(context, JSONObject().put("phase", "downloading")
                                .put("chapterId", manifest.getString("chapterId")).put("progress", total.toDouble() / size).put("downloadedBytes", total).put("totalBytes", size))
                        }
                    }; stream.fd.sync()
                }
            } finally { LocalSyncRunner.transfers.release(request) }
        }
        check(partial.length() == size) { "Incomplete chapter transfer" }
        LocalSyncStore.jobState(context, manifest.getString("requestKey"), "verifying")
        LocalSyncStore.publish(context, JSONObject().put("phase", "verifying").put("chapterId", manifest.getString("chapterId"))
            .put("progress", 1).put("downloadedBytes", size).put("totalBytes", size))
        val sha = MessageDigest.getInstance("SHA-256")
        partial.inputStream().use { input -> val buffer = ByteArray(65536); while (true) { check(!stop()) { "Sync paused" }; val count = input.read(buffer); if (count < 0) break; sha.update(buffer, 0, count) } }
        val actual = sha.digest().joinToString("") { "%02x".format(it) }
        if (actual != hash) { partial.delete(); error("Chapter checksum failed. Retry sync.") }
        RandomAccessFile(partial, "r").use { file -> val header = ByteArray(44); file.readFully(header)
            check(String(header, 0, 4) == "RIFF" && String(header, 8, 4) == "WAVE") { "PC did not return a WAV chapter" }
            val format = java.nio.ByteBuffer.wrap(header).order(java.nio.ByteOrder.LITTLE_ENDIAN)
            check(format.getShort(20).toInt() == 1 && format.getShort(22).toInt() == 1 && format.getInt(24) == 24000 && format.getShort(34).toInt() == 16 && format.getInt(40).toLong() == size - 44) { "Unsupported PC audio format" }
        }
        check(!stop()) { "Sync paused" }
        if (output.exists()) output.delete()
        check(partial.renameTo(output)) { "Unable to commit synced audio" }
        return output
    }
}

object LocalSyncRunner {
    val executor = Executors.newCachedThreadPool()
    val transfers = SyncTransferControl()
    private val wakeRetry = AtomicBoolean(false)
    fun isRunning() = transfers.busy()
    const val JOB = 76214
    fun start(context: Context, automatic: Boolean, revision: Long): Boolean {
        var launched = false
        transfers.resume(revision) {
            wakeRetry.set(true)
            LocalSyncStore.pause(context, false); schedule(context, automatic)
            launched = transfers.requestRun(revision) {
                val intent = Intent(context, LocalSyncForeground::class.java).putExtra("syncRevision", revision)
                if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent) else context.startService(intent)
            }
        }
        return launched
    }
    fun activate(entry: JSONObject) {
        val payload = entry.getJSONObject("payload")
        LocalSyncStore.active = JSONObject().put("userId", entry.getString("userId")).put("bookId", payload.getString("bookId"))
            .put("voice", payload.getString("voice")).put("chapterId", payload.getString("chapterId")).put("chapterIndex", entry.getInt("chapterIndex"))
        for (key in listOf("rangeStart", "rangeEnd")) if (entry.has(key)) LocalSyncStore.active?.put(key, entry.get(key))
    }
    fun schedule(context: Context, enabled: Boolean) {
        val manager = context.getSystemService(Context.JOB_SCHEDULER_SERVICE) as JobScheduler
        if (!enabled) { manager.cancel(JOB); return }
        val component = android.content.ComponentName(context, LocalSyncJob::class.java)
        manager.schedule(JobInfo.Builder(JOB, component).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setPeriodic(15 * 60 * 1000L).setPersisted(true).build())
    }
    private fun commitChapter(context: Context, config: JSONObject, entry: JSONObject, manifest: JSONObject, jobId: String, stopped: () -> Boolean) {
        activate(entry)
        val key = entry.getString("requestKey"); val payload = entry.getJSONObject("payload")
        check(manifest.getString("requestKey") == key && manifest.getString("chapterId") == payload.getString("chapterId") && manifest.getString("bookId") == payload.getString("bookId") && manifest.getString("voice") == payload.getString("voice")) { "Wrong chapter response" }
        check(manifest.getString("model") == "kokoro-v1.0" && manifest.getInt("sampleRate") == 24000)
        val segments = manifest.getJSONObject("sync").getJSONArray("segments"); val chunks = payload.getJSONArray("chunks")
        check(segments.length() == chunks.length()); var previous = 0.0
        for (index in 0 until segments.length()) {
            val segment = segments.getJSONObject(index)
            check(segment.getString("text") == chunks.getString(index) && kotlin.math.abs(segment.getDouble("start") - previous) < 0.001 && segment.getDouble("end") > previous)
            previous = segment.getDouble("end")
        }
        check(kotlin.math.abs(previous - (manifest.getLong("bytes") - 44) / 48000.0) < 0.01) { "Chapter timing does not match audio" }
        LocalSyncStore.jobState(context, key, "downloading")
        LocalSyncStore.publish(context, JSONObject().put("phase", "downloading").put("chapterId", payload.getString("chapterId")))
        val file = try { LocalSyncNet.download(context, config, jobId, manifest, stopped) }
            catch (error: Exception) {
                if (error is SyncHttpException && error.status == 404) LocalSyncStore.updateJob(context, key) { it.remove("jobId") }
                throw error
            }
        check(!stopped()) { "Sync paused" }
        val artifact = JSONObject().put("key", key).put("userId", entry.getString("userId")).put("bookId", payload.getString("bookId"))
            .put("chapterId", payload.getString("chapterId")).put("chapterIndex", entry.getInt("chapterIndex")).put("voice", payload.getString("voice"))
            .put("chunkTarget", entry.optInt("chunkTarget", 1000)).put("uri", android.net.Uri.fromFile(file).toString())
            .put("bytes", manifest.getLong("bytes")).put("sha256", manifest.getString("sha256")).put("sync", manifest.getJSONObject("sync"))
        LocalSyncStore.commit(context, artifact)
        LocalSyncStore.updateJob(context, key) { it.put("state", "complete"); it.remove("payload") }
        LocalSyncStore.publish(context, JSONObject().put("phase", "chapter-ready").put("key", key).put("chapterId", payload.getString("chapterId")).put("device", manifest.optString("device")))
        try { LocalSyncNet.request(config, "/v1/jobs/$jobId/ack", JSONObject().put("verified", true)) } catch (_: Exception) { }
        LocalSyncStore.pruneBehindPlayback(context)
    }
    fun run(context: Context, cancelled: () -> Boolean, deadline: Long = Long.MAX_VALUE, revision: Long = transfers.revision(), foreground: Boolean = false) {
        fun stopped() = !transfers.current(revision) || cancelled() || LocalSyncStore.paused(context) || System.currentTimeMillis() > deadline
        var run = transfers.enterRun(revision, foreground)
        while (run == null) {
            // A repeat call for the current run returns immediately. Only one
            // requested post-pause generation may wait for its cancelled predecessor.
            if (stopped() || !foreground || !transfers.pendingRun(revision)) return
            Thread.sleep(100)
            run = transfers.enterRun(revision, foreground)
        }
        transfers.bind(revision)
        var retries = 0
        try {
          while (!stopped()) {
           wakeRetry.set(false)
           try {
            var config = LocalSyncStore.config(context) ?: return
            LocalSyncStore.connectionStatus(context, "checking")
            config = LocalSyncNet.resolve(context, config)
            while (!stopped()) {
                val entry = transfers.nextOrFinish(run, {
                    val jobs = LocalSyncStore.queue(context)
                    (0 until jobs.length()).map { jobs.getJSONObject(it) }.firstOrNull { it.optString("state") != "complete" }
                }, { LocalSyncStore.publish(context, JSONObject().put("phase", "complete")) }) ?: break
                activate(entry)
                if (entry.optString("batchId").isNotEmpty() && LocalSyncBatch.distant(context, entry)) {
                    LocalSyncBatch.process(context, config, entry, ::stopped) { item, manifest, jobId -> commitChapter(context, config, item, manifest, jobId, ::stopped) }
                    continue
                }
                val key = entry.getString("requestKey"); val payload = entry.getJSONObject("payload")
                LocalSyncStore.publish(context, JSONObject().put("phase", "generating").put("chapterId", payload.getString("chapterId")).put("chapterIndex", entry.getInt("chapterIndex")))
                var jobId = entry.optString("jobId")
                if (jobId.isEmpty()) {
                    jobId = LocalSyncNet.request(config, "/v1/chapters", payload).getString("id")
                    LocalSyncStore.updateJob(context, key) { it.put("jobId", jobId) }
                }
                val status = try { LocalSyncNet.request(config, "/v1/jobs/$jobId") } catch (error: Exception) {
                    if (error is SyncHttpException && error.status == 404) LocalSyncStore.updateJob(context, key) { it.remove("jobId") }
                    throw error
                }
                retries = 0
                LocalSyncStore.jobState(context, key, if (status.optString("status") == "ready") "pc-ready" else status.optString("status"))
                LocalSyncStore.publish(context, JSONObject().put("phase", if (status.optString("status") == "queued") "queued" else "generating")
                    .put("chapterId", payload.getString("chapterId")).put("chapterIndex", entry.getInt("chapterIndex")).put("progress", status.optDouble("progress", 0.0)))
                when (status.getString("status")) {
                    "error", "cancelled" -> {
                        LocalSyncStore.updateJob(context, key) { it.remove("jobId") }
                        error(status.optString("error", "PC generation failed"))
                    }
                    "ready" -> {
                        commitChapter(context, config, entry, status.getJSONObject("manifest"), jobId, ::stopped)
                    }
                    else -> { Thread.sleep(2000) }
                }
            }
            break
           } catch (error: Exception) {
            if (stopped()) break
            val network = LocalSyncNet.connectionFailure(error)
            if (network) LocalSyncNet.failure(context, error)
            val auth = LocalSyncStore.connectionStatus(context).optString("state") == "pairing-required"
            val retryable = network || (error is SyncHttpException && (error.status == 404 || error.status == 429 || error.status >= 500))
            val delay = if (retryable && !auth && retries < 3) 5000L * (1L shl retries++) else 0L
            val last = LocalSyncStore.status(context)
            LocalSyncStore.publish(context, JSONObject().put("phase", if (network) "waiting" else "error")
                .put("message", error.message ?: "PC sync interrupted").put("retryAt", if (delay > 0) System.currentTimeMillis() + delay else 0)
                .put("retryAttempt", retries).put("progress", last.optDouble("progress", 0.0))
                .put("chapterId", last.optString("chapterId")).put("chapterIndex", last.optInt("chapterIndex", -1))
                .put("downloadedBytes", last.optLong("downloadedBytes")).put("totalBytes", last.optLong("totalBytes")))
            if (delay == 0L) break
            val until = System.currentTimeMillis() + delay
            while (!stopped() && !wakeRetry.get() && System.currentTimeMillis() < until) Thread.sleep(250)
           }
          }
        } finally {
            transfers.unbind()
            if (transfers.ownsRun(run)) LocalSyncStore.active = null
            transfers.finishRun(run)
        }
    }
}

class LocalSyncForeground : Service() {
    private val cancelled = AtomicBoolean(false)
    @Volatile private var latestStartId = 0
    override fun onBind(intent: Intent?) = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        latestStartId = startId
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(NotificationChannel("pc-audio-sync", "PC chapter sync", NotificationManager.IMPORTANCE_LOW))
        val launch = packageManager.getLaunchIntentForPackage(packageName)
        val builder = (if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, "pc-audio-sync") else Notification.Builder(this)).setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle("Syncing audiobook chapters from PC").setContentText("Complete chapters are verified and saved on this phone.").setOngoing(true)
        if (launch != null) builder.setContentIntent(PendingIntent.getActivity(this, 76214, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
        if (Build.VERSION.SDK_INT >= 29) startForeground(76214, builder.build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC) else startForeground(76214, builder.build())
        cancelled.set(false)
        val revision = intent?.getLongExtra("syncRevision", LocalSyncRunner.transfers.revision()) ?: LocalSyncRunner.transfers.revision()
        LocalSyncRunner.executor.execute {
            LocalSyncRunner.run(applicationContext, { cancelled.get() }, revision = revision, foreground = true)
            val completedStartId = latestStartId
            if (!LocalSyncRunner.isRunning()) stopSelfResult(completedStartId)
        }
        return START_STICKY
    }
    override fun onDestroy() { cancelled.set(true); super.onDestroy() }
}

class LocalSyncJob : JobService() {
    private val cancelled = AtomicBoolean(false)
    override fun onStartJob(params: JobParameters): Boolean {
        cancelled.set(false)
        LocalSyncRunner.executor.execute {
            LocalSyncRunner.run(applicationContext, { cancelled.get() }, System.currentTimeMillis() + 5 * 60 * 1000L)
            jobFinished(params, false)
        }
        return true
    }
    override fun onStopJob(params: JobParameters): Boolean { cancelled.set(true); return true }
}

class LocalSyncModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    init { instance = this }
    companion object {
        @Volatile private var instance: LocalSyncModule? = null
        fun emit(value: JSONObject) {
            val module = instance ?: return
            if (module.reactApplicationContext.hasActiveReactInstance()) module.reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("LocalSync", value.toString())
        }
    }
    override fun getName() = "LocalChapterSync"
    @ReactMethod fun addListener(name: String) {}
    @ReactMethod fun removeListeners(count: Int) {}
    private fun task(promise: Promise, block: () -> Any?) { LocalSyncRunner.executor.execute { try { promise.resolve(block()) } catch (error: Exception) { promise.reject("LOCAL_SYNC", error.message, error) } } }
    @ReactMethod fun discover(promise: Promise) = task(promise) { LocalSyncNet.discover(reactApplicationContext).toString() }
    @ReactMethod fun openDrivePackage(uri: String, promise: Promise) = task(promise) { DriveAudioImport.open(reactApplicationContext, uri) }
    @ReactMethod fun driveManifest(token: String, identity: String, promise: Promise) = task(promise) { DriveAudioImport.manifest(token, identity) }
    @ReactMethod fun importDriveChapter(token: String, request: String, promise: Promise) = task(promise) { DriveAudioImport.importChapter(reactApplicationContext, token, request) }
    @ReactMethod fun closeDrivePackage(token: String, promise: Promise) = task(promise) { DriveAudioImport.close(token) }
    @ReactMethod fun pair(bundle: String, host: String, port: Int, promise: Promise) = task(promise) {
        val fields = bundle.trim().split('.')
        check(fields.size == 4 && fields[0] == "svc1" && fields[1].matches(Regex("[a-f0-9]{32}")) && fields[2].matches(Regex("[a-f0-9]{64}"))) { "Paste or scan the pairing code displayed on the PC" }
        val config = JSONObject().put("id", fields[1]).put("pin", fields[2]).put("host", host).put("port", port)
        var verified = try { LocalSyncNet.request(config, "/v1/health").getString("id") == fields[1] } catch (_: Exception) { false }
        if (!verified) {
            val discovered = LocalSyncNet.discover(reactApplicationContext)
            for (index in 0 until discovered.length()) {
                val peer = discovered.getJSONObject(index)
                if (peer.getString("id") != fields[1]) continue
                config.put("host", peer.getString("host")).put("port", peer.getInt("port"))
                verified = try { LocalSyncNet.request(config, "/v1/health").getString("id") == fields[1] } catch (_: Exception) { false }
                if (verified) break
            }
        }
        check(verified) { "The paired PC could not be verified at this address" }
        val response = LocalSyncNet.request(config, "/v1/pair", JSONObject().put("secret", fields[3]).put("name", Build.MODEL))
        config.put("token", response.getString("token")); LocalSyncStore.saveConfig(reactApplicationContext, config)
        LocalSyncNet.health(reactApplicationContext, config)
        JSONObject().put("paired", true).put("id", fields[1]).toString()
    }
    @ReactMethod fun snapshot(promise: Promise) = task(promise) {
        LocalSyncStore.pruneBehindPlayback(reactApplicationContext)
        val status = LocalSyncStore.status(reactApplicationContext)
        if (!LocalSyncRunner.isRunning() && !LocalSyncStore.paused(reactApplicationContext) && status.optString("phase") in
            listOf("queued", "generating", "downloading", "batch-generating", "batch-downloading", "verifying")) {
            status.put("phase", "resume-needed").put("message", "Transfers are not running. Tap Reconnect to resume.").put("retryAt", 0)
        }
        JSONObject().put("paired", LocalSyncStore.config(reactApplicationContext) != null).put("status", status)
            .put("connection", LocalSyncStore.connectionStatus(reactApplicationContext))
            .put("cleanup", JSONObject(LocalSyncStore.read(reactApplicationContext, "local-sync-cleanup.json", "{}")))
            .put("artifacts", JSONArray().apply {
                val artifacts = LocalSyncStore.artifacts(reactApplicationContext)
                for (index in 0 until artifacts.length()) {
                    val item = artifacts.getJSONObject(index); val uri = android.net.Uri.parse(item.optString("uri"))
                    if (uri.scheme == "file" && uri.path != null && File(uri.path!!).isFile && File(uri.path!!).length() == item.optLong("bytes")) put(item)
                }
            }).put("paused", LocalSyncStore.paused(reactApplicationContext))
            .put("queue", JSONArray().apply { val entries = LocalSyncStore.queue(reactApplicationContext)
                for (index in 0 until entries.length()) { val item = entries.getJSONObject(index); put(JSONObject().put("key", item.getString("requestKey"))
                    .put("chapterIndex", item.optInt("chapterIndex")).put("userId", item.optString("userId")).put("bookId", item.optString("bookId", item.optJSONObject("payload")?.optString("bookId") ?: ""))
                    .put("voice", item.optString("voice", item.optJSONObject("payload")?.optString("voice") ?: "")).put("state", item.optString("state"))) }
            }).put("playback", JSONObject(LocalSyncStore.read(reactApplicationContext, "local-pc-playback.json", "{}"))).toString()
    }
    @ReactMethod fun health(promise: Promise) = task(promise) {
        val config = LocalSyncStore.config(reactApplicationContext) ?: error("Pair a PC first")
        try { LocalSyncNet.health(reactApplicationContext, config).toString() }
        catch (error: Exception) { LocalSyncNet.failure(reactApplicationContext, error); throw error }
    }
    @ReactMethod fun reconnect(host: String, automatic: Boolean, promise: Promise) {
      val revision = LocalSyncRunner.transfers.revision()
      task(promise) {
        val context = reactApplicationContext
        val original = LocalSyncStore.config(context) ?: error("Pair a PC first")
        LocalSyncStore.connectionStatus(context, "checking")
        try {
            val candidate = JSONObject(original.toString())
            if (host.isNotBlank()) candidate.put("host", host.trim())
            val config = LocalSyncNet.resolve(context, candidate)
            LocalSyncStore.saveConfig(context, config)
            val health = LocalSyncNet.health(context, config)
            val queue = LocalSyncStore.queue(context)
            if ((0 until queue.length()).any { queue.getJSONObject(it).optString("state") != "complete" }) LocalSyncRunner.start(context, automatic, revision)
            health.toString()
        } catch (error: Exception) { LocalSyncNet.failure(context, error); throw error }
      }
    }
    @ReactMethod fun setAutomatic(enabled: Boolean, promise: Promise) {
      val revision = LocalSyncRunner.transfers.revision()
      task(promise) {
        LocalSyncRunner.transfers.ifRevision(revision) { LocalSyncRunner.schedule(reactApplicationContext, enabled && !LocalSyncStore.paused(reactApplicationContext)) }; true
      }
    }
    @ReactMethod fun enqueue(batch: String, automatic: Boolean, promise: Promise) {
      val revision = LocalSyncRunner.transfers.revision()
      task(promise) {
        check(LocalSyncStore.config(reactApplicationContext) != null) { "Pair a PC first" }
        val incoming = JSONArray(batch); check(incoming.length() in 1..50)
        val alreadyRunning = LocalSyncRunner.isRunning()
        LocalSyncStore.updateQueue(reactApplicationContext) { queue ->
            for (index in 0 until incoming.length()) {
                val entry = incoming.getJSONObject(index); val key = entry.getString("requestKey")
                entry.put("bookId", entry.getJSONObject("payload").getString("bookId")).put("voice", entry.getJSONObject("payload").getString("voice"))
                check(key.matches(Regex("[a-f0-9]{16}")))
                val existing = (0 until queue.length()).map { queue.getJSONObject(it) }.find { it.getString("requestKey") == key }
                if (existing == null) queue.put(entry.put("state", "queued"))
                else if (existing.optString("state") != "complete") {
                    if (!alreadyRunning) {
                        existing.put("batchId", entry.optString("batchId")).put("playbackIndex", entry.optInt("playbackIndex")).put("playbackRevision", entry.optLong("playbackRevision"))
                        for (name in listOf("rangeStart", "rangeEnd")) if (entry.has(name)) existing.put(name, entry.get(name))
                    }
                }
                else if (existing.optString("state") == "complete") {
                    val artifacts = LocalSyncStore.artifacts(reactApplicationContext)
                    val valid = (0 until artifacts.length()).map { artifacts.getJSONObject(it) }.any {
                        it.getString("key") == key && File(android.net.Uri.parse(it.getString("uri")).path!!).length() == it.getLong("bytes")
                    }
                    if (!valid) { existing.put("payload", entry.getJSONObject("payload")).put("state", "queued"); existing.remove("jobId") }
                }
            }
        }
        LocalSyncRunner.start(reactApplicationContext, automatic, revision)
      }
    }
    @ReactMethod fun pause(promise: Promise) {
        try {
            LocalSyncRunner.transfers.pause {
                LocalSyncStore.pause(reactApplicationContext, true); LocalSyncRunner.schedule(reactApplicationContext, false)
                LocalSyncStore.publish(reactApplicationContext, JSONObject().put("phase", "paused"))
            }
            promise.resolve(true)
        } catch (error: Exception) { promise.reject("LOCAL_SYNC", error.message, error) }
    }
    @ReactMethod fun invalidateAudio(key: String, promise: Promise) = task(promise) {
        LocalSyncStore.invalidateArtifact(reactApplicationContext, key); true
    }
    override fun invalidate() { if (instance === this) instance = null; super.invalidate() }
}
