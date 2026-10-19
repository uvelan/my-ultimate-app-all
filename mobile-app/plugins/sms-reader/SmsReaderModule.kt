package com.uvelan.ultimateapp

import android.Manifest
import android.content.pm.PackageManager
import android.provider.Telephony
import com.facebook.react.bridge.*

class SmsReaderModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "SmsReader"

    @ReactMethod
    fun readSms(minDate: Double, maxDate: Double, promise: Promise) {
        // Compatibility for older clients. New clients must use readSmsPage;
        // never construct an unbounded inbox-sized bridge response.
        readPage(minDate, maxDate, 0.0, null, 1000, promise, true)
    }

    @ReactMethod
    fun readSmsPage(minDate: Double, maxDate: Double, beforeDate: Double, beforeId: String?, pageSize: Double, promise: Promise) {
        val limit = if (pageSize.isFinite() && pageSize > 0) pageSize.toInt().coerceIn(1, 500) else 100
        readPage(minDate, maxDate, beforeDate, beforeId, limit, promise, false)
    }

    private fun readPage(minDate: Double, maxDate: Double, beforeDate: Double, beforeId: String?, limit: Int, promise: Promise, legacy: Boolean) {
        if (reactApplicationContext.checkSelfPermission(Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
            promise.reject("SMS_PERMISSION_DENIED", "SMS permission is required to scan your inbox.")
            return
        }
        val cursorId = beforeId?.toLongOrNull()
        // JS sends 0/empty on its first page. Accept -1/empty from older JS
        // clients too, while 0 plus an ID is a real epoch-time cursor.
        val noCursor = (beforeDate == -1.0 || beforeDate == 0.0) && beforeId.isNullOrEmpty()
        val hasCursor = !noCursor
        val validCursor = noCursor || (beforeDate.isFinite() && beforeDate >= minDate && beforeDate <= maxDate &&
            beforeDate % 1.0 == 0.0 && cursorId != null && cursorId >= 0)
        if (!minDate.isFinite() || !maxDate.isFinite() || minDate < 0 || maxDate < minDate || maxDate > 8640000000000000.0 ||
            minDate % 1.0 != 0.0 || maxDate % 1.0 != 0.0 || !validCursor) {
            promise.reject("SMS_INVALID_RANGE", "Invalid SMS date range or pagination cursor.")
            return
        }
        try {
            val projection = arrayOf(
                Telephony.Sms._ID,
                Telephony.Sms.ADDRESS,
                Telephony.Sms.BODY,
                Telephony.Sms.DATE
            )

            var selection = "${Telephony.Sms.DATE} >= ? AND ${Telephony.Sms.DATE} <= ?"
            val selectionArgs = mutableListOf(minDate.toLong().toString(), maxDate.toLong().toString())
            if (hasCursor) {
                selection += " AND (${Telephony.Sms.DATE} < ? OR (${Telephony.Sms.DATE} = ? AND ${Telephony.Sms._ID} < ?))"
                selectionArgs.add(beforeDate.toLong().toString())
                selectionArgs.add(beforeDate.toLong().toString())
                selectionArgs.add(beforeId!!)
            }
            val sortOrder = "${Telephony.Sms.DATE} DESC, ${Telephony.Sms._ID} DESC"
            val cursor = reactApplicationContext.contentResolver.query(
                Telephony.Sms.Inbox.CONTENT_URI, projection, selection, selectionArgs.toTypedArray(), sortOrder
            ) ?: throw IllegalStateException("The SMS provider is unavailable.")
            val results = Arguments.createArray()
            var lastDate = 0L
            var lastId = ""
            var hasMore = false
            cursor.use {
                val idIdx = it.getColumnIndexOrThrow(Telephony.Sms._ID)
                val addrIdx = it.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
                val bodyIdx = it.getColumnIndexOrThrow(Telephony.Sms.BODY)
                val dateIdx = it.getColumnIndexOrThrow(Telephony.Sms.DATE)

                while (results.size() < limit && it.moveToNext()) {
                    val body = it.getString(bodyIdx) ?: ""
                    val map = Arguments.createMap()
                    map.putString("_id", it.getString(idIdx))
                    map.putString("address", it.getString(addrIdx) ?: "")
                    map.putString("body", body.take(32768))
                    map.putBoolean("truncated", body.length > 32768)
                    map.putDouble("date", it.getLong(dateIdx).toDouble())
                    results.pushMap(map)
                    lastDate = it.getLong(dateIdx)
                    lastId = it.getString(idIdx)
                }
                hasMore = it.moveToNext()
            }
            if (legacy) {
                promise.resolve(results)
            } else {
                val page = Arguments.createMap()
                page.putArray("messages", results)
                page.putBoolean("hasMore", hasMore)
                if (hasMore && lastId.isNotEmpty()) {
                    val next = Arguments.createMap()
                    next.putDouble("date", lastDate.toDouble())
                    next.putString("id", lastId)
                    page.putMap("nextCursor", next)
                } else page.putNull("nextCursor")
                promise.resolve(page)
            }
        } catch (e: SecurityException) {
            promise.reject("SMS_PERMISSION_DENIED", "SMS permission was revoked. Grant access and try again.", e)
        } catch (e: Exception) {
            promise.reject("SMS_READ_ERROR", e.message, e)
        }
    }
}
