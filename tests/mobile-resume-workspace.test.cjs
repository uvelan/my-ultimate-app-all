const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(get) {
    const file = path.join(__dirname, '../mobile-app/src/services/resume-workspace.service.ts');
    const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    const mod = { exports: {} };
    vm.runInNewContext(output, { module: mod, exports: mod.exports, require: name => {
        assert.equal(name, '../lib/api-client');
        return { api: { get } };
    } });
    return mod.exports.resumeWorkspaceService;
}
test('resume list and profile load independently of missing or hanging model settings', async () => {
    const calls = [];
    const service = load(async url => {
        calls.push(url);
        if (url === '/auth/profile') return { data: { id: 'reader', role: 'USER' } };
        if (url === '/resumes') return { data: [{ id: 'resume', title: 'Existing resume' }] };
        throw new Error('Model settings must not be part of the essential request');
    });
    const workspace = await service.getWorkspace();
    assert.equal(workspace.profile.id, 'reader');
    assert.equal(workspace.resumes[0].title, 'Existing resume');
    assert.deepEqual(calls, ['/auth/profile', '/resumes']);
});
test('missing settings empties AI choices and preserves the clear server update diagnostic', async () => {
    const service = load(async () => { throw { response: { status: 404, data: { error: 'The server needs an update for this app feature.' } } }; });
    const result = await service.getModels();
    assert.equal(result.models.length, 0);
    assert.match(result.notice, /AI unavailable/);
    assert.match(result.notice, /server needs an update/);
});
test('only active configured models are advertised and an empty catalog is explicit', async () => {
    const service = load(async () => ({ data: { models: [{ modelId: 'active', isActive: true }, { modelId: 'disabled', isActive: false }] } }));
    const result = await service.getModels();
    assert.equal(result.models.length, 1);
    assert.equal(result.models[0].modelId, 'active');
    assert.equal(result.notice, '');
    const empty = await load(async () => ({ data: {} })).getModels();
    assert.equal(empty.models.length, 0);
    assert.match(empty.notice, /no active models/);
});
test('essential profile or resume errors still surface instead of claiming data loaded', async () => {
    const failure = new Error('Please sign in again');
    const service = load(async () => { throw failure; });
    await assert.rejects(service.getWorkspace(), error => error === failure);
});
