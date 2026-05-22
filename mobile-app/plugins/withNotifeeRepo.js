const { withProjectBuildGradle, withAndroidManifest } = require('@expo/config-plugins');

// Step 1: Add Notifee local Maven repository to build.gradle
const withNotifeeRepo = (config) => {
  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.language === 'groovy') {
      let buildGradle = config.modResults.contents;
      const notifeeRepo = `maven { url "$rootDir/../node_modules/@notifee/react-native/android/libs" }`;

      if (!buildGradle.includes(notifeeRepo)) {
        buildGradle = buildGradle.replace(
          /allprojects\s*\{\s*repositories\s*\{/,
          `allprojects {\n  repositories {\n    ${notifeeRepo}`
        );
        config.modResults.contents = buildGradle;
      }
    }
    return config;
  });
};

// Step 2: Add FOREGROUND_SERVICE permissions + Notifee service declaration to AndroidManifest
const withNotifeeManifest = (config) => {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    // Add permissions
    const requiredPermissions = [
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
      'android.permission.POST_NOTIFICATIONS',
    ];

    if (!manifest['uses-permission']) {
      manifest['uses-permission'] = [];
    }

    requiredPermissions.forEach((perm) => {
      const exists = manifest['uses-permission'].some(
        (p) => p.$?.['android:name'] === perm
      );
      if (!exists) {
        manifest['uses-permission'].push({
          $: { 'android:name': perm },
        });
      }
    });

    // Add Notifee ForegroundService to <application>
    const application = manifest.application?.[0];
    if (application) {
      if (!application.service) {
        application.service = [];
      }
      const serviceExists = application.service.some(
        (s) => s.$?.['android:name'] === 'app.notifee.core.ForegroundService'
      );
      if (!serviceExists) {
        application.service.push({
          $: {
            'android:name': 'app.notifee.core.ForegroundService',
            'android:exported': 'false',
            'android:foregroundServiceType': 'mediaPlayback',
            'tools:replace': 'android:foregroundServiceType',
          },
        });
      }
    }

    return config;
  });
};

// Compose both plugins
module.exports = (config) => {
  config = withNotifeeRepo(config);
  config = withNotifeeManifest(config);
  return config;
};
