package android.media
class MediaMetadata(val values: Map<String, String>) {
    companion object {
        const val METADATA_KEY_TITLE = "title"; const val METADATA_KEY_ALBUM = "album"
        const val METADATA_KEY_ARTIST = "artist"; const val METADATA_KEY_DISPLAY_TITLE = "displayTitle"
        const val METADATA_KEY_DISPLAY_SUBTITLE = "displaySubtitle"
    }
    class Builder {
        private val values = linkedMapOf<String, String>()
        fun putString(key: String, value: String) = apply { values[key] = value }
        fun build() = MediaMetadata(values)
    }
}
