package com.uvelan.ultimateapp

import java.io.InterruptedIOException
import java.net.HttpURLConnection

/** Invalidates old work permanently, even when the user resumes immediately. */
class SyncTransferControl {
    private val lock = Any()
    private var version = 0L
    private var paused = false
    private val connections = mutableSetOf<HttpURLConnection>()
    private val workerRevision = ThreadLocal<Long>()
    data class Run(val revision: Long, val id: Long)
    private var sequence = 0L
    private var activeRun: Run? = null
    private var requestedRun: Long? = null
    fun busy(): Boolean = synchronized(lock) { activeRun?.revision == version || requestedRun == version }
    fun requestRun(revision: Long, launch: () -> Unit): Boolean = synchronized(lock) {
        if (version != revision || paused || activeRun?.revision == revision || requestedRun == revision) false
        else {
            requestedRun = revision
            try { launch() } catch (error: Exception) { requestedRun = null; throw error }
            true
        }
    }
    fun enterRun(revision: Long, requested: Boolean = true): Run? = synchronized(lock) {
        if (version != revision || paused || activeRun != null || (!requested && requestedRun == revision)) null
        else Run(revision, ++sequence).also { activeRun = it; if (requestedRun == revision) requestedRun = null }
    }
    fun pendingRun(revision: Long): Boolean = synchronized(lock) { version == revision && !paused && requestedRun == revision }
    fun ownsRun(run: Run): Boolean = synchronized(lock) { activeRun == run }
    /** Queue inspection and idle retirement are atomic relative to a start request. */
    fun <T> nextOrFinish(run: Run, select: () -> T?, idle: () -> Unit): T? = synchronized(lock) {
        if (activeRun != run || version != run.revision || paused) null
        else select().also { if (it == null) { idle(); activeRun = null } }
    }
    fun finishRun(run: Run) = synchronized(lock) { if (activeRun == run) activeRun = null }
    fun bind(revision: Long) { workerRevision.set(revision) }
    fun unbind() { workerRevision.remove() }
    fun workerIsCurrent(): Boolean = workerRevision.get()?.let { current(it) } ?: true
    fun revision(): Long = synchronized(lock) { version }
    fun current(revision: Long): Boolean = synchronized(lock) { version == revision && !paused }
    fun ifRevision(revision: Long, action: () -> Unit) = synchronized(lock) { if (version == revision) action() }
    fun resume(revision: Long, start: () -> Unit): Boolean = synchronized(lock) {
        if (version != revision) false else { paused = false; start(); true }
    }
    fun track(connection: HttpURLConnection) = synchronized(lock) {
        if (paused || workerRevision.get()?.let { it != version } == true) { connection.disconnect(); throw InterruptedIOException("Sync paused") }
        connections.add(connection)
        Unit
    }
    fun release(connection: HttpURLConnection) { synchronized(lock) { connections.remove(connection) }; connection.disconnect() }
    fun pause(persist: () -> Unit) {
        var failure: Exception? = null
        val interrupted = synchronized(lock) {
            version++; paused = true; requestedRun = null
            try { persist() } catch (error: Exception) { failure = error }
            connections.toList().also { connections.clear() }
        }
        // Never hold the control lock while a platform socket closes.
        interrupted.forEach { try { it.disconnect() } catch (_: Exception) { } }
        failure?.let { throw it }
    }
}
