package com.uvelan.ultimateapp

import java.io.File
import java.io.RandomAccessFile
import org.apache.commons.compress.archivers.tar.TarArchiveEntry
import org.apache.commons.compress.archivers.tar.TarArchiveOutputStream
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorOutputStream

fun main(args: Array<String>) {
    val root = File(args[0]); root.mkdirs()
    when (args[1]) {
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
