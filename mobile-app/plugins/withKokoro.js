const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { withMainApplication, withAppBuildGradle, withAndroidManifest, withDangerousMod, createRunOncePlugin } = require('expo/config-plugins');

const AAR = 'sherpa-onnx-1.12.23.aar';
const SHA = '67aa920e08c6fb6d784009ae8c58f8a151c59041bdf77fd90bbbe56eb9522975';
async function prepareRuntime(projectRoot) {
  const file = path.join(projectRoot, 'vendor', AAR);
  const valid = async () => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex') === SHA;
  if (await valid().catch(() => false)) return;
  const response = await fetch(`https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.12.23/${AAR}`);
  if (!response.ok) throw new Error(`Kokoro runtime download failed (${response.status}).`);
  const data = Buffer.from(await response.arrayBuffer());
  if (crypto.createHash('sha256').update(data).digest('hex') !== SHA) throw new Error('Kokoro runtime checksum mismatch.');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, data);
}
function withKokoro(config) {
  config = withAndroidManifest(config, mod => {
    const manifest = mod.modResults.manifest;
    manifest['uses-permission'] ||= [];
    for (const name of ['WAKE_LOCK', 'INTERNET', 'ACCESS_NETWORK_STATE', 'CHANGE_WIFI_MULTICAST_STATE', 'FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_DATA_SYNC', 'RECEIVE_BOOT_COMPLETED']) {
      const full = 'android.permission.' + name;
      if (!manifest['uses-permission'].some(item => item.$['android:name'] === full)) manifest['uses-permission'].push({ $: { 'android:name': full } });
    }
    const app = manifest.application[0]; app.service ||= [];
    for (const service of [
      { 'android:name': '.LocalSyncForeground', 'android:exported': 'false', 'android:foregroundServiceType': 'dataSync' },
      { 'android:name': '.LocalSyncJob', 'android:exported': 'false', 'android:permission': 'android.permission.BIND_JOB_SERVICE' },
    ]) if (!app.service.some(item => item.$['android:name'] === service['android:name'])) app.service.push({ $: service });
    return mod;
  });
  config = withMainApplication(config, mod => {
    if (mod.modResults.language !== 'kt') throw new Error('Kokoro requires Kotlin MainApplication.');
    if (!mod.modResults.contents.includes('add(KokoroPackage())')) {
      const packages = /PackageList\(this\)\.packages\.apply\s*\{/;
      if (!packages.test(mod.modResults.contents)) throw new Error('Could not register KokoroPackage.');
      mod.modResults.contents = mod.modResults.contents.replace(packages, match => `${match}\n          add(KokoroPackage())`);
    }
    return mod;
  });
  config = withAppBuildGradle(config, mod => {
    if (!mod.modResults.contents.includes('// Kokoro offline runtime')) {
      mod.modResults.contents += `\n// Kokoro offline runtime\ndependencies {\n    implementation files("../../vendor/${AAR}")\n    implementation "org.apache.commons:commons-compress:1.27.1"\n    implementation "commons-io:commons-io:2.16.1"\n}\n`;
    }
    return mod;
  });
  return withDangerousMod(config, ['android', async mod => {
    await prepareRuntime(mod.modRequest.projectRoot);
    require('./patchLocalChapterQueue.cjs').patchLocalChapterQueue(mod.modRequest.projectRoot);
    const packageName = mod.android?.package || 'com.uvelan.ultimateapp';
    if (!/^[a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)+$/.test(packageName)) throw new Error('Invalid Android package.');
    const destination = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/java', ...packageName.split('.'));
    await fs.mkdir(destination, { recursive: true });
    for (const name of ['KokoroModule.kt', 'KokoroPackage.kt', 'KokoroFiles.kt', 'KokoroCallback.kt', 'KokoroGenerationGate.kt', 'PlaybackDiagnostics.kt', 'LocalSyncModule.kt', 'LocalSyncBatch.kt']) {
      const source = await fs.readFile(path.join(__dirname, 'kokoro', name), 'utf8');
      await fs.writeFile(path.join(destination, name), source.replace(/^package [^\r\n]+/, `package ${packageName}`));
    }
    const rules = path.join(mod.modRequest.platformProjectRoot, 'app/proguard-rules.pro');
    const current = await fs.readFile(rules, 'utf8');
    if (!current.includes('-keep class com.k2fsa.sherpa.onnx.')) {
      await fs.appendFile(rules, '\n# JNI looks up Sherpa config fields by name.\n-keep class com.k2fsa.sherpa.onnx.** { *; }\n');
    }
    if (!current.includes(`-keep class ${packageName}.KokoroCallback`)) {
      await fs.appendFile(rules, `\n# Sherpa JNI resolves the typed, boxed callback method by reflection.\n-keep class ${packageName}.KokoroCallback { *; }\n`);
    }
    return mod;
  }]);
}
module.exports = createRunOncePlugin(withKokoro, 'with-kokoro', '1.0.0');
