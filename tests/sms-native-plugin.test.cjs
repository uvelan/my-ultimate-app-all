const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const pluginDirectory = path.resolve(__dirname, '../mobile-app/plugins');
function plugin() {
  const module = { exports: {} };
  const mods = {};
  const hooks = {
    withAndroidManifest(config, callback) { mods.manifest = callback; return config; },
    withMainApplication(config, callback) { mods.application = callback; return config; },
    withDangerousMod(config, [, callback]) { mods.files = callback; return config; },
    createRunOncePlugin: value => value,
  };
  new vm.Script(fs.readFileSync(path.join(pluginDirectory, 'withSmsReader.js'), 'utf8')).runInNewContext({
    module, exports: module.exports, __dirname: pluginDirectory,
    require(name) { return name === 'expo/config-plugins' ? hooks : require(name); },
  });
  module.exports({});
  return mods;
}

test('Expo prebuild adds SMS permission and Kotlin registration once', () => {
  const mods = plugin();
  let manifest = { modResults: { manifest: {} } };
  manifest = mods.manifest(mods.manifest(manifest));
  assert.equal(manifest.modResults.manifest['uses-permission'].length, 1);
  assert.equal(manifest.modResults.manifest['uses-permission'][0].$['android:name'], 'android.permission.READ_SMS');
  let application = { modResults: { language: 'kt', contents: 'package com.example\nPackageList(this).packages.apply {\n}' } };
  application = mods.application(mods.application(application));
  assert.equal(application.modResults.contents.split('add(SmsReaderPackage())').length - 1, 1);
  assert.throws(() => mods.application({ modResults: { language: 'kt', contents: 'unexpected template' } }), /Could not register/);
});

test('Expo prebuild recreates tracked native templates with the configured Android package', async () => {
  const destination = await fsp.mkdtemp(path.join(os.tmpdir(), 'sms-native-plugin-'));
  try {
    await plugin().files({ android: { package: 'com.example.sms' }, modRequest: { platformProjectRoot: destination } });
    const module = await fsp.readFile(path.join(destination, 'app/src/main/java/com/example/sms/SmsReaderModule.kt'), 'utf8');
    assert.match(module, /^package com\.example\.sms/);
    assert.match(module, /fun readSmsPage\(/);
    assert.match(module, /SMS_PERMISSION_DENIED/);
    assert.match(module, /Telephony\.Sms\.DATE\} DESC, \$\{Telephony\.Sms\._ID\} DESC/);
    const packageSource = await fsp.readFile(path.join(destination, 'app/src/main/java/com/example/sms/SmsReaderPackage.kt'), 'utf8');
    assert.match(packageSource, /SmsReaderModule\(reactContext\)/);
  } finally {
    // This exact test-created temporary directory is the sole cleanup target.
    const resolved = path.resolve(destination);
    assert.ok(path.dirname(resolved) === path.resolve(os.tmpdir()));
    await fsp.rm(resolved, { recursive: true, force: true });
  }
});
