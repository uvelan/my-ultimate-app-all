package com.uvelan.ultimateapp

/**
 * Sherpa 1.12.x JNI resolves invoke([F)Ljava/lang/Integer; by reflection.
 * Kotlin 2's invokedynamic lambdas expose only invoke(Object): Object, which
 * leaves a NoSuchMethodError pending in JNI and aborts Android with SIGABRT.
 * Keep this concrete, typed callback (and its boxed return) in release builds.
 */
class KokoroCallback(private val cancelled: () -> Boolean) : (FloatArray) -> Int {
    override fun invoke(samples: FloatArray): Int = if (cancelled()) 0 else 1
}
