const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const nativeSource = path.join(root, 'mobile-app/plugins/sms-reader/SmsReaderModule.kt');
const materializedSource = path.join(root, 'mobile-app/android/app/src/main/java/com/uvelan/ultimateapp/SmsReaderModule.kt');
const bridgeSource = ts.transpileModule(fs.readFileSync(path.join(root, 'mobile-app/src/lib/sms-bridge.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
vm.runInNewContext(bridgeSource, { module: mod, exports: mod.exports });
const { buildSmsPageArguments } = mod.exports;
const gradle = path.join(process.env.GRADLE_USER_HOME || path.join(os.homedir(), '.gradle'), 'caches/modules-2/files-2.1');
function jar(group, artifact, wanted) {
    const base = path.join(gradle, group, artifact);
    if (!fs.existsSync(base)) return null;
    const versions = fs.readdirSync(base).filter(version => !wanted || version === wanted).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const version of versions) {
        for (const hash of fs.readdirSync(path.join(base, version))) {
            const folder = path.join(base, version, hash);
            if (!fs.statSync(folder).isDirectory()) continue;
            const file = fs.readdirSync(folder).find(name => name.endsWith('.jar'));
            if (file) return { file: path.join(folder, file), version };
        }
    }
    return null;
}
const compiler = jar('org.jetbrains.kotlin', 'kotlin-compiler-embeddable');
let temporary, runtime;
before(() => {
    if (!compiler) return;
    temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'sms-bridge-kotlin-'));
    const stdlib = jar('org.jetbrains.kotlin', 'kotlin-stdlib', compiler.version);
    assert.ok(stdlib, 'matching Kotlin standard library is required');
    const dependencies = [compiler, stdlib, jar('org.jetbrains.kotlin', 'kotlin-reflect', compiler.version), jar('org.jetbrains.kotlin', 'kotlin-script-runtime', compiler.version), jar('org.jetbrains.intellij.deps', 'trove4j'), jar('org.jetbrains.kotlinx', 'kotlinx-coroutines-core-jvm'), jar('org.jetbrains', 'annotations')].filter(Boolean).map(entry => entry.file).join(path.delimiter);
    const fixtures = path.join(__dirname, 'fixtures/sms-bridge');
    const sources = fs.readdirSync(fixtures).filter(name => name.endsWith('.kt')).map(name => path.join(fixtures, name));
    const compiled = spawnSync('java', ['-cp', dependencies, 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler', '-no-stdlib', '-no-reflect', '-jvm-target', '17', '-classpath', dependencies, '-d', temporary, nativeSource, ...sources], { encoding: 'utf8', timeout: 60000 });
    assert.equal(compiled.status, 0, compiled.stderr || compiled.error?.message);
    runtime = [temporary, stdlib.file].join(path.delimiter);
});
after(() => {
    if (!temporary) return;
    assert.equal(path.dirname(path.resolve(temporary)), path.resolve(os.tmpdir()));
    fs.rmSync(temporary, { recursive: true, force: true });
});
function invoke(args, permission) {
    const result = spawnSync('java', ['-cp', runtime, 'com.uvelan.ultimateapp.MainKt', ...args.map(String), ...(permission ? [permission] : [])], { encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
}
const nativeOptions = { skip: !compiler && 'Install Kotlin compiler dependencies (Gradle cache) to execute the actual bridge' };

test('current generated native SMS source matches the tracked plugin exactly', { skip: !fs.existsSync(materializedSource) && 'No generated Android project in this checkout' }, () => {
    assert.equal(fs.readFileSync(materializedSource, 'utf8'), fs.readFileSync(nativeSource, 'utf8'));
});
test('initial UI bridge arguments pass actual Kotlin validation with no cursor', nativeOptions, () => {
    const args = buildSmsPageArguments(0, 1000, null, 2);
    assert.equal(args[2], 0, 'new JS must also work with released bridges that reject negative timestamps');
    assert.equal(args[3], '');
    const response = invoke(args);
    assert.equal(response.error, null);
    assert.deepEqual(response.args, ['0', '1000']);
    assert.deepEqual(response.result.messages.map(item => item._id), ['5', '4']);
    assert.deepEqual(response.result.nextCursor, { date: 1000, id: '4' });
});
test('equal-date keyset pages use descending ID ties without repeats or omissions', nativeOptions, () => {
    const first = invoke(buildSmsPageArguments(998, 1000, null, 2));
    const second = invoke(buildSmsPageArguments(998, 1000, first.result.nextCursor, 2));
    const third = invoke(buildSmsPageArguments(998, 1000, second.result.nextCursor, 2));
    assert.deepEqual([...first.result.messages, ...second.result.messages, ...third.result.messages].map(item => item._id), ['5', '4', '3', '2', '1']);
    assert.equal(third.result.hasMore, false);
    assert.equal(third.result.nextCursor, null);
    // Execute the module's captured query in SQLite, not a reimplementation of its WHERE.
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(':memory:');
    try {
        db.exec('CREATE TABLE sms (_id INTEGER, date INTEGER); INSERT INTO sms VALUES (5,1000),(4,1000),(3,1000),(2,999),(1,998)');
        const rows = db.prepare(`SELECT _id FROM sms WHERE ${second.selection} ORDER BY ${second.sort}`).all(...second.args.map(Number));
        assert.deepEqual(rows.map(row => String(row._id)), ['3', '2', '1']);
    } finally { db.close(); }
});
test('native bridge preserves epoch cursors and legacy zero/empty initial scans', nativeOptions, () => {
    assert.equal(invoke([0, 1000, 0, '', 2]).error, null);
    assert.equal(invoke([0, 1000, -1, '', 2]).error, null, 'previous JS first-page arguments remain compatible');
    const epoch = invoke(buildSmsPageArguments(0, 1000, { date: 0, id: '2' }, 2));
    assert.equal(epoch.error, null);
    assert.deepEqual(epoch.result.messages.map(item => item._id), ['1']);
});
test('real Kotlin validation rejects malformed ranges and real cursors before querying', nativeOptions, () => {
    for (const args of [[1001, 1000, -1, '', 2], [-1, 1000, -1, '', 2], [0, Infinity, -1, '', 2], [0, 1000, -2, '', 2], [0, 1000, -1, '5', 2], [0, 1000, 1000, '', 2], [0, 1000, 1000, 'bad', 2], [0, 1000, 1000, '-5', 2], [0, 1000, 1001, '5', 2], [0, 1000, 999.5, '5', 2], [0, 1000, NaN, '5', 2]]) {
        const response = invoke(args.map(value => value === Infinity ? 'Infinity' : value));
        assert.equal(response.error, 'SMS_INVALID_RANGE', JSON.stringify(args));
        assert.equal(response.selection, '');
    }
});
test('permission denial still rejects before an inbox query', nativeOptions, () => {
    const response = invoke(buildSmsPageArguments(0, 1000, null), 'denied');
    assert.equal(response.error, 'SMS_PERMISSION_DENIED');
    assert.equal(response.selection, '');
});
