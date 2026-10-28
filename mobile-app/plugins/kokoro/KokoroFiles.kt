package com.uvelan.ultimateapp

import java.io.File
import java.io.RandomAccessFile
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorInputStream

/** Kept independent of React Native so archive and PCM integrity can be tested on the JVM. */
object KokoroFiles {
    const val MODEL = "kokoro-int8-multi-lang-v1_0"
    // This pinned archive adds em_santa at ID 53; IDs 0–52 are unchanged.
    const val SPEAKERS = 54
    const val HEART = 3
    const val BELLA = 2
    const val ARCHIVE_SHA = "4c3052abaa60943a341f193888cf6abd68787dae6ab8ae5c925a706caa247e4e"
    const val ARCHIVE_BYTES = 132303094L
    private val required = mapOf("model.int8.onnx" to 114203756L, "voices.bin" to 28200960L,
        "tokens.txt" to 687L, "lexicon-us-en.txt" to 5956885L)

    fun ready(directory: File) = File(directory, "verified.sha256").let { it.isFile && it.readText() == ARCHIVE_SHA } &&
        required.all { (name, size) -> File(directory, name).let { it.isFile && it.length() == size } } &&
        File(directory, "espeak-ng-data/phondata").let { it.isFile && it.length() == 550424L }

    fun extract(archive: File, staging: File, checkActive: () -> Unit) {
        var total = 0L
        var count = 0
        val root = staging.canonicalPath + File.separator
        TarArchiveInputStream(BZip2CompressorInputStream(archive.inputStream().buffered())).use { tar ->
            while (true) {
                checkActive()
                val entry = tar.nextTarEntry ?: break
                require(++count <= 10000 && !entry.isSymbolicLink && !entry.isLink) { "Invalid model archive entry." }
                require(entry.name.startsWith("$MODEL/")) { "Unexpected model archive directory." }
                val relative = entry.name.removePrefix("$MODEL/")
                if (relative.isEmpty()) continue
                val destination = File(staging, relative)
                require(destination.canonicalPath.startsWith(root)) { "Unsafe model archive path." }
                if (entry.isDirectory) { destination.mkdirs(); continue }
                require(entry.isFile && entry.size in 0..200_000_000L) { "Invalid model file." }
                total += entry.size
                require(total <= 400_000_000L) { "Model archive exceeds size limit." }
                destination.parentFile?.mkdirs()
                destination.outputStream().buffered().use { output ->
                    val buffer = ByteArray(65536)
                    var copied = 0L
                    while (true) {
                        checkActive()
                        val length = tar.read(buffer)
                        if (length < 0) break
                        copied += length
                        require(copied <= entry.size) { "Model file exceeds declared size." }
                        output.write(buffer, 0, length)
                    }
                    require(copied == entry.size) { "Incomplete model archive." }
                }
            }
        }
        File(staging, "verified.sha256").writeText(ARCHIVE_SHA)
        require(ready(staging)) { "The downloaded model is incomplete." }
    }

    fun copyPcm(source: File, output: RandomAccessFile, start: Long, end: Long) {
        RandomAccessFile(source, "r").use { input ->
            input.seek(0); val riff = ByteArray(4); input.readFully(riff)
            check(String(riff) == "RIFF" && start >= 0 && end >= start && end <= 100_000_000L && 44 + end * 2 <= input.length()) { "Invalid narration range." }
            input.seek(44 + start * 2)
            val buffer = ByteArray(65536); var remaining = (end - start) * 2
            while (remaining > 0) {
                val count = input.read(buffer, 0, minOf(remaining, buffer.size.toLong()).toInt())
                check(count > 0) { "Incomplete narration file." }; output.write(buffer, 0, count); remaining -= count
            }
        }
    }

    fun writePcm(file: RandomAccessFile, samples: FloatArray) {
        val data = ByteArray(samples.size * 2)
        samples.forEachIndexed { index, value ->
            val sample = (value.coerceIn(-1f, 1f) * 32767f).toInt()
            data[index * 2] = sample.toByte()
            data[index * 2 + 1] = (sample shr 8).toByte()
        }
        file.write(data)
    }

    fun finishWav(file: RandomAccessFile, sampleRate: Int) {
        val bytes = file.length() - 44
        require(bytes > 0 && bytes < Int.MAX_VALUE && sampleRate > 0) { "No playable audio was generated." }
        fun intLE(value: Int) = file.writeInt(Integer.reverseBytes(value))
        fun shortLE(value: Int) = file.writeShort(java.lang.Short.reverseBytes(value.toShort()).toInt())
        file.seek(0)
        file.writeBytes("RIFF"); intLE((36 + bytes).toInt()); file.writeBytes("WAVEfmt ")
        intLE(16); shortLE(1); shortLE(1); intLE(sampleRate); intLE(sampleRate * 2); shortLE(2); shortLE(16)
        file.writeBytes("data"); intLE(bytes.toInt())
    }
}
