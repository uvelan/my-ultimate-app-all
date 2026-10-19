const fs = require('node:fs/promises');
const path = require('node:path');
const { withMainApplication, withDangerousMod, createRunOncePlugin } = require('expo/config-plugins');

function withReaderMediaSession(config) {
  config = withMainApplication(config, mod => {
    if (mod.modResults.language !== 'kt') throw new Error('ReaderMediaSession requires Kotlin MainApplication.');
    const source = mod.modResults.contents;
    if (!source.includes('add(ReaderMediaSessionPackage())')) {
      const packages = /PackageList\(this\)\.packages\.apply\s*\{/;
      if (!packages.test(source)) throw new Error('Could not register ReaderMediaSessionPackage.');
      mod.modResults.contents = source.replace(packages, match => `${match}\n          add(ReaderMediaSessionPackage())`);
    }
    return mod;
  });
  return withDangerousMod(config, ['android', async mod => {
    const packageName = mod.android?.package || 'com.uvelan.ultimateapp';
    if (!/^[a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)+$/.test(packageName)) throw new Error('Invalid Android package.');
    const destination = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/java', ...packageName.split('.'));
    await fs.mkdir(destination, { recursive: true });
    for (const name of ['ReaderMediaSessionModule.kt', 'ReaderMediaSessionPackage.kt']) {
      const template = await fs.readFile(path.join(__dirname, 'reader-media', name), 'utf8');
      await fs.writeFile(path.join(destination, name), template.replace(/^package [^\r\n]+/, `package ${packageName}`));
    }
    return mod;
  }]);
}
module.exports = createRunOncePlugin(withReaderMediaSession, 'with-reader-media-session', '1.0.0');
