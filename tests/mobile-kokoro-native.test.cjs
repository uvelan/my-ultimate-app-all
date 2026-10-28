const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const cache = path.join(process.env.GRADLE_USER_HOME || path.join(os.homedir(), '.gradle'), 'caches/modules-2/files-2.1');
function jar(group, name, version) {
  const directory = path.join(cache, group, name, version);
  if (!fs.existsSync(directory)) return null;
  for (const hash of fs.readdirSync(directory)) {
    const folder = path.join(directory, hash);
    if (!fs.statSync(folder).isDirectory()) continue;
    const entry = fs.readdirSync(folder).find(name => name.endsWith('.jar'));
    if (entry) return path.join(folder, entry);
  }
  return null;
}
const compiler = jar('org.jetbrains.kotlin', 'kotlin-compiler-embeddable', '2.1.20');
const compress = jar('org.apache.commons', 'commons-compress', '1.27.1');
const nativeOptions = { skip: !(compiler && compress) && 'Run the Android build to populate native dependencies' };
const java = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin/java') : 'java';
let temporary, classpath;
before(() => {
  if (!compiler || !compress) return;
  temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kokoro-kotlin-'));
  const dependencies = [compiler, compress,
    jar('org.jetbrains.kotlin', 'kotlin-stdlib', '2.1.20'),
    jar('org.jetbrains.kotlin', 'kotlin-script-runtime', '2.1.20'),
    jar('org.jetbrains', 'annotations', '13.0'),
    jar('commons-io', 'commons-io', '2.16.1'), jar('commons-codec', 'commons-codec', '1.17.1'),
    jar('org.apache.commons', 'commons-lang3', '3.16.0')];
  // Compiler dependencies are already installed by the Android Gradle plugin.
  for (const [group, name] of [['org.jetbrains.kotlin', 'kotlin-reflect'], ['org.jetbrains.intellij.deps', 'trove4j'], ['org.jetbrains.kotlinx', 'kotlinx-coroutines-core-jvm']]) {
    const base = path.join(cache, group, name);
    if (fs.existsSync(base)) {
      const version = fs.readdirSync(base).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0];
      dependencies.push(jar(group, name, version));
    }
  }
  classpath = [temporary, ...dependencies.filter(Boolean)].join(path.delimiter);
  const result = spawnSync(java, ['-cp', classpath, 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler', '-no-stdlib', '-no-reflect',
    '-jvm-target', '17', '-classpath', classpath, '-d', temporary,
    path.join(root, 'mobile-app/plugins/kokoro/KokoroGenerationGate.kt'), path.join(root, 'mobile-app/plugins/kokoro/KokoroFiles.kt'), path.join(root, 'mobile-app/plugins/kokoro/KokoroCallback.kt'),
    path.join(__dirname, 'fixtures/kokoro/Main.kt')], { encoding: 'utf8', timeout: 60000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
});
after(() => {
  if (temporary) { assert.equal(path.dirname(temporary), path.resolve(os.tmpdir())); fs.rmSync(temporary, { recursive: true, force: true }); }
});
function invoke(mode, ...args) {
  const workspace = fs.mkdtempSync(path.join(temporary, 'case-'));
  const result = spawnSync(java, ['-cp', classpath, 'com.uvelan.ultimateapp.MainKt', workspace, mode, ...args], { encoding: 'utf8', timeout: 120000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return result.stdout.trim();
}
test('Kotlin callback exposes the exact typed and boxed method required by Sherpa JNI', nativeOptions,
  () => assert.match(invoke('callback'), /signature and cancellation verified/));
test('native PCM produces a valid mono WAV with clipping, sample rate and exact frame count', nativeOptions, () => {
  const bytes = fs.readFileSync(invoke('pcm'));
  assert.equal(bytes.subarray(0, 4).toString(), 'RIFF'); assert.equal(bytes.subarray(8, 16).toString(), 'WAVEfmt ');
  assert.equal(bytes.readUInt32LE(4), bytes.length - 8); assert.equal(bytes.readUInt16LE(20), 1);
  assert.equal(bytes.readUInt16LE(22), 1); assert.equal(bytes.readUInt32LE(24), 24000);
  assert.equal(bytes.readUInt16LE(34), 16); assert.equal(bytes.readUInt32LE(40), 10);
  assert.deepEqual(Array.from({ length: 5 }, (_, index) => bytes.readInt16LE(44 + index * 2)), [-32767, -16383, 0, 16383, 32767]);
});
test('native model extraction rejects traversal, symlinks, incomplete archives and cancellation', nativeOptions, () => {
  assert.match(invoke('extract', 'traversal'), /Unsafe/);
  assert.match(invoke('extract', 'symlink'), /Invalid model archive/);
  assert.match(invoke('extract', 'incomplete'), /incomplete/);
  assert.match(invoke('extract', 'cancel'), /cancelled/);
});
const archive = path.join(root, 'mobile-app/dist/kokoro/model-v1_0.tar.bz2');
test('native extractor installs the actual verified Kokoro package and rejects corrupted model files', {
  skip: nativeOptions.skip || (!fs.existsSync(archive) && 'Download the official model to run this optional integration check'),
}, () => assert.match(invoke('real', archive), /verified, extracted, corruption rejected/));

test('native generation gate sleeps while paused, hot or buffered and wakes on resume/cancel/checkpoint', nativeOptions, () => assert.match(invoke('gate'), /gate verified/));

test('voice continuation preserves exact prefix PCM samples and replaces only subsequent samples', nativeOptions, () => {
  const bytes = fs.readFileSync(invoke('prefix'));
  assert.equal(bytes.length, 52); assert.equal(bytes.readUInt32LE(40), 8);
  assert.deepEqual(Array.from({ length: 4 }, (_, index) => bytes.readInt16LE(44 + index * 2)), [3276, 6553, -16383, -19660]);
});
