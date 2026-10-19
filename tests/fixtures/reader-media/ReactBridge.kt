package com.facebook.react.bridge
import android.content.Context
import android.os.PowerManager
import com.facebook.react.modules.core.DeviceEventManagerModule
annotation class ReactMethod
open class ReactContextBaseJavaModule(val reactApplicationContext: ReactApplicationContext) { open fun getName() = ""; open fun invalidate() { reactApplicationContext.active = false } }
class ReactApplicationContext : Context() {
    val power = PowerManager()
    var active = true
    val events = mutableListOf<Map<String, Any?>>()
    override fun getSystemService(name: String): Any = power
    fun hasActiveReactInstance() = active
    @Suppress("UNCHECKED_CAST") fun <T> getJSModule(type: Class<T>): T = object : DeviceEventManagerModule.RCTDeviceEventEmitter {
        override fun emit(name: String, value: Any?) { events.add(linkedMapOf("name" to name, "data" to value)) }
    } as T
}
class WritableMap(val values: MutableMap<String, Any?> = linkedMapOf()) { fun putString(name: String, value: String) { values[name] = value } }
object Arguments { fun createMap() = WritableMap() }
fun json(value: Any?): String = when (value) {
    null -> "null"
    is String -> "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""
    is WritableMap -> json(value.values)
    is Map<*, *> -> value.entries.joinToString(",", "{", "}") { json(it.key.toString()) + ":" + json(it.value) }
    is List<*> -> value.joinToString(",", "[", "]") { json(it) }
    else -> value.toString()
}
