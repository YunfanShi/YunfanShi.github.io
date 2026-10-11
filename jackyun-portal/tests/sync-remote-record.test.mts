import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/sync/remote-record.ts', import.meta.url), 'utf8');
const exports: any = {};
runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
  exports, require: () => ({ storageValueToString: (value: unknown) => typeof value === 'string' ? value : JSON.stringify(value) }),
});
const isCurrent = exports.remoteRecordIsCurrent;
const value = { notes: '学习'.repeat(500000) };
const base = { key: 'jackyun_schedule_control_v1', revision: 10, contentHash: 'same', value, deleted: false };
const remote = { ...base, value: null, large: true };

test('unchanged large Schedule is downloaded once across repeated syncs', () => {
  let transfers = 0;
  let metadata;
  let current = null;
  for (let tick = 0; tick < 100; tick++) {
    if (!isCurrent(remote, metadata, current)) {
      transfers++;
      metadata = base;
      current = JSON.stringify(value);
    }
  }
  assert.equal(transfers, 1);
});
test('new revisions and missing or edited local data are not skipped', () => {
  assert.equal(isCurrent({ ...remote, revision: 11 }, base, JSON.stringify(value)), false);
  assert.equal(isCurrent({ ...remote, contentHash: 'new' }, base, JSON.stringify(value)), false);
  assert.equal(isCurrent(remote, base, null), false);
  assert.equal(isCurrent(remote, base, '{}'), false);
});
test('deleted and string records are compared without converting their representation', () => {
  const deleted = { ...base, deleted: true };
  assert.equal(isCurrent(deleted, deleted, null), true);
  assert.equal(isCurrent(deleted, deleted, '{}'), false);
  const text = { ...base, value: 'plain text' };
  assert.equal(isCurrent(text, text, 'plain text'), true);
});

test('repeated cloud pulls of the same revision do not download or notify Schedule again', async () => {
  const component = readFileSync(new URL('../src/components/layout/local-workspace-sync.tsx', import.meta.url), 'utf8');
  const pullSource = component.slice(component.indexOf('    async function pull()'), component.indexOf('    async function sync('));
  let metadata: any[] = [];
  let current: string | null = null;
  let downloads = 0;
  let notifications = 0;
  const context = {
    remoteRecordIsCurrent: isCurrent,
    getSetting: async () => null,
    getOutbox: async () => [],
    getMetadata: async () => metadata,
    syncFetch: async () => ({ ok: true, json: async () => ({ records: [{ ...remote }], cursor: 'cursor' }) }),
    cancelled: false, signingOut: false, scheduleChecked: false,
    localStorage: { getItem: () => current, setItem: (_key: string, val: string) => { current = val; }, removeItem: () => { current = null; } },
    SCHEDULE_STORAGE_KEY: base.key,
    scheduleHasContent: (val: unknown) => Boolean(val),
    parseStorageValue: (val: string | undefined) => val ? JSON.parse(val) : null,
    loadLargeValue: async () => { downloads++; return value; },
    saveMetadata: async (record: any) => { metadata = [{ ...record }]; },
    storageValueToString: JSON.stringify,
    setSetting: async () => {},
    queueChanges: async () => { context.lastSnapshot = { [base.key]: current! }; },
    lastSnapshot: {} as Record<string, string>,
    window: { dispatchEvent: () => { notifications++; } },
    CustomEvent: class {}, CLOUD_STATE_APPLIED_EVENT: 'cloud', console,
  };
  const pull = runInNewContext(ts.transpileModule(pullSource + '\npull', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  for (let tick = 0; tick < 100; tick++) await pull();
  assert.equal(downloads, 1);
  assert.equal(notifications, 1);
  assert.deepEqual(JSON.parse(current!), value);
});
