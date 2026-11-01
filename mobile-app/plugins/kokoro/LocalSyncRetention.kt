package com.uvelan.ultimateapp

import java.io.File
import java.io.IOException

data class ChapterAudio(val userId: String, val bookId: String, val index: Int, val file: File)

object LocalSyncRetention {
    fun removeOlder(directory: File, item: ChapterAudio, playing: ChapterAudio): Boolean {
        if (playing.userId.isEmpty() || playing.bookId.isEmpty() || playing.index < 0 || item.index < 0 ||
            item.userId != playing.userId || item.bookId != playing.bookId || item.index >= playing.index - 10) return false
        return try {
            val file = item.file.canonicalFile
            if (file.parentFile != directory.canonicalFile || file == playing.file.canonicalFile) false
            else !file.exists() || file.delete()
        } catch (_: IOException) { false }
    }
}
