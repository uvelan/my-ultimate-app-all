package com.uvelan.ultimateapp

import android.app.Activity
import android.content.Intent
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.AuthorizationResult
import com.google.android.gms.auth.api.identity.ClearTokenRequest
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.common.api.Scope
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean

/** Google owns the grant/token cache. Tokens never enter JS, preferences or logs. */
class GoogleDriveModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    private val scope = "https://www.googleapis.com/auth/drive.readonly"
    private val guard = Any()
    private var pending: Promise? = null
    private var pendingOwner = ""
    @Volatile private var owner = ""
    @Volatile private var access = ""
    @Volatile private var cancelled = false
    @Volatile private var connection: HttpURLConnection? = null
    private val downloading = AtomicBoolean(false)
    private val catalogs = mutableMapOf<String, JSONObject>()
    private val listings = mutableMapOf<String, JSONArray>()
    private val manifests = mutableMapOf<String, JSONObject>()
    private val fileId = Regex("[a-zA-Z0-9_-]{10,200}")
    private val listener = object : BaseActivityEventListener() {
        override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
            if (requestCode != 7814) return
            if (resultCode != Activity.RESULT_OK || data == null) { authError("Google Drive authorization was cancelled"); return }
            try { authorized(Identity.getAuthorizationClient(context).getAuthorizationResultFromIntent(data)) }
            catch (_: Exception) { authError("Google authorization failed. Check the Android OAuth client and test-user configuration.") }
        }
    }
    init { context.addActivityEventListener(listener) }
    override fun getName() = "GoogleDriveAudio"
    @ReactMethod fun addListener(name: String) {}
    @ReactMethod fun removeListeners(count: Int) {}
    private fun authError(message: String) = synchronized(guard) {
        pending?.reject("DRIVE_AUTH", message); pending = null; pendingOwner = ""
    }
    private fun authorized(result: AuthorizationResult) = synchronized(guard) {
        val promise = pending ?: return@synchronized
        val token = result.accessToken
        if (token.isNullOrBlank() || !result.grantedScopes.contains(scope)) { authError("Google Drive read permission was not granted"); return@synchronized }
        access = token; owner = pendingOwner; cancelled = false
        synchronized(catalogs) { catalogs.clear() }; synchronized(listings) { listings.clear() }; synchronized(manifests) { manifests.clear() }
        pending = null; pendingOwner = ""; promise.resolve(true)
    }
    @ReactMethod fun authorize(userId: String, promise: Promise) {
        val activity = context.currentActivity ?: run { promise.reject("DRIVE_AUTH", "Open the app to connect Google Drive"); return }
        synchronized(guard) {
            if (pending != null || downloading.get()) { promise.reject("DRIVE_BUSY", "A Drive operation is already running"); return }
            if (userId.isBlank()) { promise.reject("DRIVE_AUTH", "Sign in to the app first"); return }
            pending = promise; pendingOwner = userId
        }
        activity.runOnUiThread {
            val request = AuthorizationRequest.builder().setRequestedScopes(listOf(Scope(scope))).build()
            Identity.getAuthorizationClient(activity).authorize(request).addOnSuccessListener { result ->
                if (synchronized(guard) { pending == null }) return@addOnSuccessListener
                if (result.hasResolution()) {
                    try { activity.startIntentSenderForResult(result.pendingIntent!!.intentSender, 7814, null, 0, 0, 0) }
                    catch (_: Exception) { authError("Unable to open Google permission screen") }
                } else authorized(result)
            }.addOnFailureListener {
                authError("Google Drive connection failed. Enable Drive API and register the Android OAuth package/signing SHA-1. See Drive setup instructions.")
            }
        }
    }
    private fun task(promise: Promise, block: () -> String) {
        LocalSyncRunner.executor.execute { try { promise.resolve(block()) } catch (error: Exception) { promise.reject("GOOGLE_DRIVE", error.message ?: "Drive request failed") } }
    }
    private fun requireOwner(userId: String) { check(userId.isNotBlank() && owner == userId && access.isNotEmpty()) { "Connect Google Drive for this app account first" }; check(!cancelled) { "Drive sync stopped. Connect again to resume." } }
    private fun encode(text: String) = URLEncoder.encode(text, "UTF-8")
    private fun connect(userId: String, path: String): HttpURLConnection {
        requireOwner(userId)
        val request = URL("https://www.googleapis.com/drive/v3/$path").openConnection() as HttpURLConnection
        request.connectTimeout = 10000; request.readTimeout = 15000; request.instanceFollowRedirects = false
        request.setRequestProperty("Authorization", "Bearer $access")
        connection = request
        if (cancelled) { request.disconnect(); error("Drive sync stopped") }
        return request
    }
    private fun status(request: HttpURLConnection): Int {
        val code = request.responseCode
        if (code == 401) {
            val invalid = access; access = ""
            if (invalid.isNotBlank()) Identity.getAuthorizationClient(context).clearToken(ClearTokenRequest.builder().setToken(invalid).build())
            error("Google Drive authorization expired. Connect again to resume.")
        }
        check(code in 200..299) {
            if (code == 403) "Google Drive access denied. Check Drive API, consent scope and test-user setup."
            else if (code == 404) "Drive book/file not found. Refresh and select the book again."
            else "Drive request failed ($code). Retry to resume."
        }
        return code
    }
    private fun json(userId: String, path: String): JSONObject {
        val request = connect(userId, path)
        try {
            status(request)
            return request.inputStream.use { input ->
                val bytes = java.io.ByteArrayOutputStream(); val buffer = ByteArray(8192)
                while (true) { requireOwner(userId); val count = input.read(buffer); if (count < 0) break
                    check(bytes.size() + count <= 4_000_000) { "Drive metadata is too large" }; bytes.write(buffer, 0, count) }
                JSONObject(String(bytes.toByteArray(), Charsets.UTF_8))
            }
        } finally { request.disconnect(); connection = null }
    }
    private fun children(userId: String, parent: String, name: String? = null): JSONArray {
        check(parent == "root" || fileId.matches(parent))
        val query = "'$parent' in parents and trashed = false" + (if (name != null) " and name = '${name.replace("'", "\\'")}'" else "")
        val files = JSONArray(); var page = ""; var pages = 0
        do {
            val response = json(userId, "files?q=${encode(query)}&fields=nextPageToken,files(id,name,mimeType,size)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true" + if (page.isNotEmpty()) "&pageToken=${encode(page)}" else "")
            val entries = response.getJSONArray("files"); for (i in 0 until entries.length()) files.put(entries.getJSONObject(i))
            page = response.optString("nextPageToken"); pages++; check(pages <= 20) { "Too many files in Drive folder" }
        } while (page.isNotEmpty())
        return files
    }
    private fun child(userId: String, parent: String, name: String, folder: Boolean = false): JSONObject {
        requireOwner(userId)
        val files = synchronized(listings) { listings[parent] } ?: children(userId, parent).also { synchronized(listings) { listings[parent] = it } }
        val matches = (0 until files.length()).map { files.getJSONObject(it) }.filter {
            it.getString("name") == name && (it.getString("mimeType") == "application/vnd.google-apps.folder") == folder }
        check(matches.size == 1) { "Expected one $name in the selected Drive folder; found ${matches.size}. Remove duplicate names or refresh Drive." }
        return matches.first()
    }
    private fun mediaJson(userId: String, id: String): JSONObject { check(fileId.matches(id)); return json(userId, "files/$id?alt=media&supportsAllDrives=true") }
    @ReactMethod fun listBooks(userId: String, promise: Promise) = task(promise) {
        var parent = "root"
        for (name in listOf("Myepub", "UltimateAudio")) parent = child(userId, parent, name, true).getString("id")
        val folders = children(userId, parent); val books = JSONArray()
        for (i in 0 until folders.length()) { val folder = folders.getJSONObject(i)
            if (folder.getString("mimeType") == "application/vnd.google-apps.folder") books.put(folder) }
        books.toString()
    }
    private fun loadCatalog(userId: String, folder: String): JSONObject {
        requireOwner(userId); check(fileId.matches(folder))
        val data = mediaJson(userId, child(userId, folder, "book.json").getString("id"))
        check(data.optString("schema") == "ultimate-drive-audio" && data.optInt("schemaVersion") == 1) { "Unsupported Drive book catalog" }
        synchronized(catalogs) { catalogs[folder] = data }
        return data
    }
    @ReactMethod fun catalog(userId: String, folder: String, promise: Promise) = task(promise) { loadCatalog(userId, folder).toString() }
    private fun chapterFolder(userId: String, folder: String) = child(userId, folder, "chapters", true).getString("id")
    @ReactMethod fun manifest(userId: String, folder: String, identity: String, promise: Promise) = task(promise) {
        check(identity.matches(Regex("[a-f0-9]{64}")))
        val data = mediaJson(userId, child(userId, chapterFolder(userId, folder), "$identity.json").getString("id"))
        synchronized(manifests) { manifests["$folder:$identity"] = data }
        data.toString()
    }
    private fun emit(userId: String, bytes: Long, total: Long) {
        if (context.hasActiveReactInstance()) context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("DriveAudioProgress", JSONObject().put("userId", userId).put("downloadedBytes", bytes).put("totalBytes", total).toString())
    }
    @ReactMethod fun importChapter(userId: String, folder: String, raw: String, promise: Promise) = task(promise) {
        check(downloading.compareAndSet(false, true)) { "A Drive download is already running" }
        try {
            requireOwner(userId); val request = JSONObject(raw); check(request.getString("userId") == userId)
            val identity = request.getString("identity"); check(identity.matches(Regex("[a-f0-9]{64}")))
            val catalog = synchronized(catalogs) { catalogs[folder] } ?: loadCatalog(userId, folder)
            val parent = chapterFolder(userId, folder)
            val manifest = synchronized(manifests) { manifests["$folder:$identity"] } ?: mediaJson(userId, child(userId, parent, "$identity.json").getString("id"))
            val record = catalog.getJSONObject("recordings").getJSONObject(identity)
            val size = manifest.getLong("bytes"); val hash = manifest.getString("sha256")
            check(size in 45..200_000_000L && hash.matches(Regex("[a-f0-9]{64}")) && hash == record.getString("sha256"))
            val audio = child(userId, parent, "$identity.wav"); check(audio.optLong("size") == size)
            val directory = File(context.filesDir, "drive-downloads").apply { mkdirs() }
            val ownerHash = MessageDigest.getInstance("SHA-256").digest(userId.toByteArray()).joinToString("") { "%02x".format(it) }.take(16)
            val partial = File(directory, "$ownerHash-$hash.part")
            if (partial.length() > size) partial.delete()
            check(directory.usableSpace > size - partial.length() + size + 30_000_000) { "Not enough phone storage" }
            if (partial.length() < size) {
                val download = connect(userId, "files/${audio.getString("id")}?alt=media&supportsAllDrives=true")
                try {
                    download.setRequestProperty("Accept-Encoding", "identity")
                    val offset = partial.length(); if (offset > 0) download.setRequestProperty("Range", "bytes=$offset-")
                    val code = status(download)
                    check(code == 200 || code == 206)
                    if (code == 206) check(DriveRange.valid(download.getHeaderField("Content-Range"), offset, size)) { "Invalid Drive resume response" }
                    var bytes = if (code == 206) offset else 0L
                    FileOutputStream(partial, code == 206).use { output -> download.inputStream.use { input ->
                        val buffer = ByteArray(65536)
                        while (true) { requireOwner(userId); val count = input.read(buffer); if (count < 0) break
                            bytes += count; check(bytes <= size); output.write(buffer, 0, count)
                            if (bytes == size || bytes % 1048576 < count) emit(userId, bytes, size)
                        }; output.fd.sync()
                    } }
                } finally { download.disconnect(); connection = null }
            }
            requireOwner(userId)
            check(partial.length() == size) { "Incomplete Drive download. Retry to resume." }
            try { DriveAudioImport.publish(context, request, catalog, manifest, partial.length()) { partial.inputStream() } }
            catch (error: Exception) { partial.delete(); throw error }
            finally { if (!cancelled && partial.length() == size) partial.delete() }
        } finally { downloading.set(false) }
    }
    @ReactMethod fun cancel(userId: String, promise: Promise) {
        synchronized(guard) { if (pendingOwner == userId) authError("Google Drive authorization was cancelled") }
        if (owner == userId) { cancelled = true; connection?.disconnect() }
        promise.resolve(true)
    }
    @ReactMethod fun disconnect(userId: String, promise: Promise) {
        synchronized(guard) {
            if (pendingOwner == userId) authError("Google Drive disconnected")
            if (owner == userId) { cancelled = true; connection?.disconnect(); access = ""; owner = ""; synchronized(catalogs) { catalogs.clear() } }
        }
        promise.resolve(true)
    }
    override fun invalidate() { cancelled = true; connection?.disconnect(); access = ""; authError("Drive connection closed"); context.removeActivityEventListener(listener); super.invalidate() }
}
