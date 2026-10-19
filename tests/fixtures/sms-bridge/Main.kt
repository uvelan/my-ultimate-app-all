package com.uvelan.ultimateapp
import com.facebook.react.bridge.*

fun main(args: Array<String>) {
    val resolver = FakeResolver()
    val reader = SmsReaderModule(ReactApplicationContext(resolver, args.getOrNull(5) != "denied"))
    var result: Any? = null
    var rejected: String? = null
    val promise = object : Promise {
        override fun resolve(value: Any?) { result = value }
        override fun reject(code: String, message: String?, error: Throwable?) { rejected = code }
    }
    reader.readSmsPage(args[0].toDouble(), args[1].toDouble(), args[2].toDouble(), args[3], args[4].toDouble(), promise)
    println(json(linkedMapOf("error" to rejected, "result" to result, "selection" to resolver.selection,
        "args" to resolver.selectionArgs, "sort" to resolver.sortOrder)))
}
