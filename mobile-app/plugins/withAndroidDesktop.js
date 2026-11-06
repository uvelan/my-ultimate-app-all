const { AndroidConfig, withAndroidManifest, withMainActivity } = require('@expo/config-plugins');

function patchMainActivity(source) {
    if (source.includes('private fun refreshWindowMetrics(')) return source;
    const activity = 'class MainActivity : ReactActivity() {';
    const onCreate = '    super.onCreate(null)';
    if (!source.includes(activity) || !source.includes(onCreate)) throw new Error('Cannot add Android desktop window metrics to MainActivity.');
    return source.replace(activity, `${activity}
  private var reportedWindow: List<Number>? = null

  private fun refreshWindowMetrics(view: android.view.View? = null) {
    val holder = com.facebook.react.uimanager.DisplayMetricsHolder
    holder.initDisplayMetrics(this)
    val metrics = android.util.DisplayMetrics().apply {
      setTo(resources.displayMetrics)
      if (view != null && view.width > 0 && view.height > 0) {
        widthPixels = view.width
        heightPixels = view.height
      }
    }
    holder.setWindowDisplayMetrics(metrics)
    val fontScale = resources.configuration.fontScale
    val screen = holder.getScreenDisplayMetrics()
    val window = listOf(metrics.widthPixels, metrics.heightPixels, metrics.densityDpi, fontScale,
      screen.widthPixels, screen.heightPixels, screen.densityDpi)
    val react = (application as com.facebook.react.ReactApplication).reactHost?.currentReactContext
    if (window != reportedWindow && react?.hasActiveReactInstance() == true) {
      reportedWindow = window
      react.emitDeviceEvent("didUpdateDimensions", holder.getDisplayMetricsWritableMap(fontScale.toDouble()))
    }
  }

  override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
    super.onConfigurationChanged(newConfig)
    val content = findViewById<android.view.View>(android.R.id.content)
    refreshWindowMetrics()
    content?.requestLayout()
    content?.post { refreshWindowMetrics(content) }
  }

  override fun onResume() {
    super.onResume()
    refreshWindowMetrics(findViewById(android.R.id.content))
  }
`).replace(onCreate, `    refreshWindowMetrics()
${onCreate}
    findViewById<android.view.View>(android.R.id.content)?.addOnLayoutChangeListener { view, _, _, _, _, _, _, _, _ ->
      refreshWindowMetrics(view)
    }`);
}

module.exports = function withAndroidDesktop(config) {
    config = withMainActivity(config, mod => {
        if (mod.modResults.language !== 'kt') throw new Error('Android desktop requires Kotlin MainActivity.');
        mod.modResults.contents = patchMainActivity(mod.modResults.contents);
        return mod;
    });
    return withAndroidManifest(config, mod => {
        const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
        const activity = AndroidConfig.Manifest.getMainActivityOrThrow(mod.modResults);
        application.$['android:resizeableActivity'] = 'true';
        delete activity.$['android:screenOrientation'];
        const changes = new Set((activity.$['android:configChanges'] || '').split('|').filter(Boolean));
        for (const change of ['orientation', 'screenSize', 'smallestScreenSize', 'density', 'screenLayout', 'uiMode', 'keyboard', 'keyboardHidden', 'navigation']) {
            changes.add(change);
        }
        activity.$['android:configChanges'] = [...changes].join('|');
        const key = 'com.samsung.android.multidisplay.keep_process_alive';
        const metadata = application['meta-data'] ||= [];
        const existing = metadata.find(entry => entry.$['android:name'] === key);
        if (existing) existing.$['android:value'] = 'true';
        else metadata.push({ $: { 'android:name': key, 'android:value': 'true' } });
        return mod;
    });
};

module.exports.patchMainActivity = patchMainActivity;
