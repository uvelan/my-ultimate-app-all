const fs = require('node:fs/promises');
const path = require('node:path');
const { AndroidConfig, withAndroidManifest, withMainApplication, withDangerousMod, createRunOncePlugin } = require('expo/config-plugins');

function withRoutineReminder(config) {
  config = AndroidConfig.Permissions.withPermissions(config, [
    'android.permission.ACCESS_NETWORK_STATE',
    'android.permission.POST_NOTIFICATIONS',
    'android.permission.SCHEDULE_EXACT_ALARM',
    'android.permission.RECEIVE_BOOT_COMPLETED',
    'android.permission.VIBRATE',
  ]);
  config = withAndroidManifest(config, mod => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    const launcher = AndroidConfig.Manifest.getMainActivityOrThrow(mod.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(launcher, 'android.app.shortcuts', '@xml/routine_reminder_shortcuts', 'resource');
    application.activity ??= [];
    application.receiver ??= [];
    const shortcutName = '.RoutineReminderShortcutActivity';
    const existingShortcut = application.activity.find(item => item.$['android:name'] === shortcutName);
    const shortcut = existingShortcut ?? { $: { 'android:name': shortcutName } };
    Object.assign(shortcut.$, {
      'android:exported': 'true',
      'android:excludeFromRecents': 'true',
      'android:taskAffinity': '',
      'android:theme': '@android:style/Theme.NoDisplay',
    });
    if (!existingShortcut) application.activity.push(shortcut);
    const receiverName = '.RoutineReminderReceiver';
    const receiver = {
      $: { 'android:name': receiverName, 'android:exported': 'false' },
      'intent-filter': [{ action: [
        { $: { 'android:name': 'android.intent.action.BOOT_COMPLETED' } },
        { $: { 'android:name': 'android.intent.action.MY_PACKAGE_REPLACED' } },
        { $: { 'android:name': 'android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED' } },
      ] }],
    };
    application.receiver = application.receiver.filter(item => item.$['android:name'] !== receiverName);
    application.receiver.push(receiver);
    application.service ??= [];
    const syncService = '.RoutineReminderSyncJob';
    if (!application.service.some(item => item.$['android:name'] === syncService)) {
      application.service.push({ $: {
        'android:name': syncService,
        'android:exported': 'false',
        'android:permission': 'android.permission.BIND_JOB_SERVICE',
      } });
    }
    return mod;
  });
  config = withMainApplication(config, mod => {
    const source = mod.modResults.contents;
    if (!source.includes('add(RoutineReminderPackage())')) {
      const packages = /PackageList\(this\)\.packages\.apply\s*\{/;
      if (mod.modResults.language !== 'kt' || !packages.test(source)) {
        throw new Error('Could not register RoutineReminderPackage.');
      }
      mod.modResults.contents = source.replace(packages, match => match + '\n          add(RoutineReminderPackage())');
    }
    return mod;
  });
  return withDangerousMod(config, ['android', async mod => {
    const packageName = mod.android?.package;
    if (!packageName || !/^[a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)+$/.test(packageName)) {
      throw new Error('Invalid Android package for Routine Reminders.');
    }
    const main = path.join(mod.modRequest.platformProjectRoot, 'app/src/main');
    const files = {
      'RoutineReminder.kt': path.join('java', ...packageName.split('.')),
      'RoutineReminderPackage.kt': path.join('java', ...packageName.split('.')),
      'RoutineReminderShortcuts.kt': path.join('java', ...packageName.split('.')),
      'RoutineReminderHistory.kt': path.join('java', ...packageName.split('.')),
      'routine_reminder_shortcuts.xml': 'res/xml',
      'routine_reminder_strings.xml': 'res/values',
      'ic_routine_reminder.xml': 'res/drawable',
      'routine_reminder_countdown.xml': 'res/layout',
    };
    for (const [name, directory] of Object.entries(files)) {
      const source = await fs.readFile(path.join(__dirname, 'routine-reminder', name), 'utf8');
      const destination = path.join(main, directory);
      await fs.mkdir(destination, { recursive: true });
      await fs.writeFile(path.join(destination, name), source.replaceAll('com.uvelan.ultimateapp', packageName));
    }
    return mod;
  }]);
}

module.exports = createRunOncePlugin(withRoutineReminder, 'with-routine-reminder', '1.0.0');
