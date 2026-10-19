package android.content
import android.view.KeyEvent
open class Context { companion object { const val POWER_SERVICE = "power" }; open fun getSystemService(name: String): Any? = null }
class Intent(val event: KeyEvent? = null) {
    companion object { const val EXTRA_KEY_EVENT = "android.intent.extra.KEY_EVENT" }
    @Suppress("UNCHECKED_CAST") fun <T> getParcelableExtra(name: String): T? = event as T?
}
