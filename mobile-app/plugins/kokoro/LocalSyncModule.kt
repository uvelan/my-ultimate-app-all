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
    fun paused(context: Context) = context.getSharedPreferences("local-sync", 0).getBoolean("paused", true)
    fun pause(context: Context, value: Boolean) { context.getSharedPreferences("local-sync", 0).edit().putBoolean("paused", value).apply() }
    fun updateQueue(context: Context, transform: (JSONArray) -> Unit) = synchronized(lock) {
        val jobs = queue(context); transform(jobs); write(context, "local-sync-queue.json", jobs.toString())
    }
    fun updateJob(context: Context, key: String, transform: (JSONObject) -> Unit) = updateQueue(context) { jobs ->
        for (index in 0 until jobs.length()) jobs.getJSONObject(index).let { if (it.getString("requestKey") == key) transform(it) }
    }
    fun publish(context: Context, value: JSONObject) {
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
}

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
    fun connection(config: JSONObject, path: String): HttpsURLConnection {
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
        }
    }
    fun request(config: JSONObject, path: String, body: JSONObject? = null): JSONObject {
        val request = connection(config, path)
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
            check(code in 200..299) { result.optString("error", "PC request failed ($code)") }
            return result
        } finally { request.disconnect() }
    }
    fun resolve(context: Context, original: JSONObject): JSONObject {
        try {
            check(request(original, "/v1/health").getString("id") == original.getString("id")) { "Wrong PC identity" }
            return original
        } catch (_: Exception) { }
        val found = discover(context)
        for (index in 0 until found.length()) {
            val peer = found.getJSONObject(index)
            if (peer.getString("id") == original.getString("id")) {
                val config = JSONObject(original.toString()).put("host", peer.getString("host")).put("port", peer.getInt("port"))
                try {
                    check(request(config, "/v1/health").getString("id") == config.getString("id"))
                    LocalSyncStore.saveConfig(context, config); return config
                } catch (_: Exception) { /* A PC may advertise several network adapters. */ }
            }
        }
        error("PC unavailable. Sync will retry automatically when it is reachable.")
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
            val request = connection(config, "/v1/jobs/$jobId/audio")
            try {
                val offset = partial.length()
                if (offset > 0) request.setRequestProperty("Range", "bytes=$offset-")
                val code = request.responseCode
                check(code == 200 || code == 206) { "PC audio download failed ($code)" }
                if (code == 206) check(request.getHeaderField("Content-Range")?.startsWith("bytes $offset-") == true)
                FileOutputStream(partial, code == 206 && offset > 0).use { stream ->
                    request.inputStream.use { input -> val buffer = ByteArray(65536); var total = if (code == 206) offset else 0L
                        while (true) {
                            check(!stop()) { "Sync paused" }; val count = input.read(buffer); if (count < 0) break
                            total += count; check(total <= size) { "Unexpected audio length" }; stream.write(buffer, 0, count)
                            if (total == size || total % 1048576 < count) LocalSyncStore.publish(context, JSONObject().put("phase", "downloading")
                                .put("chapterId", manifest.getString("chapterId")).put("progress", total.toDouble() / size).put("downloadedBytes", total).put("totalBytes", size))
                        }
                    }; stream.fd.sync()
                }
            } finally { request.disconnect() }
        }
        check(partial.length() == size) { "Incomplete chapter transfer" }
        val sha = MessageDigest.getInstance("SHA-256")
        partial.inputStream().use { input -> val buffer = ByteArray(65536); while (true) { val count = input.read(buffer); if (count < 0) break; sha.update(buffer, 0, count) } }
        val actual = sha.digest().joinToString("") { "%02x".format(it) }
        if (actual != hash) { partial.delete(); error("Chapter checksum failed. Retry sync.") }
        RandomAccessFile(partial, "r").use { file -> val header = ByteArray(44); file.readFully(header)
            check(String(header, 0, 4) == "RIFF" && String(header, 8, 4) == "WAVE") { "PC did not return a WAV chapter" }
            val format = java.nio.ByteBuffer.wrap(header).order(java.nio.ByteOrder.LITTLE_ENDIAN)
            check(format.getShort(20).toInt() == 1 && format.getShort(22).toInt() == 1 && format.getInt(24) == 24000 && format.getShort(34).toInt() == 16 && format.getInt(40).toLong() == size - 44) { "Unsupported PC audio format" }
        }
        if (output.exists()) output.delete()
        check(partial.renameTo(output)) { "Unable to commit synced audio" }
        return output
    }
}

object LocalSyncRunner {
    val executor = Executors.newCachedThreadPool()
    private val running = AtomicBoolean(false)
    const val JOB = 76214
    fun schedule(context: Context, enabled: Boolean) {
        val manager = context.getSystemService(Context.JOB_SCHEDULER_SERVICE) as JobScheduler
        if (!enabled) { manager.cancel(JOB); return }
        val component = android.content.ComponentName(context, LocalSyncJob::class.java)
        manager.schedule(JobInfo.Builder(JOB, component).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setPeriodic(15 * 60 * 1000L).setPersisted(true).build())
    }
    private fun commitChapter(context: Context, config: JSONObject, entry: JSONObject, manifest: JSONObject, jobId: String, stopped: () -> Boolean) {
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
        LocalSyncStore.publish(context, JSONObject().put("phase", "downloading").put("chapterId", payload.getString("chapterId")))
        val file = try { LocalSyncNet.download(context, config, jobId, manifest, stopped) }
            catch (error: Exception) { LocalSyncStore.updateJob(context, key) { it.remove("jobId") }; throw error }
        val artifact = JSONObject().put("key", key).put("userId", entry.getString("userId")).put("bookId", payload.getString("bookId"))
            .put("chapterId", payload.getString("chapterId")).put("chapterIndex", entry.getInt("chapterIndex")).put("voice", payload.getString("voice"))
            .put("chunkTarget", entry.optInt("chunkTarget", 1000)).put("uri", android.net.Uri.fromFile(file).toString())
            .put("bytes", manifest.getLong("bytes")).put("sha256", manifest.getString("sha256")).put("sync", manifest.getJSONObject("sync"))
        LocalSyncStore.commit(context, artifact)
        LocalSyncStore.updateJob(context, key) { it.put("state", "complete"); it.remove("payload") }
        LocalSyncStore.publish(context, JSONObject().put("phase", "chapter-ready").put("key", key).put("chapterId", payload.getString("chapterId")).put("device", manifest.optString("device")))
        try { LocalSyncNet.request(config, "/v1/jobs/$jobId/ack", JSONObject().put("verified", true)) } catch (_: Exception) { }
    }
    fun run(context: Context, cancelled: () -> Boolean, deadline: Long = Long.MAX_VALUE) {
        while (!running.compareAndSet(false, true)) {
            if (cancelled() || LocalSyncStore.paused(context) || System.currentTimeMillis() > deadline) return
            Thread.sleep(500)
        }
        fun stopped() = cancelled() || LocalSyncStore.paused(context) || System.currentTimeMillis() > deadline
        try {
            var config = LocalSyncStore.config(context) ?: return
            config = LocalSyncNet.resolve(context, config)
            while (!stopped()) {
                val jobs = LocalSyncStore.queue(context)
                var selected: JSONObject? = null
                for (index in 0 until jobs.length()) if (jobs.getJSONObject(index).optString("state") != "complete") { selected = jobs.getJSONObject(index); break }
                val entry = selected ?: break
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
                    LocalSyncStore.updateJob(context, key) { it.remove("jobId") }; throw error
                }
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
            if (!stopped()) LocalSyncStore.publish(context, JSONObject().put("phase", "complete"))
        } catch (error: Exception) {
            if (!stopped()) LocalSyncStore.publish(context, JSONObject().put("phase", "waiting").put("message", error.message ?: "PC sync interrupted; it will retry automatically"))
        } finally { running.set(false) }
    }
}

class LocalSyncForeground : Service() {
    private val cancelled = AtomicBoolean(false)
    private val working = AtomicBoolean(false)
    override fun onBind(intent: Intent?) = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(NotificationChannel("pc-audio-sync", "PC chapter sync", NotificationManager.IMPORTANCE_LOW))
        val launch = packageManager.getLaunchIntentForPackage(packageName)
        val builder = (if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, "pc-audio-sync") else Notification.Builder(this)).setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle("Syncing audiobook chapters from PC").setContentText("Complete chapters are verified and saved on this phone.").setOngoing(true)
        if (launch != null) builder.setContentIntent(PendingIntent.getActivity(this, 76214, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
        if (Build.VERSION.SDK_INT >= 29) startForeground(76214, builder.build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC) else startForeground(76214, builder.build())
        if (working.compareAndSet(false, true)) {
            cancelled.set(false)
            LocalSyncRunner.executor.execute { LocalSyncRunner.run(applicationContext, { cancelled.get() }); working.set(false); stopSelf() }
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
        JSONObject().put("paired", true).put("id", fields[1]).toString()
    }
    @ReactMethod fun snapshot(promise: Promise) = task(promise) {
        JSONObject().put("paired", LocalSyncStore.config(reactApplicationContext) != null).put("status", LocalSyncStore.status(reactApplicationContext))
            .put("artifacts", LocalSyncStore.artifacts(reactApplicationContext)).put("paused", LocalSyncStore.paused(reactApplicationContext))
            .put("queue", JSONArray().apply { val entries = LocalSyncStore.queue(reactApplicationContext)
                for (index in 0 until entries.length()) { val item = entries.getJSONObject(index); put(JSONObject().put("key", item.getString("requestKey"))
                    .put("chapterIndex", item.optInt("chapterIndex")).put("userId", item.optString("userId")).put("state", item.optString("state"))) }
            }).put("playback", JSONObject(LocalSyncStore.read(reactApplicationContext, "local-pc-playback.json", "{}"))).toString()
    }
    @ReactMethod fun health(promise: Promise) = task(promise) {
        val config = LocalSyncStore.config(reactApplicationContext) ?: error("Pair a PC first")
        LocalSyncNet.request(LocalSyncNet.resolve(reactApplicationContext, config), "/v1/health").toString()
    }
    @ReactMethod fun setAutomatic(enabled: Boolean, promise: Promise) = task(promise) {
        LocalSyncRunner.schedule(reactApplicationContext, enabled); true
    }
    @ReactMethod fun enqueue(batch: String, automatic: Boolean, promise: Promise) = task(promise) {
        check(LocalSyncStore.config(reactApplicationContext) != null) { "Pair a PC first" }
        val incoming = JSONArray(batch); check(incoming.length() in 1..50)
        LocalSyncStore.updateQueue(reactApplicationContext) { queue ->
            for (index in 0 until incoming.length()) {
                val entry = incoming.getJSONObject(index); val key = entry.getString("requestKey")
                check(key.matches(Regex("[a-f0-9]{16}")))
                val existing = (0 until queue.length()).map { queue.getJSONObject(it) }.find { it.getString("requestKey") == key }
                if (existing == null) queue.put(entry.put("state", "queued"))
                else if (existing.optString("state") != "complete") {
                    existing.put("batchId", entry.optString("batchId")).put("playbackIndex", entry.optInt("playbackIndex")).put("playbackRevision", entry.optLong("playbackRevision"))
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
        LocalSyncStore.pause(reactApplicationContext, false); LocalSyncRunner.schedule(reactApplicationContext, automatic)
        val intent = Intent(reactApplicationContext, LocalSyncForeground::class.java)
        if (Build.VERSION.SDK_INT >= 26) reactApplicationContext.startForegroundService(intent) else reactApplicationContext.startService(intent)
        true
    }
    @ReactMethod fun pause(promise: Promise) = task(promise) {
        LocalSyncStore.pause(reactApplicationContext, true); LocalSyncRunner.schedule(reactApplicationContext, false)
        reactApplicationContext.stopService(Intent(reactApplicationContext, LocalSyncForeground::class.java))
        LocalSyncStore.publish(reactApplicationContext, JSONObject().put("phase", "paused")); true
    }
    @ReactMethod fun invalidateAudio(key: String, promise: Promise) = task(promise) {
        LocalSyncStore.invalidateArtifact(reactApplicationContext, key); true
    }
    override fun invalidate() { if (instance === this) instance = null; super.invalidate() }
}
