package com.facebook.react.bridge

annotation class ReactMethod
interface Promise { fun resolve(value: Any?); fun reject(code: String, message: String?, error: Throwable? = null) }
open class ReactContextBaseJavaModule(val reactApplicationContext: ReactApplicationContext) { open fun getName() = "" }
class ReactApplicationContext(val contentResolver: FakeResolver, val granted: Boolean = true) {
    fun checkSelfPermission(permission: String) = if (granted) 0 else -1
}
class WritableMap(val values: MutableMap<String, Any?> = linkedMapOf()) {
    fun putString(key: String, value: String?) { values[key] = value }
    fun putBoolean(key: String, value: Boolean) { values[key] = value }
    fun putDouble(key: String, value: Double) { values[key] = value }
    fun putArray(key: String, value: WritableArray) { values[key] = value }
    fun putMap(key: String, value: WritableMap) { values[key] = value }
    fun putNull(key: String) { values[key] = null }
}
class WritableArray(val values: MutableList<Any?> = mutableListOf()) {
    fun size() = values.size
    fun pushMap(value: WritableMap) { values.add(value) }
}
object Arguments { fun createMap() = WritableMap(); fun createArray() = WritableArray() }
data class Row(val id: Long, val date: Long)
class FakeCursor(private val rows: List<Row>) : java.io.Closeable {
    private var index = -1
    fun getColumnIndexOrThrow(column: String) = when (column) { "_id" -> 0; "address" -> 1; "body" -> 2; "date" -> 3; else -> error(column) }
    fun moveToNext(): Boolean { index++; return index < rows.size }
    fun getString(column: Int): String = when (column) { 0 -> rows[index].id.toString(); 1 -> "TEST-BANK"; else -> "Synthetic test message" }
    fun getLong(column: Int): Long = rows[index].date
    override fun close() {}
}
class FakeResolver {
    var selection = ""
    var selectionArgs: List<String> = emptyList()
    var sortOrder = ""
    fun query(uri: String, projection: Array<String>, where: String, args: Array<String>, sort: String): FakeCursor {
        selection = where; selectionArgs = args.toList(); sortOrder = sort
        // Synthetic rows only. Tests also execute the captured real SQL in SQLite
        // so this adapter cannot conceal an incorrect keyset comparison.
        val rows = listOf(Row(5, 1000), Row(4, 1000), Row(3, 1000), Row(2, 999), Row(1, 998), Row(2, 0), Row(1, 0))
        return FakeCursor(rows.filter { row ->
            row.date >= args[0].toLong() && row.date <= args[1].toLong() &&
                (args.size == 2 || row.date < args[2].toLong() || row.date == args[3].toLong() && row.id < args[4].toLong())
        }.sortedWith(compareByDescending<Row> { it.date }.thenByDescending { it.id }))
    }
}
fun json(value: Any?): String = when (value) {
    null -> "null"
    is String -> "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n") + "\""
    is WritableMap -> json(value.values)
    is WritableArray -> json(value.values)
    is Map<*, *> -> value.entries.joinToString(",", "{", "}") { json(it.key.toString()) + ":" + json(it.value) }
    is List<*> -> value.joinToString(",", "[", "]") { json(it) }
    else -> value.toString()
}
