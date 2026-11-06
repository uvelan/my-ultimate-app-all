package expo.modules.audio

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import androidx.media3.common.Player
import java.io.File
import java.net.URL

private fun sessionCoverUri(context: Context, url: URL): Uri? {
    if (url.protocol == "http" || url.protocol == "https") return Uri.parse(url.toString())
    if (url.protocol != "file") return null
    return runCatching {
        val file = File(url.toURI()).canonicalFile
        if (file.parentFile != context.cacheDir.canonicalFile || !file.isFile ||
            !file.name.matches(Regex("listen-cover-[a-z0-9-]+\\.(jpg|png|webp|gif)"))) return null
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.FileSystemFileProvider", file)
        context.grantUriPermission("com.android.systemui", uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
        uri
    }.getOrNull()
}

fun publishSessionCover(context: Context, player: Player?, metadata: Metadata?) {
    if (player == null || metadata == null) return
    val item = player.currentMediaItem ?: return
    val artwork = metadata.artworkUrl?.let { sessionCoverUri(context, it) }
    val updated = item.mediaMetadata.buildUpon()
        .setTitle(metadata.title)
        .setArtist(metadata.artist)
        .setAlbumTitle(metadata.albumTitle)
        .setArtworkUri(artwork)
        .build()
    if (updated != item.mediaMetadata) {
        player.replaceMediaItem(player.currentMediaItemIndex, item.buildUpon().setMediaMetadata(updated).build())
    }
}
