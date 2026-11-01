package com.uvelan.ultimateapp

import java.io.File
import java.io.InputStream
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest

object DriveAudioChecks {
    fun copyVerified(input: InputStream, partial: File, size: Long, hash: String) {
        check(size in 45..200_000_000L && (size - 44) % 2 == 0L && hash.matches(Regex("[a-f0-9]{64}")))
        val digest = MessageDigest.getInstance("SHA-256"); var total = 0L
        FileOutputStream(partial).use { stream ->
            val buffer = ByteArray(65536)
            while (true) {
                val count = input.read(buffer); if (count < 0) break
                total += count; check(total <= size) { "Unexpected audio length" }
                digest.update(buffer, 0, count); stream.write(buffer, 0, count)
            }
            stream.fd.sync()
        }
        check(total == size && digest.digest().joinToString("") { "%02x".format(it) } == hash) { "Chapter checksum failed" }
        RandomAccessFile(partial, "r").use { file ->
            val header = ByteArray(44); file.readFully(header); val format = ByteBuffer.wrap(header).order(ByteOrder.LITTLE_ENDIAN)
            check(String(header, 0, 4) == "RIFF" && String(header, 8, 8) == "WAVEfmt " && String(header, 36, 4) == "data")
            check(format.getInt(4).toLong() == size - 8 && format.getInt(16) == 16 && format.getShort(20).toInt() == 1
                && format.getShort(22).toInt() == 1 && format.getInt(24) == 24000 && format.getInt(28) == 48000
                && format.getShort(32).toInt() == 2 && format.getShort(34).toInt() == 16
                && format.getInt(40).toLong() == size - 44) { "Unsupported WAV chapter" }
        }
    }
}
