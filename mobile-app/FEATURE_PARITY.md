# Native Android updates

Version 1.1.1 (Android version code 5) adds native screens for transactions,
categories, budgets, recurring transactions, reports, tasks, interview tools,
resume editing and PDF sharing, settings, and administrator data sync. These use
the same authenticated backend data as web. Native resume templates have their
own print layouts; they are not pixel-identical copies of the web editor.

## SMS sync

- Choose Day, Week, Month, or a custom Range before scanning. Choose a past date
  to scan that day, its Monday-to-Sunday week, or its calendar month. Current
  periods end today.
- Grant SMS permission when starting a scan. Reading and parsing happen on the
  device in bounded pages. Large ranges can continue with Scan more.
- Review expense and income suggestions, edit their amount, booking date, notes,
  and category, then save. Raw SMS bodies stay on the device.
- Imports use an opaque fingerprint and an atomic database receipt to prevent
  duplicate transactions, including concurrent imports. Deleting an imported
  transaction does not cause a later scan to silently recreate it.
- Finance categories must belong to the signed-in user, be active, and match the
  transaction type. Manage both income and expense categories from Finance.

The tracked Expo plugin in `plugins/withSmsReader.js` generates the Kotlin bridge
from `plugins/sms-reader`. Changes survive prebuild; the generated `android`
folder is intentionally ignored. Installing the updated native build is required
for paged SMS scanning. An Expo Go session cannot provide this custom bridge.

## Books and sessions

The Android listener supports Gemini, Xiaomi MiMo, and Google, persists selected
settings, handles provider fallback, and prepares upcoming chapters through the
shared server cache. Device files have a five-chapter/100 MB bound. Both listeners highlight and follow the spoken passage using playback position.
New narration keeps measured provider-chunk timings alongside the exact audio
fingerprint; sentence positions within a chunk and legacy cached narration use
estimated timing. Manual scrolling pauses following until Follow audio is chosen.
Reader speech
announces chapter titles and supports installed voices. Corrupt offline chapter
files recover through the network, and stale chapter requests cannot replace a
new selection. Session refresh coalesces concurrent requests and guards against
late refresh results restoring a logged-out account.

## Build and deployment

Deploy the accompanying web API changes before using new native features against
a production API URL. `prisma db push` creates the `SmsImport` collection and its
unique user/fingerprint index; this database update has been applied to the
configured database during implementation.

Before distributing an APK, run `node scripts/check-mobile-backend.cjs` from the
repository root. It checks the configured public API for the Android route set
without signing in or reading account data. A 404 means the matching server has
not been deployed. To check a local server, pass `http://localhost:3000/api`.

From the repository root:

```powershell
npm.cmd run build
node_modules\.bin\tsc.cmd --noEmit -p mobile-app/tsconfig.json
$checks = Get-ChildItem tests,scripts/tests -Filter '*.test.cjs' -File
node --test $checks.FullName
```

From `mobile-app`, regenerate native sources with `npx.cmd expo prebuild
--platform android --no-install`, then run `android\gradlew.bat assembleRelease`
from the `android` folder with the existing local signing configuration. Avoid
`prebuild --clean` unless local signing files have been backed up.

Automated checks cover parser behavior, date presets, deduplication and races,
API ownership and validation, session refresh, book cache recovery, resume HTML,
and interview flows. Actual SMS inbox behavior, microphone use, PDF sharing, and
locked-screen chapter transitions still require verification on a physical
Android device.
