const fs = require('node:fs/promises');
const path = require('node:path');
const { withAndroidManifest, withMainApplication, withDangerousMod, createRunOncePlugin } = require('expo/config-plugins');

function withSmsReader(config) {
  config = withAndroidManifest(config, mod => {
    const manifest = mod.modResults.manifest;
    const permissions = manifest['uses-permission'] || [];
    if (!permissions.some(permission => permission.$?.['android:name'] === 'android.permission.READ_SMS')) {
      permissions.push({ $: { 'android:name': 'android.permission.READ_SMS' } });
    }
    manifest['uses-permission'] = permissions;
    return mod;
  });
  config = withMainApplication(config, mod => {
    if (mod.modResults.language !== 'kt') throw new Error('SmsReader requires a Kotlin MainApplication.');
    const source = mod.modResults.contents;
    if (!source.includes('add(SmsReaderPackage())')) {
      const packageList = /PackageList\(this\)\.packages\.apply\s*\{/;
      if (!packageList.test(source)) throw new Error('Could not register SmsReaderPackage in MainApplication.');
      mod.modResults.contents = source.replace(packageList, match => `${match}\n          add(SmsReaderPackage())`);
    }
    return mod;
  });
  return withDangerousMod(config, ['android', async mod => {
    const packageName = mod.android?.package || 'com.uvelan.ultimateapp';
    if (!/^[a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)+$/.test(packageName)) throw new Error('Invalid Android package for SmsReader.');
    const destination = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/java', ...packageName.split('.'));
    await fs.mkdir(destination, { recursive: true });
    for (const filename of ['SmsReaderModule.kt', 'SmsReaderPackage.kt']) {
      const template = await fs.readFile(path.join(__dirname, 'sms-reader', filename), 'utf8');
      await fs.writeFile(path.join(destination, filename), template.replace(/^package [^\r\n]+/, `package ${packageName}`));
    }
    return mod;
  }]);
}

module.exports = createRunOncePlugin(withSmsReader, 'with-sms-reader', '1.0.0');
