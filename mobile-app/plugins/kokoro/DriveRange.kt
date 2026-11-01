package com.uvelan.ultimateapp

object DriveRange {
    fun valid(header: String?, offset: Long, size: Long): Boolean {
        val match = Regex("bytes (\\d+)-(\\d+)/(\\d+)").matchEntire(header ?: "") ?: return false
        val (start, end, total) = match.destructured
        return start.toLongOrNull() == offset && end.toLongOrNull() == size - 1 && total.toLongOrNull() == size && offset in 0 until size
    }
}
