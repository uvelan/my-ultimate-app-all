# Direct Google Drive audio sync — Android 1.1.27

Direct sync reads the existing Colab book catalog and downloads only matching
chapter WAVs. ZIP import remains available as a fallback. No server deployment,
Google client secret, or OAuth web callback is needed for this client-only flow.

## One-time Google Cloud setup

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create/select
   a project for this app. Enable **Google Drive API** in APIs & Services → Library.
2. Open **Google Auth Platform**. Complete Branding using your app name, support
   email and developer contact. Under Audience, use External / Testing for personal
   testing and add the Google email that owns your `Myepub` folder as a test user.
3. Under Data Access, add `https://www.googleapis.com/auth/drive.readonly`. The app
   needs read access because Colab creates these files outside the Android app;
   `drive.file` alone cannot discover the existing Colab folder. The app makes no
   Drive write/delete calls. Public distribution of this restricted scope can
   require Google's verification; personal testing should use the test-user list.
4. Under Clients, create an **Android OAuth client** with these exact values:

   Package name: `com.uvelan.ultimateapp`

   Release signing certificate SHA-1:
   `47:BC:4A:5D:5F:A1:7A:55:FE:6A:EC:D1:69:EB:C4:5F:CD:2F:19:80`

5. Install the signed 1.1.25 APK and use Connect / refresh Drive books. Approve the
   Google permission screen using the same Google account used for your Colab Drive.
   Registration/consent changes can take time to propagate. A future Play Store
   build must also register its Play App Signing SHA-1 if different from this key.

The OAuth client ID does not need to be pasted into this app: Google identifies
this Android client by package and signing certificate. Do not put a client secret
in the app. If authorization fails, check package/SHA-1, enabled API, testing email,
and consent scope. Live sign-in cannot succeed until the Cloud registration exists.

References: [Google Android authorization setup](https://developer.android.com/identity/authorization),
[Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

## Daily use

1. Generate chapters in the updated Colab notebook. It saves normal chapter files
   under `My Drive/Myepub/UltimateAudio/<book-name>-<hash>/`. ZIP creation now
   defaults off; set `CREATE_MOBILE_PACKAGE = True` for the ZIP fallback.
2. Open that book in the mobile app's Listen screen → Sync → **Connect / refresh
   Drive books**. Select its Colab output folder once. The app saves the folder
   selection separately for each signed-in app account and mobile book.
3. Tap **Sync chapters directly from Drive**. Current chapter and sync count bound
   the requested mobile range. Each sync refreshes `book.json`, checks actual text,
   and skips compatible audio already saved. EPUB section offsets are not used as
   mobile database IDs. Select Bella in Listen for Bella recordings.
4. Stop disconnects the active download and retains partial bytes for resume.
   Press Sync again to reconnect and resume. The app validates Content-Range,
   expected size, full SHA-256, WAV format, prose, spoken segments and timings before
   publishing an immutable private offline file. Bad checksums discard partial data;
   interrupted transport retains it. Existing verified audio remains playable offline.

This uses Google Play services AuthorizationClient and Google's local grant/token
cache. Access tokens exist only in native memory and are never sent to the app
server, JavaScript, saved preferences, or history logs. Expired/rejected tokens show
reconnect guidance. Disconnect clears the app's local session and selected folder;
it keeps saved audio and does not revoke Google's account-level grant. You can revoke
the grant in your Google account's third-party connections if desired.

The app discovers real folders directly under `My Drive/Myepub/UltimateAudio`.
Duplicate file/folder names are rejected rather than chosen arbitrarily. Drive
shortcuts and alternate root layouts are not supported by the initial discovery
flow. Keep the sync screen open; this version has no autonomous background polling.
Newly generated chapters are discovered on the next Sync or refresh action.

Google account authorization and live Drive downloads require on-device testing
after the Cloud setup. Automated tests and the release build do not substitute for
that external configuration and physical-device check.
