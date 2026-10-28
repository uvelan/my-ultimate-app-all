package com.uvelan.ultimateapp

import android.content.Context
import android.os.Build
import android.os.PowerManager
import android.os.Process
import android.net.Uri
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.k2fsa.sherpa.onnx.OfflineTts
import com.k2fsa.sherpa.onnx.OfflineTtsConfig
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsKokoroModelConfig
import java.io.File
import java.io.RandomAccessFile
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class KokoroModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    init { PlaybackDiagnostics.install(context) }
    private val gates = ConcurrentHashMap<String, KokoroGenerationGate>()
    private val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    private val thermalListener = if (Build.VERSION.SDK_INT >= 29) PowerManager.OnThermalStatusChangedListener { status ->
        gates.values.forEach { it.updateThermal(status >= PowerManager.THERMAL_STATUS_SEVERE) }
    } else null
    init { if (Build.VERSION.SDK_INT >= 29 && thermalListener != null) power.addThermalStatusListener(thermalListener) }
    private val synthesis = Executors.newSingleThreadExecutor()
    private val downloads = Executors.newSingleThreadExecutor()
    private val installing = AtomicBoolean(false)
    private val cancelDownload = AtomicBoolean(false)
    private val cancelled = ConcurrentHashMap.newKeySet<String>()
    private val requests = ConcurrentHashMap.newKeySet<String>()
    private val audioParts = File(context.filesDir, "listen-audio-parts").apply { mkdirs() }
    private val modelDir = File(context.filesDir, "kokoro-v1-0-int8")
    @Volatile private var connection: HttpURLConnection? = null
    @Volatile private var destroyed = false
    private var engine: OfflineTts? = null // Accessed only on the synthesis executor.

    override fun getName() = "KokoroTts"
    @ReactMethod fun lastFailure(promise: Promise) {
        try { promise.resolve(PlaybackDiagnostics.latest(reactApplicationContext)) }
        catch (_: Exception) { promise.resolve(null) }
    }
    @ReactMethod fun dismissFailure() { PlaybackDiagnostics.dismiss(reactApplicationContext) }
    @ReactMethod fun addListener(name: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    private fun emit(event: WritableMap) {
        if (!destroyed && reactApplicationContext.hasActiveReactInstance())
            reactApplicationContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("KokoroProgress", event)
    }
    private fun cacheWav(uri: String): File {
        val file = File(Uri.parse(uri).path ?: "").canonicalFile
        check(Uri.parse(uri).scheme == "file" && (file.parentFile == reactApplicationContext.cacheDir.canonicalFile || file.parentFile == audioParts.canonicalFile || file.parentFile == File(reactApplicationContext.filesDir, "local-pc-audio").canonicalFile) && file.name.startsWith("kokoro-")) { "Invalid narration source." }
        return file
    }
    @ReactMethod fun splitPrefix(uri: String, segments: ReadableArray, promise: Promise) {
        downloads.execute {
            val outputs = mutableListOf<File>()
            try {
                val source = cacheWav(uri)
                val pieces = Arguments.createArray()
                for (index in 0 until segments.size()) {
                    val segment = segments.getMap(index)!!
                    val start = segment.getDouble("start"); val end = segment.getDouble("end")
                    check(start.isFinite() && end.isFinite() && end > start)
                    val piece = File(audioParts, "kokoro-piece-${UUID.randomUUID()}.wav"); outputs.add(piece)
                    RandomAccessFile(piece, "rw").use { output ->
                        output.setLength(44); output.seek(44); KokoroFiles.copyPcm(source, output, Math.round(start * 24000), Math.round(end * 24000)); KokoroFiles.finishWav(output, 24000)
                    }
                    pieces.pushMap(Arguments.createMap().apply {
                        putInt("index", index); putString("uri", Uri.fromFile(piece).toString()); putDouble("bytes", piece.length().toDouble())
                        putString("text", segment.getString("text")); putDouble("start", start); putDouble("end", end)
                    })
                }
                promise.resolve(pieces)
            } catch (error: Throwable) { outputs.forEach { it.delete() }; promise.reject("KOKORO_SPLIT", error.message, error) }
        }
    }
    @ReactMethod fun joinPrefix(uris: ReadableArray, promise: Promise) {
        val sources = (0 until uris.size()).map { uris.getString(it) ?: "" }
        downloads.execute {
            val output = File(audioParts, "kokoro-resume-${UUID.randomUUID()}.wav")
            try {
                check(sources.isNotEmpty() && sources.size <= 10000)
                RandomAccessFile(output, "rw").use { file ->
                    file.setLength(44); file.seek(44)
                    for (uri in sources) {
                        val source = cacheWav(uri)
                        KokoroFiles.copyPcm(source, file, 0, (source.length() - 44) / 2)
                        check(file.length() < 200_000_000L) { "Saved narration is too long." }
                    }
                    KokoroFiles.finishWav(file, 24000)
                }
                promise.resolve(Uri.fromFile(output).toString())
            } catch (error: Throwable) { output.delete(); promise.reject("KOKORO_RESUME", error.message, error) }
        }
    }
    private fun progress(phase: String, fraction: Double, requestId: String? = null) {
        emit(Arguments.createMap().apply {
            putString("phase", phase); putDouble("progress", fraction.coerceIn(0.0, 1.0))
            if (requestId != null) putString("requestId", requestId)
        })
    }
    @ReactMethod fun status(promise: Promise) {
        try { promise.resolve(Arguments.createMap().apply {
            putBoolean("ready", KokoroFiles.ready(modelDir)); putBoolean("installing", installing.get())
            putDouble("downloadBytes", KokoroFiles.ARCHIVE_BYTES.toDouble())
        }) } catch (error: Exception) { promise.reject("KOKORO_STATUS", "Unable to check the voice model.", error) }
    }
    @ReactMethod fun cancelInstall() { cancelDownload.set(true); connection?.disconnect() }

    @ReactMethod fun install(promise: Promise) {
        if (!installing.compareAndSet(false, true)) { promise.reject("KOKORO_BUSY", "Voice model download is already running."); return }
        cancelDownload.set(false)
        downloads.execute {
            val archive = File(reactApplicationContext.cacheDir, "kokoro-model-download.tar.bz2")
            val staging = File(reactApplicationContext.filesDir, "kokoro-model-staging")
            fun checkActive() { check(!destroyed && !cancelDownload.get()) { "Voice model download cancelled." } }
            try {
                if (KokoroFiles.ready(modelDir)) { promise.resolve(true); return@execute }
                check(reactApplicationContext.filesDir.usableSpace > 600_000_000L) { "At least 600 MB free storage is needed to install the voice model." }
                staging.deleteRecursively(); staging.mkdirs()
                progress("download", 0.0)
                val digest = MessageDigest.getInstance("SHA-256")
                val request = URL("https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/${KokoroFiles.MODEL}.tar.bz2").openConnection() as HttpURLConnection
                connection = request
                request.connectTimeout = 20000; request.readTimeout = 20000
                request.setRequestProperty("User-Agent", "UltimateApp-Kokoro/1.1")
                check(request.responseCode == 200) { "Voice model download failed (${request.responseCode}). Retry when connected." }
                request.inputStream.buffered().use { input -> archive.outputStream().buffered().use { output ->
                    val buffer = ByteArray(65536); var count = 0L; var lastUpdate = 0L
                    while (true) {
                        checkActive()
                        val length = input.read(buffer)
                        if (length < 0) break
                        count += length
                        check(count <= KokoroFiles.ARCHIVE_BYTES) { "Unexpected voice model download size." }
                        digest.update(buffer, 0, length); output.write(buffer, 0, length)
                        if (System.currentTimeMillis() - lastUpdate > 250) {
                            progress("download", count.toDouble() / KokoroFiles.ARCHIVE_BYTES); lastUpdate = System.currentTimeMillis()
                        }
                    }
                    check(count == KokoroFiles.ARCHIVE_BYTES) { "Voice model download was interrupted. Please retry." }
                } }
                checkActive()
                check(digest.digest().joinToString("") { "%02x".format(it) } == KokoroFiles.ARCHIVE_SHA) { "Voice model verification failed. Please download again." }
                progress("extract", 1.0)
                KokoroFiles.extract(archive, staging, ::checkActive)
                checkActive()
                // The existing model is never touched until the replacement passes validation.
                modelDir.deleteRecursively()
                check(staging.renameTo(modelDir)) { "Unable to install the voice model." }
                progress("ready", 1.0)
                promise.resolve(true)
            } catch (error: Exception) {
                emit(Arguments.createMap().apply { putString("phase", "error"); putDouble("progress", 0.0); putString("message", error.message ?: "Voice model download failed.") })
                promise.reject("KOKORO_INSTALL", error.message ?: "Voice model download failed.", error)
            }
            finally {
                connection?.disconnect(); connection = null
                archive.delete(); staging.deleteRecursively(); installing.set(false)
            }
        }
    }

    @ReactMethod fun cancel(requestId: String) {
        if (requests.contains(requestId)) cancelled.add(requestId)
        gates[requestId]?.cancel()
    }
    @ReactMethod fun checkpoint(requestId: String, samples: Double) {
        if (samples.isFinite() && samples >= 0) gates[requestId]?.checkpoint(samples.toLong())
    }
    @ReactMethod fun setGenerationLimit(requestId: String, limit: Int) { gates[requestId]?.updateLimit(limit) }

    @ReactMethod fun release() {
        if (!destroyed) synthesis.execute { engine?.release(); engine = null }
    }

    @ReactMethod fun generate(requestId: String, texts: ReadableArray, voice: String, initialLimit: Int, options: ReadableMap, promise: Promise) {
        val chunks = (0 until texts.size()).map { texts.getString(it) ?: "" }
        val startIndex = if (options.hasKey("startIndex")) options.getInt("startIndex") else 0
        val prefixSeconds = if (options.hasKey("prefixSeconds")) options.getDouble("prefixSeconds") else 0.0
        val prefixUri = if (options.hasKey("prefixUri")) options.getString("prefixUri") else null
        if (voice !in listOf("af_heart", "af_bella") || chunks.isEmpty() || chunks.size > 10000 || chunks.any { it.isBlank() || it.length > 4000 }) {
            promise.reject("KOKORO_INPUT", "Invalid narration text or voice."); return
        }
        val gate = KokoroGenerationGate(initialLimit)
        if (Build.VERSION.SDK_INT >= 29) gate.updateThermal(power.currentThermalStatus >= PowerManager.THERMAL_STATUS_SEVERE)
        gates[requestId] = gate
        requests.add(requestId)
        synthesis.execute {
            val output = File(audioParts, "kokoro-${UUID.randomUUID()}.wav")
            val pieces = mutableListOf<File>()
            val published = mutableSetOf<File>()
            fun checkActive() { check(!destroyed && !cancelled.contains(requestId)) { "Audio generation cancelled." } }
            try {
                // Lower synthesis scheduling priority; audio/UI keep their normal priority.
                Process.setThreadPriority(Process.THREAD_PRIORITY_BACKGROUND)
                fun awaitBudget(index: Int) {
                    gate.await(index) { hot, paused ->
                        emit(Arguments.createMap().apply {
                            putString("phase", if (hot) "cooling" else "waiting"); putString("requestId", requestId)
                            putDouble("progress", index.toDouble() / (chunks.size + startIndex))
                            putString("message", if (hot) "Phone is cooling; audio generation is resting."
                                else if (paused) "Generation paused; press Play to resume." else "Audio buffered; generator resting.")
                        })
                    }
                    checkActive()
                }
                awaitBudget(0)
                checkActive()
                check(KokoroFiles.ready(modelDir)) { "Download the Kokoro voice model to listen offline." }
                if (engine == null) {
                    progress("loading", 0.0, requestId)
                    val base = modelDir.absolutePath
                    engine = OfflineTts(config = OfflineTtsConfig(model = OfflineTtsModelConfig(
                        kokoro = OfflineTtsKokoroModelConfig(model = "$base/model.int8.onnx", voices = "$base/voices.bin",
                            tokens = "$base/tokens.txt", dataDir = "$base/espeak-ng-data", lexicon = "$base/lexicon-us-en.txt", lang = "en-us"),
                        numThreads = 2, debug = false, provider = "cpu"), maxNumSentences = 1))
                }
                val tts = engine!!
                val sampleRate = tts.sampleRate()
                check(sampleRate == 24000 && tts.numSpeakers() == KokoroFiles.SPEAKERS) { "Unexpected Kokoro model or voice catalog." }
                val segments = Arguments.createArray()
                var samples = Math.round(prefixSeconds * sampleRate)
                check(prefixSeconds.isFinite() && prefixSeconds >= 0 && startIndex >= 0) { "Invalid narration continuation." }
                val callback = KokoroCallback { destroyed || cancelled.contains(requestId) || gate.checkpointSamples != null }
                progress("generate", 0.0, requestId)
                RandomAccessFile(output, "rw").use { file ->
                    file.setLength(44); file.seek(44)
                    if (prefixUri != null) KokoroFiles.copyPcm(cacheWav(prefixUri), file, 0, samples)
                    else check(samples == 0L)
                    for ((localIndex, text) in chunks.withIndex()) {
                        val index = startIndex + localIndex
                        awaitBudget(index)
                        if (gate.checkpointSamples != null) break
                        progress("generate", index.toDouble() / chunks.size, requestId)
                        checkActive()
                        val audio = tts.generateWithCallback(text, sid = if (voice == "af_heart") KokoroFiles.HEART else KokoroFiles.BELLA,
                            speed = 1f, callback = callback)
                        checkActive()
                        if (gate.checkpointSamples != null) break
                        check(audio.samples.isNotEmpty() && audio.sampleRate == sampleRate) { "Kokoro could not pronounce this passage." }
                        val start = samples.toDouble() / sampleRate
                        KokoroFiles.writePcm(file, audio.samples); samples += audio.samples.size
                        check(file.length() < 200_000_000L) { "This chapter is too long to cache as one audio file." }
                        segments.pushMap(Arguments.createMap().apply {
                            putString("text", text); putDouble("start", start); putDouble("end", samples.toDouble() / sampleRate)
                        })
                        // Publish immutable, finalized WAVs. Never play a file still being appended.
                        val piece = File(audioParts, "kokoro-piece-${UUID.randomUUID()}.wav")
                        pieces.add(piece)
                        RandomAccessFile(piece, "rw").use { chunkFile ->
                            chunkFile.setLength(44); chunkFile.seek(44)
                            KokoroFiles.writePcm(chunkFile, audio.samples)
                            KokoroFiles.finishWav(chunkFile, sampleRate)
                        }
                        checkActive()
                        emit(Arguments.createMap().apply {
                            putString("phase", "generate"); putString("requestId", requestId)
                            putDouble("progress", (index + 1.0) / (chunks.size + startIndex))
                            putMap("chunk", Arguments.createMap().apply {
                                putInt("index", index); putString("text", text)
                                putString("uri", Uri.fromFile(piece).toString())
                                putDouble("bytes", piece.length().toDouble())
                                putDouble("start", start); putDouble("end", samples.toDouble() / sampleRate)
                            })
                        })
                        published.add(piece)
                    }
                    gate.checkpointSamples?.let { checkpoint ->
                        check(checkpoint <= samples && checkpoint >= 0) { "Invalid voice switch boundary." }
                        samples = checkpoint; file.setLength(44 + samples * 2)
                    }
                    KokoroFiles.finishWav(file, sampleRate)
                }
                checkActive()
                promise.resolve(Arguments.createMap().apply {
                    putString("uri", Uri.fromFile(output).toString()); putDouble("bytes", output.length().toDouble())
                    putArray("segments", segments); putBoolean("checkpoint", gate.checkpointSamples != null)
                })
            } catch (error: Throwable) {
                output.delete(); pieces.filterNot { published.contains(it) }.forEach { it.delete() }
                // A failed model initialization must be retryable, including after a low-memory error.
                if (!cancelled.contains(requestId)) { engine?.release(); engine = null }
                promise.reject("KOKORO_GENERATE", error.message ?: "Offline narration failed. Please retry.", error)
            } finally { cancelled.remove(requestId); requests.remove(requestId); gates.remove(requestId) }
        }
    }

    override fun invalidate() {
        destroyed = true; cancelInstall(); cancelled.addAll(requests)
        gates.values.forEach { it.cancel() }
        if (Build.VERSION.SDK_INT >= 29 && thermalListener != null) power.removeThermalStatusListener(thermalListener)
        downloads.shutdown()
        synthesis.execute { engine?.release(); engine = null }
        synthesis.shutdown()
        super.invalidate()
    }
}
