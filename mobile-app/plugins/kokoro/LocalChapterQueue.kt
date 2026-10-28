package expo.modules.audio

import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.common.util.UnstableApi
import org.json.JSONObject
import org.json.JSONArray
import java.io.File
import java.util.concurrent.Executors

/** App-owned local chapter queue. All transitions and discovery of newly synced files run natively. */
@UnstableApi
class LocalChapterQueue(private val context: Context, private val player: ExoPlayer, private val updateMetadata: (Metadata) -> Unit) {
    private val handler = Handler(Looper.getMainLooper())
    private val writer = Executors.newSingleThreadExecutor()
    private var config: JSONObject? = null
    private var artifacts = JSONArray()
    private var modified = -1L
    private var lastSaved = 0L
    private var lastChapter = ""
    private var stoppedAtEnd = false
    private val tick = object : Runnable {
        override fun run() {
            if (config == null) return
            try { refresh(); checkpoint() } catch (_: Exception) { /* Keep existing queue playable. */ }
            handler.postDelayed(this, 2000)
        }
    }
    fun configure(raw: String) {
        clear()
        if (raw.isBlank()) return
        config = JSONObject(raw)
        modified = -1L; lastChapter = ""; stoppedAtEnd = false
        refresh(); checkpoint(); handler.postDelayed(tick, 2000)
    }
    fun clear() {
        handler.removeCallbacks(tick)
        if (config != null) checkpoint()
        config = null
        if (player.mediaItemCount > player.currentMediaItemIndex + 1) player.removeMediaItems(player.currentMediaItemIndex + 1, player.mediaItemCount)
    }
    fun release() { clear(); writer.shutdown() }
    private fun current(): JSONObject? {
        val uri = player.currentMediaItem?.localConfiguration?.uri?.toString() ?: return null
        return (0 until artifacts.length()).map { artifacts.getJSONObject(it) }.lastOrNull { it.optString("uri") == uri }
    }
    fun status(): Map<String, Any?> {
        val entry = current() ?: return emptyMap()
        if (config == null) return emptyMap()
        return mapOf("localChapterId" to entry.optString("chapterId"), "localChapterIndex" to entry.optInt("chapterIndex"),
            "localChapterUri" to entry.optString("uri"))
    }
    fun transition() {
        if (config == null) return
        try {
            val entry = current() ?: return
            val cfg = config!!
            val chapters = cfg.getJSONArray("chapters")
            val index = entry.getInt("chapterIndex")
            val chapter = chapters.optJSONObject(index) ?: return
            updateMetadata(Metadata(chapter.optString("title"), cfg.optString("bookTitle"), cfg.optString("bookTitle"), null))
            checkpoint(true)
        } catch (_: Exception) { }
    }
    private fun refresh() {
        val cfg = config ?: return
        val indexFile = File(context.filesDir, "local-sync-artifacts.json")
        if (indexFile.lastModified() != modified) {
            artifacts = JSONArray(if (indexFile.isFile) indexFile.readText() else "[]")
            modified = indexFile.lastModified()
        }
        val active = current() ?: return
        if (active.optString("userId") != cfg.getString("userId") || active.optString("bookId") != cfg.getString("bookId")) return
        val chapters = cfg.getJSONArray("chapters")
        val currentIndex = active.getInt("chapterIndex")
        val deadline = cfg.optLong("deadline", 0)
        if (deadline > 0 && System.currentTimeMillis() >= deadline) { cfg.put("deadline", 0); player.pause(); return }
        if (cfg.optBoolean("endOfChapter")) {
            if (player.mediaItemCount > player.currentMediaItemIndex + 1) player.removeMediaItems(player.currentMediaItemIndex + 1, player.mediaItemCount)
            return
        }
        var last = currentIndex
        for (queueIndex in player.currentMediaItemIndex + 1 until player.mediaItemCount) {
            val queuedUri = player.getMediaItemAt(queueIndex).localConfiguration?.uri?.toString()
            val entry = (0 until artifacts.length()).map { artifacts.getJSONObject(it) }.find { it.optString("uri") == queuedUri } ?: break
            last = entry.getInt("chapterIndex")
        }
        val ended = player.playbackState == Player.STATE_ENDED
        val continuePlaying = player.playWhenReady
        var appended = false
        for (index in last + 1 until minOf(chapters.length(), currentIndex + 51)) {
            val chapter = chapters.getJSONObject(index)
            val entry = (0 until artifacts.length()).map { artifacts.getJSONObject(it) }.lastOrNull {
                it.optString("userId") == cfg.getString("userId") && it.optString("bookId") == cfg.getString("bookId") &&
                    it.optString("voice") == cfg.getString("voice") && it.optString("chapterId") == chapter.getString("id") && it.optInt("chapterIndex") == index
            } ?: break // Never skip a missing chapter.
            val uri = Uri.parse(entry.getString("uri"))
            val file = File(uri.path ?: break)
            if (uri.scheme != "file" || file.parentFile?.canonicalFile != File(context.filesDir, "local-pc-audio").canonicalFile || file.length() != entry.getLong("bytes")) break
            val item = MediaItem.Builder().setUri(uri).setMediaId(chapter.getString("id"))
                .setMediaMetadata(MediaMetadata.Builder().setTitle(chapter.optString("title")).setArtist(cfg.optString("bookTitle")).build()).build()
            player.addMediaItem(item); appended = true
        }
        // If the current chapter reached the end before the next download completed,
        // resume only an uninterrupted play intent. An explicit Pause clears playWhenReady.
        if (appended && ended && continuePlaying && !stoppedAtEnd) {
            player.seekToNextMediaItem(); player.prepare(); player.play()
        }
    }
    private fun checkpoint(force: Boolean = false) {
        val cfg = config ?: return
        val entry = current() ?: return
        val now = System.currentTimeMillis()
        if (!force && now - lastSaved < 2000 && lastChapter == entry.optString("chapterId")) return
        lastSaved = now; lastChapter = entry.optString("chapterId")
        val value = JSONObject().put("userId", cfg.getString("userId")).put("bookId", cfg.getString("bookId"))
            .put("chapterId", entry.getString("chapterId")).put("chapterIndex", entry.getInt("chapterIndex"))
            .put("voice", entry.getString("voice")).put("uri", entry.getString("uri"))
            .put("seconds", player.currentPosition / 1000.0).put("updated", now)
        writer.execute {
            try { val target = File(context.filesDir, "local-pc-playback.json"); val temp = File(target.path + ".tmp")
                temp.writeText(value.toString()); check(temp.renameTo(target))
            } catch (_: Exception) { }
        }
    }
}
