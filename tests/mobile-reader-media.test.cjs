const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const nativeSource = path.join(root, 'mobile-app/plugins/reader-media/ReaderMediaSessionModule.kt');
const materializedSource = path.join(root, 'mobile-app/android/app/src/main/java/com/uvelan/ultimateapp/ReaderMediaSessionModule.kt');
const gradle = path.join(process.env.GRADLE_USER_HOME || path.join(os.homedir(), '.gradle'), 'caches/modules-2/files-2.1');
function jar(group, artifact, wanted) {
    const base = path.join(gradle, group, artifact);
    if (!fs.existsSync(base))
        return null;
    const versions = fs.readdirSync(base).filter(version => !wanted || version === wanted).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const version of versions) {
        for (const hash of fs.readdirSync(path.join(base, version))) {
            const folder = path.join(base, version, hash);
            if (!fs.statSync(folder).isDirectory())
                continue;
            const file = fs.readdirSync(folder).find(name => name.endsWith('.jar'));
            if (file)
                return { file: path.join(folder, file), version };
        }
    }
    return null;
}
const compiler = jar('org.jetbrains.kotlin', 'kotlin-compiler-embeddable');
let temporary, runtime;
before(() => {
    if (!compiler)
        return;
    temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'reader-media-kotlin-'));
    const stdlib = jar('org.jetbrains.kotlin', 'kotlin-stdlib', compiler.version);
    assert.ok(stdlib, 'matching Kotlin standard library is required');
    const dependencies = [compiler, stdlib, jar('org.jetbrains.kotlin', 'kotlin-reflect', compiler.version), jar('org.jetbrains.kotlin', 'kotlin-script-runtime', compiler.version), jar('org.jetbrains.intellij.deps', 'trove4j'), jar('org.jetbrains.kotlinx', 'kotlinx-coroutines-core-jvm'), jar('org.jetbrains', 'annotations')].filter(Boolean).map(entry => entry.file).join(path.delimiter);
    const fixtures = path.join(__dirname, 'fixtures/reader-media');
    const sources = fs.readdirSync(fixtures).filter(name => name.endsWith('.kt')).map(name => path.join(fixtures, name));
    const compiled = spawnSync('java', ['-cp', dependencies, 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler', '-no-stdlib', '-no-reflect', '-jvm-target', '17', '-classpath', dependencies, '-d', temporary, nativeSource, ...sources], { encoding: 'utf8', timeout: 60000 });
    assert.equal(compiled.status, 0, compiled.stderr || compiled.error?.message);
    runtime = [temporary, stdlib.file].join(path.delimiter);
});
after(() => {
    if (!temporary)
        return;
    assert.equal(path.dirname(path.resolve(temporary)), path.resolve(os.tmpdir()));
    fs.rmSync(temporary, { recursive: true, force: true });
});
function invoke(args, permission) {
    const result = spawnSync('java', ['-cp', runtime, 'com.uvelan.ultimateapp.MainKt', ...args.map(String), ...(permission ? [permission] : [])], { encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
}
const nativeOptions = { skip: !compiler && 'Install Kotlin compiler dependencies (Gradle cache) to execute the actual bridge' };
test('generated media module matches tracked plugin source', () => { assert.equal(fs.readFileSync(nativeSource, 'utf8'), fs.readFileSync(materializedSource, 'utf8')); });
test('native media session exposes metadata, transport actions and bounded wake-lock lifecycle', nativeOptions, () => {
    const states = invoke(['playing', 'playingAgain', 'paused', 'playing', 'stop']);
    assert.equal(states[0].held, true);
    assert.equal(states[0].refCounted, false);
    assert.equal(states[0].speed, 1.25);
    assert.equal(states[0].actions, 63);
    assert.ok(Object.values(states[0].metadata).includes('Actual Book'));
    assert.equal(states[1].sessions, 1);
    assert.equal(states[1].acquisitions, 1);
    assert.equal(states[2].held, false);
    assert.equal(states[2].state, 2);
    assert.equal(states[3].acquisitions, 2);
    assert.equal(states[4].held, false);
    assert.equal(states[4].released, true);
});
test('native hardware toggle ignores key-up and repeat, and forwards all transport controls', nativeOptions, () => {
    const states = invoke(['playing', 'toggleDown', 'toggleUp', 'toggleRepeat', 'next', 'prev', 'pause', 'play', 'stop']);
    assert.deepEqual(states.at(-1).events.map(e => e.data.action), ['toggle', 'next', 'prev', 'pause', 'play', 'stop']);
});
test('released media callbacks cannot control a replacement session and invalidate releases wake lock', nativeOptions, () => {
    const states = invoke(['playing', 'saveCallback', 'deactivate', 'playing', 'oldCallback', 'invalidate', 'playing']);
    assert.equal(states[4].events.length, 0);
    assert.equal(states[5].held, false);
    assert.equal(states[6].active, false);
    assert.equal(states[6].sessions, 2);
});
