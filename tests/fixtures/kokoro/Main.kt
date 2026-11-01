package com.uvelan.ultimateapp

import java.io.File
import java.io.RandomAccessFile
import org.apache.commons.compress.archivers.tar.TarArchiveEntry
import org.apache.commons.compress.archivers.tar.TarArchiveOutputStream
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorOutputStream

fun main(args: Array<String>) {
    val root = File(args[0]); root.mkdirs()
    when (args[1]) {
        "single-run" -> {
            val gate = SyncTransferControl(); val revision = gate.revision()
            val launches = java.util.concurrent.atomic.AtomicInteger()
            val threads = (0 until 30).map { Thread { gate.requestRun(revision) { launches.incrementAndGet() } } }
            threads.forEach { it.start() }; threads.forEach { it.join() }
            check(launches.get() == 1)
            check(gate.enterRun(revision, requested = false) == null) // Background retry cannot steal a foreground launch.
            val run = requireNotNull(gate.enterRun(revision))
            check(gate.enterRun(revision) == null)
            repeat(30) { check(!gate.requestRun(revision) { error("duplicate launch") }) }
            check(!gate.pendingRun(revision))
            var queued: String? = "new chapter"
            check(gate.nextOrFinish(run, { queued }, { error("premature idle") }) == "new chapter")
            queued = null
            var completed = false
            check(gate.nextOrFinish(run, { queued }, { completed = true }) == null && completed)
            check(gate.requestRun(revision) { launches.incrementAndGet() })
            val replacement = requireNotNull(gate.enterRun(revision))
            gate.finishRun(run) // An old finally block must not clear the new owner.
            check(gate.ownsRun(replacement))
            gate.pause {}
            val resumed = gate.revision(); check(gate.resume(resumed) {})
            check(gate.requestRun(resumed) { launches.incrementAndGet() })
            repeat(30) { check(!gate.requestRun(resumed) { error("duplicate pending resume") }) }
            check(gate.enterRun(resumed) == null && gate.pendingRun(resumed))
            gate.finishRun(replacement)
            val next = requireNotNull(gate.enterRun(resumed)); check(!gate.pendingRun(resumed))
            gate.finishRun(next); check(!gate.busy())
            println("single run verified")
        }
        "transfer-pause" -> {
            val entered = java.util.concurrent.CountDownLatch(1)
            val disconnected = java.util.concurrent.CountDownLatch(1)
            val closes = java.util.concurrent.atomic.AtomicInteger()
            val done = java.util.concurrent.CountDownLatch(1)
            val control = SyncTransferControl()
            val partial = File(root, "chapter.wav.part").apply { writeText("keep partial bytes") }
            val saved = File(root, "saved.wav").apply { writeText("keep saved audio") }
            val connection = object : java.net.HttpURLConnection(java.net.URL("http://127.0.0.1")) {
                override fun connect() {}
                override fun usingProxy() = false
                override fun disconnect() { closes.incrementAndGet(); disconnected.countDown() }
                override fun getInputStream() = object : java.io.InputStream() {
                    override fun read(): Int { entered.countDown(); check(disconnected.await(2, java.util.concurrent.TimeUnit.SECONDS)); throw java.io.IOException("closed") }
                }
            }
            val old = control.revision()
            val worker = Thread {
                control.bind(old)
                try { control.track(connection); connection.inputStream.read(); error("read was not interrupted") }
                catch (_: java.io.IOException) { }
                finally { control.unbind(); control.release(connection); done.countDown() }
            }
            worker.start(); check(entered.await(2, java.util.concurrent.TimeUnit.SECONDS))
            var persisted = false
            control.pause { persisted = true }
            check(persisted); check(done.await(1, java.util.concurrent.TimeUnit.SECONDS)); worker.join()
            check(partial.readText() == "keep partial bytes" && saved.readText() == "keep saved audio")
            check(!control.resume(old) { error("stale enqueue restarted sync") })
            control.ifRevision(old) { error("stale automatic setting restarted scheduling") }
            val fresh = control.revision(); check(control.resume(fresh) {})
            check(!control.current(old) && control.current(fresh))
            control.bind(old)
            check(!control.workerIsCurrent())
            try { control.track(connection); error("stale worker opened a request after resume") }
            catch (_: java.io.InterruptedIOException) { }
            finally { control.unbind() }
            control.track(connection); control.release(connection)
            control.track(connection)
            val beforeFailure = closes.get()
            try { control.pause { throw java.io.IOException("storage unavailable") }; error("missing failure") }
            catch (_: java.io.IOException) { }
            check(!control.current(fresh) && closes.get() > beforeFailure)
            println("transfer pause verified")
        }
        "retention" -> {
            val directory = File(root, "audio").apply { mkdirs() }
            val current = File(directory, "current.wav").apply { writeText("playing") }
            val playing = ChapterAudio("user", "book", 20, current)
            for (index in 0..30) {
                val file = File(directory, "$index.wav").apply { writeText("saved") }
                check(LocalSyncRetention.removeOlder(directory, ChapterAudio("user", "book", index, file), playing) == (index < 10))
                check(file.exists() == (index >= 10))
            }
            val cases = listOf(
                ChapterAudio("other", "book", 0, File(directory, "other-user.wav")),
                ChapterAudio("user", "other", 0, File(directory, "other-book.wav")),
                ChapterAudio("user", "book", -1, File(directory, "unknown-index.wav")),
                ChapterAudio("user", "book", 0, File(root, "outside.wav")),
                ChapterAudio("user", "book", 0, File(directory, "../traversal.wav")),
                ChapterAudio("user", "book", 0, current)
            )
            for (item in cases) {
                item.file.writeText("protected")
                check(!LocalSyncRetention.removeOlder(directory, item, playing))
                check(item.file.exists())
            }
            check(!LocalSyncRetention.removeOlder(directory, cases.last(), playing.copy(index = 10)))
            println("retention verified")
        }
        "gate" -> {
            val gate = KokoroGenerationGate(0)
            val entered = java.util.concurrent.CountDownLatch(1)
            val finished = java.util.concurrent.CountDownLatch(1)
            val thread = Thread { gate.await(0) { _, _ -> entered.countDown() }; finished.countDown() }
            thread.start(); check(entered.await(2, java.util.concurrent.TimeUnit.SECONDS))
            check(!finished.await(50, java.util.concurrent.TimeUnit.MILLISECONDS)); gate.updateLimit(2)
            check(finished.await(2, java.util.concurrent.TimeUnit.SECONDS)); thread.join()
            gate.updateThermal(true)
            val hotWaiting = java.util.concurrent.CountDownLatch(1); val cooled = java.util.concurrent.CountDownLatch(1)
            val hotThread = Thread { gate.await(1) { hot, _ -> check(hot); hotWaiting.countDown() }; cooled.countDown() }
            hotThread.start(); check(hotWaiting.await(2, java.util.concurrent.TimeUnit.SECONDS))
            check(!cooled.await(50, java.util.concurrent.TimeUnit.MILLISECONDS)); gate.updateThermal(false)
            check(cooled.await(2, java.util.concurrent.TimeUnit.SECONDS)); hotThread.join()
            val cancelledGate = KokoroGenerationGate(0); val waiting = java.util.concurrent.CountDownLatch(1)
            val stopped = java.util.concurrent.CountDownLatch(1)
            val cancelledThread = Thread { try { cancelledGate.await(0) { _, _ -> waiting.countDown() }; error("did not cancel") }
                catch (_: IllegalStateException) { stopped.countDown() } }
            cancelledThread.start(); check(waiting.await(2, java.util.concurrent.TimeUnit.SECONDS)); cancelledGate.cancel()
            check(stopped.await(2, java.util.concurrent.TimeUnit.SECONDS)); cancelledThread.join()
            val checkpoint = KokoroGenerationGate(0); checkpoint.checkpoint(24000)
            checkpoint.await(10) { _, _ -> error("checkpoint did not wake") }; check(checkpoint.checkpointSamples == 24000L)
            println("gate verified")
        }
        "callback" -> {
            var cancelled = false
            val callback = KokoroCallback { cancelled }
            // Match the exact lookup performed by the real Android JNI library.
            val method = callback.javaClass.getMethod("invoke", FloatArray::class.java)
            check(method.returnType == java.lang.Integer::class.java)
            check(method.invoke(callback, floatArrayOf(0.1f)) == 1)
            cancelled = true
            check(method.invoke(callback, floatArrayOf(0.1f)) == 0)
            println("JNI callback signature and cancellation verified")
        }
        "prefix" -> {
            val source = File(root, "source.wav")
            RandomAccessFile(source, "rw").use { file -> file.setLength(44); file.seek(44)
                KokoroFiles.writePcm(file, floatArrayOf(0.1f, 0.2f, 0.3f, 0.4f)); KokoroFiles.finishWav(file, 24000) }
            val output = File(root, "merged.wav")
            RandomAccessFile(output, "rw").use { file -> file.setLength(44); file.seek(44)
                KokoroFiles.copyPcm(source, file, 0, 2)
                KokoroFiles.writePcm(file, floatArrayOf(-0.5f, -0.6f)); KokoroFiles.finishWav(file, 24000) }
            println(output.absolutePath)
        }
        "pcm" -> {
            val output = File(root, "audio.wav")
            RandomAccessFile(output, "rw").use {
                it.setLength(44); it.seek(44)
                KokoroFiles.writePcm(it, floatArrayOf(-2f, -0.5f, 0f, 0.5f, 2f))
                KokoroFiles.finishWav(it, 24000)
            }
            println(output.absolutePath)
        }
        "drive-audio" -> {
            check(DriveRange.valid("bytes 100-999/1000", 100, 1000))
            for (header in listOf(null, "bytes 0-999/1000", "bytes 100-998/1000", "bytes 100-999/1001", "bytes bad"))
                check(!DriveRange.valid(header, 100, 1000))
            val wav = File(root, "drive.wav")
            RandomAccessFile(wav, "rw").use {
                it.setLength(44); it.seek(44); KokoroFiles.writePcm(it, floatArrayOf(.1f, .2f, .3f)); KokoroFiles.finishWav(it, 24000)
            }
            val valid = wav.readBytes()
            fun hash(bytes: ByteArray) = java.security.MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
            val partial = File(root, "import.part")
            DriveAudioChecks.copyVerified(valid.inputStream(), partial, valid.size.toLong(), hash(valid))
            check(partial.readBytes().contentEquals(valid))
            for (kind in listOf("corrupt", "truncated", "rate", "extra")) {
                val bytes = when (kind) {
                    "corrupt" -> valid.copyOf().apply { this[44] = (this[44].toInt() xor 1).toByte() }
                    "truncated" -> valid.copyOf(valid.size - 2)
                    "extra" -> valid + byteArrayOf(1)
                    else -> valid.copyOf().apply { this[24] = 0 }
                }
                var rejected = false
                try { DriveAudioChecks.copyVerified(bytes.inputStream(), partial, valid.size.toLong(), if (kind == "rate") hash(bytes) else hash(valid)) }
                catch (_: Exception) { rejected = true }
                check(rejected) { "Accepted invalid Drive audio: $kind" }
            }
            println("Drive audio verified")
        }
        "extract" -> {
            val archive = File(root, "test.tar.bz2")
            val destination = File(root, "model"); destination.mkdirs()
            TarArchiveOutputStream(BZip2CompressorOutputStream(archive.outputStream())).use { tar ->
                val name = if (args[2] == "traversal") "${KokoroFiles.MODEL}/../escaped" else "${KokoroFiles.MODEL}/file"
                val entry = if (args[2] == "symlink") TarArchiveEntry(name, '2'.code.toByte()).apply { linkName = "../../outside" } else TarArchiveEntry(name)
                entry.size = 0; tar.putArchiveEntry(entry); tar.closeArchiveEntry()
            }
            try {
                KokoroFiles.extract(archive, destination) { if (args[2] == "cancel") error("cancelled") }
                error("Invalid model was accepted")
            } catch (error: IllegalArgumentException) { println(error.message) }
              catch (error: IllegalStateException) { println(error.message) }
            check(!File(root, "escaped").exists())
            check(!KokoroFiles.ready(destination))
        }
        "real" -> {
            val destination = File(root, "real-model"); destination.mkdirs()
            KokoroFiles.extract(File(args[2]), destination) {}
            check(KokoroFiles.ready(destination))
            check(File(destination, "voices.bin").length() == KokoroFiles.SPEAKERS * 510L * 256 * 4)
            // Read the actual ONNX metadata without an additional inference dependency.
            RandomAccessFile(File(destination, "model.int8.onnx"), "r").use { model ->
                val tail = ByteArray(65536); model.seek(model.length() - tail.size); model.readFully(tail)
                val metadata = String(tail, Charsets.ISO_8859_1)
                check(metadata.contains("n_speakers\u0012\u0002${KokoroFiles.SPEAKERS}"))
                check(metadata.contains("${KokoroFiles.HEART}->af_heart"))
                check(metadata.contains("${KokoroFiles.BELLA}->af_bella"))
            }
            File(destination, "model.int8.onnx").writeText("corrupted")
            check(!KokoroFiles.ready(destination))
            println("verified, extracted, corruption rejected")
        }
    }
}
