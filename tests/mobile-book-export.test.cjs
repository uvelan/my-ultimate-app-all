const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, deps = {}) {
 const module = { exports: {} };
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('mobile-app/' + file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
  { module, exports: module.exports, Date, Uint8Array, ArrayBuffer, require: name => deps[name] });
 return module.exports;
}
const helper = load('src/lib/book-export-file.ts');
const audio = load('src/lib/listen-audio.ts');
function harness(options = {}) {
 const calls = [], data = new Uint8Array([80,75,3,4,1,2,3]); let written = '';
 const service = load('src/services/book-export.service.ts', {
  './book.service': { bookService: { downloadBook: async (...args) => { calls.push(['download', ...args]);
   if (options.apiError) throw { response: { data: new TextEncoder().encode(JSON.stringify({ error: 'Chapter 7: empty text' })).buffer } };
   return { data: data.buffer, headers: { 'x-book-export-validated': options.unvalidated ? '0' : '1', 'x-book-export-bytes': data.length, 'x-book-chapter-count': 1, 'content-type': 'application/epub+zip', 'x-book-export-sha256': 'a'.repeat(64) } };
  } } },
  '../lib/listen-audio': audio, '../lib/book-export-file': helper,
  'react-native': { Platform: { OS: 'android' } },
  'expo-sharing': { isAvailableAsync: async () => true, shareAsync: async (...args) => calls.push(['share', ...args]) },
  'expo-file-system/legacy': { cacheDirectory: 'file:///cache/', EncodingType: { Base64: 'base64' },
   StorageAccessFramework: { requestDirectoryPermissionsAsync: async () => ({ granted: !options.cancel, directoryUri: 'content://folder' }), createFileAsync: async (...args) => { calls.push(['create', ...args]); return 'content://folder/book.epub'; } },
   makeDirectoryAsync: async () => {}, writeAsStringAsync: async (uri, value) => { calls.push(['write', uri]); written = value; },
   readAsStringAsync: async () => options.corrupt ? 'bad data' : written, deleteAsync: async uri => calls.push(['delete', uri]),
  },
 });
 return { calls, run: destination => service.exportLibraryBook({ id: 'book', title: 'Novel' }, 'epub', destination) };
}
test('Android export saves to the selected folder and verifies bytes before reporting saved', async () => {
 const h = harness(), result = await h.run('save');
 assert.equal(result.status, 'saved'); assert.equal(result.uri, 'content://folder/book.epub');
 assert.equal(h.calls.find(c => c[0] === 'create')[2], 'Novel.epub');
 assert.equal(h.calls.filter(c => c[0] === 'share').length, 0);
});
test('cancelled folder selection does not download or report success', async () => {
 const h = harness({ cancel: true }); assert.equal((await h.run('save')).status, 'cancelled'); assert.equal(h.calls.length, 0);
});
test('failed verification removes the incomplete file instead of reporting saved', async () => {
 const h = harness({ corrupt: true }); await assert.rejects(h.run('save'), /verification failed/);
 assert.ok(h.calls.some(c => c[0] === 'delete'));
});
test('unvalidated server files and validation errors never create a destination file', async () => {
 for (const options of [{ unvalidated: true }, { apiError: true }]) {
  const h = harness(options); await assert.rejects(h.run('save'), options.apiError ? /Chapter 7/ : /not validated/);
  assert.ok(!h.calls.some(c => c[0] === 'create'));
 }
});
test('closing the share sheet returns shared, never a false saved status', async () => {
 const h = harness(); assert.equal((await h.run('share')).status, 'shared'); assert.equal(h.calls.find(c => c[0] === 'share')[2].mimeType, 'application/epub+zip');
});
