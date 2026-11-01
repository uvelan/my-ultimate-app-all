# Drive audio import — Android 1.1.24

Install the native APK. Run the updated Colab notebook for the desired range; it
creates a ZIP under the book's `exports` folder in Drive. Existing verified audio
is reused when rerunning the same range.

Open the same book in Listen, open Sync, and choose **Choose audio ZIP from Drive**.
Choose Google Drive in Android's document picker and select the exported ZIP.
The current chapter and sync count bound the mobile chapters to consider. Text
matching is mandatory; EPUB spine indexes and printed chapter numbers can differ.
Select Bella in Listen to use Bella recordings. Imported audio uses the normal
Kokoro offline cache, works without PC pairing, and follows existing playback and
ten-chapter retention behavior. Grammar-corrected content uses a separate identity.

Keep the import screen open. Stop completes the current file read/chapter then
stops. Already imported chapters remain; re-selecting the package skips verified
compatible chapters. Each package is capped at 4 GB, and requires temporary cache
space plus room for imported audio. Colab caps export at 3.8 GB. Use small ranges.

The file picker grants access to the selected package only; no Google OAuth client
configuration or public sharing is needed. The importer does not retain a Drive
account connection or poll for future chapters. Google Drive must be installed,
signed in and exposed in the Android document provider. A downloaded local ZIP
also works through the same picker.

The native importer accepts only versioned `ultimate-drive-audio` ZIP packages.
It validates fixed chapter paths, metadata limits, identity, voice, actual chapter
prose, spoken passages, contiguous finite timings, WAV header/duration, byte count,
and SHA-256 before assigning account-scoped mobile IDs and publishing an immutable
offline file. Portable IDs never become mobile database IDs. Files are read from
fixed ZIP entries without extracting arbitrary paths. Duplicate ZIP entries and
oversized metadata/audio are rejected. Private temporary ZIPs are removed at close;
abandoned imports are removed when opening the next package after a process kill.

Validation: TypeScript checks, JavaScript chapter-matching/lifecycle tests, executable
Kotlin byte-integrity/WAV corruption tests, Python ZIP range/layout tests, and an
ARM64 release build. Physical Google Drive provider selection and on-device
playback remain to be tested on a connected Android device.
