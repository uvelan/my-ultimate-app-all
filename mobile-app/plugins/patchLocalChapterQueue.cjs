// Small, guarded Expo Audio extension: retain its MediaSession while queuing local chapters natively.
const fs = require('node:fs');
const path = require('node:path');
function patchLocalChapterQueue(projectRoot) {
 const dir = path.join(projectRoot, 'node_modules/expo-audio/android/src/main/java/expo/modules/audio');
 const patch = (name, marker, anchor, replacement) => {
  const file = path.join(dir, name); let text = fs.readFileSync(file, 'utf8');
  if (text.includes(marker)) return;
  if (!text.includes(anchor)) throw Error('Expo Audio changed: cannot apply local chapter queue extension to ' + name);
  fs.writeFileSync(file, text.replace(anchor, replacement));
 };
 fs.copyFileSync(path.join(__dirname, 'kokoro/LocalChapterQueue.kt'), path.join(dir, 'LocalChapterQueue.kt'));
 patch('AudioPlayer.kt', 'setWakeMode(androidx.media3.common.C.WAKE_MODE_LOCAL)', '.setLooper(context.mainLooper)', '.setLooper(context.mainLooper)\n    .setWakeMode(androidx.media3.common.C.WAKE_MODE_LOCAL)');
 patch('AudioPlayer.kt', 'val localChapterQueue', 'override val id = UUID.randomUUID().toString()',
  'override val id = UUID.randomUUID().toString()\n  val localChapterQueue = LocalChapterQueue(context, ref) { updateLockScreenMetadata(it) }');
 patch('AudioPlayer.kt', 'localChapterQueue.transition()', 'override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {',
  'override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {\n        localChapterQueue.transition()');
 patch('AudioPlayer.kt', ') + localChapterQueue.status()', '"isBuffering" to isBuffering\n    )',
  '"isBuffering" to isBuffering\n    ) + localChapterQueue.status()');
 patch('AudioPlayer.kt', 'localChapterQueue.release()', 'serviceConnection.release()', 'localChapterQueue.release()\n    serviceConnection.release()');
 patch('AudioModule.kt', 'Function("setLocalChapterQueue")', 'Function("replace") { player: AudioPlayer, source: AudioSource ->',
  'Function("setLocalChapterQueue") { player: AudioPlayer, config: String ->\n        runOnMain { player.localChapterQueue.configure(config) }\n      }\n\n      Function("replace") { player: AudioPlayer, source: AudioSource ->');
 patch('AudioModule.kt', 'player.localChapterQueue.clear()', 'val wasPlaying = player.ref.isPlaying',
  'player.localChapterQueue.clear()\n            val wasPlaying = player.ref.isPlaying');
}
if (require.main === module) patchLocalChapterQueue(path.resolve(__dirname, '..'));
module.exports = { patchLocalChapterQueue };
