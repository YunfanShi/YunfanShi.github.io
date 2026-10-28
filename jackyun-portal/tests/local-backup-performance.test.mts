/* eslint-disable @typescript-eslint/no-explicit-any -- VM fixtures expose dynamically evaluated browser globals. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { IDBFactory, IDBKeyRange, IDBIndex, IDBObjectStore } from 'fake-indexeddb';
import { listLocalBackups, pruneLocalBackups, saveLocalBackup } from '../src/lib/backup/local.ts';
import { applyLocalPageImport, parseLocalPageBackup } from '../src/lib/backup/local-import.ts';

function installDatabase() {
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: new IDBFactory() });
  Object.defineProperty(globalThis, 'IDBKeyRange', { configurable: true, value: IDBKeyRange });
}

function countMaterializedVersions() {
  let count = 0;
  const getAll = IDBIndex.prototype.getAll;
  const storeGetAll = IDBObjectStore.prototype.getAll;
  const openCursor = IDBIndex.prototype.openCursor;
  const trackAll = (request: IDBRequest) => { request.addEventListener('success', () => { count += request.result.length; }); return request; };
  IDBIndex.prototype.getAll = function (...args) { return trackAll(getAll.apply(this, args)); };
  IDBObjectStore.prototype.getAll = function (...args) { return trackAll(storeGetAll.apply(this, args)); };
  IDBIndex.prototype.openCursor = function (...args) {
    const request = openCursor.apply(this, args);
    request.addEventListener('success', () => { if (request.result) count++; });
    return request;
  };
  return { get count() { return count; }, restore() {
    IDBIndex.prototype.getAll = getAll; IDBObjectStore.prototype.getAll = storeGetAll; IDBIndex.prototype.openCursor = openCursor;
  } };
}

test('saving a large page reads only its latest snapshot and preserves the newest ten versions', async () => {
  installDatabase();
  const large = '课表笔记'.repeat(100_000);
  for (let i = 0; i < 10; i++) await saveLocalBackup('alice', 'schedule', { large, revision: String(i) });
  const reads = countMaterializedVersions();
  try {
    await saveLocalBackup('alice', 'schedule', { large, revision: '10' });
    assert.equal(reads.count, 1, 'Do not deserialize ten historical payloads to retain ten IDs');
  } finally { reads.restore(); }
  const rows = await listLocalBackups('alice', 'schedule');
  assert.equal(rows.length, 10);
  assert.equal(rows[0].values.revision, '10');
  assert.equal(rows.at(-1)!.values.revision, '1');
});

test('unchanged snapshots with a different property order do not create duplicate backups', async () => {
  installDatabase();
  await saveLocalBackup('alice', 'schedule', { a: 'same', b: 'value' });
  await saveLocalBackup('alice', 'schedule', { b: 'value', a: 'same' });
  assert.equal((await listLocalBackups('alice', 'schedule')).length, 1);
  await saveLocalBackup('alice', 'schedule', { a: 'changed', b: 'value' });
  assert.equal((await listLocalBackups('alice', 'schedule')).length, 2);
});

test('retention scans keys without reading snapshots and never prunes another account', async () => {
  installDatabase();
  await saveLocalBackup('alice', 'schedule', { revision: '0' });
  // Seed an older installation with excess retained versions in two pages.
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('jackyun-page-backups-v1');
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('versions', 'readwrite'), store = tx.objectStore('versions');
      for (const [userId, page, count] of [['alice', 'schedule', 14], ['alice', 'quiz', 12], ['bob', 'schedule', 14]] as const) {
        for (let i = 0; i < count; i++) store.add({ userId, page, values: { revision: String(i + 1) }, createdAt: '2026-10-11T00:00:00Z' });
      }
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
    request.onerror = () => reject(request.error);
  });
  const reads = countMaterializedVersions();
  try { await pruneLocalBackups('alice'); assert.equal(reads.count, 0); } finally { reads.restore(); }
  assert.equal((await listLocalBackups('alice', 'schedule')).length, 10);
  assert.equal((await listLocalBackups('alice', 'quiz')).length, 10);
  assert.equal((await listLocalBackups('bob', 'schedule')).length, 14);
});

test('a failed insertion aborts pruning and leaves all previous versions intact', async () => {
  installDatabase();
  for (let i = 0; i < 10; i++) await saveLocalBackup('alice', 'schedule', { revision: String(i) });
  const original = IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add = function (...args) {
    this.transaction.abort();
    return original.apply(this, args);
  };
  try { await assert.rejects(saveLocalBackup('alice', 'schedule', { revision: 'failed' })); }
  finally { IDBObjectStore.prototype.add = original; }
  const rows = await listLocalBackups('alice', 'schedule');
  assert.equal(rows.length, 10);
  assert.deepEqual(rows.map(row => row.values.revision), ['9', '8', '7', '6', '5', '4', '3', '2', '1', '0']);
});

test('large local Schedule import saves a durable recovery point before writing and waits for IndexedDB flush', async () => {
  installDatabase();
  const key = 'jackyun_schedule_control_v1';
  const previous = JSON.stringify({ cues: [{ id: 'old-cue' }], notes: 'old'.repeat(20) });
  const importedSchedule = JSON.stringify({ cues: [{ id: 'new-cue' }], notes: 'large'.repeat(350_000) });
  const json = JSON.stringify({ version: 1, page: 'schedule', values: { [key]: importedSchedule } });
  assert.ok(Buffer.byteLength(json) > 1_000_000);
  const values = parseLocalPageBackup(json, 'schedule');
  const current = new Map([[key, previous], ['jackyun_schedule_old_v1', '{"cues":[]}']]);
  const events: string[] = [];
  let persisted = false;
  let queuedFields: string[] = [];

  const committedKeys = await applyLocalPageImport({
    page: 'schedule', owner: 'alice', ...values,
    storage: {
      keys: () => [...current.keys()],
      getItem: item => current.get(item) ?? null,
      setItem: (item, value) => { assert.ok(persisted, 'the recovery point must commit before the first local edit'); events.push(`set:${item}`); current.set(item, value); },
      removeItem: item => { assert.ok(persisted, 'the recovery point must commit before the first local edit'); events.push(`remove:${item}`); current.delete(item); },
      flush: async () => { events.push('flush:start'); await new Promise(resolve => setImmediate(resolve)); persisted = true; events.push('flush:complete'); },
    },
    saveRecoveryPoint: async (owner, page, snapshot) => {
      events.push('recovery:start');
      await saveLocalBackup(owner, page, snapshot);
      const backups = await listLocalBackups(owner, page);
      assert.equal(backups[0]?.values[key], previous, 'recovery point must be readable from IndexedDB before mutation');
      persisted = true;
      events.push('recovery:complete');
    },
    queueV5Targets: async targets => { assert.ok(events.includes('flush:complete'), 'v5 restore targets are queued only after local IndexedDB flush'); queuedFields=targets.map(target=>target.field); events.push('v5-targets-queued'); },
  });

  assert.deepEqual(committedKeys, [key]);
  assert.equal(current.get(key), importedSchedule);
  assert.equal(current.get('jackyun_schedule_old_v1'), '{"cues":[]}', 'keys absent from an older import are preserved');
  assert.ok(events.indexOf('recovery:complete') < events.indexOf(`set:${key}`));
  assert.ok(events.indexOf('flush:complete') < events.indexOf('v5-targets-queued'));
  assert.ok(queuedFields.includes('cues'), 'Schedule imports target all required v5 Schedule resources');
});

test('local import failure before recovery or during IndexedDB flush never returns success', async () => {
  installDatabase();
  const key = 'jackyun_schedule_control_v1', values = { [key]: JSON.stringify({ cues: [{ id: 'cue' }] }) };
  const current = new Map([[key, JSON.stringify({ cues: [{ id: 'old' }] })]]);
  const makeStorage = (flush: () => Promise<void>) => ({
    keys: () => [...current.keys()], getItem: (item: string) => current.get(item) ?? null,
    setItem: (item: string, value: string) => current.set(item, value), removeItem: (item: string) => current.delete(item), flush,
  });
  await assert.rejects(applyLocalPageImport({ page: 'schedule', owner: 'alice', values, storage: makeStorage(async () => {}),
    saveRecoveryPoint: async () => { throw new Error('recovery IndexedDB failed'); } }), /recovery IndexedDB failed/);
  assert.equal(current.get(key), JSON.stringify({ cues: [{ id: 'old' }] }), 'failed recovery must stop before mutating local data');

  let returned = false;
  await assert.rejects((async () => {
    const result = await applyLocalPageImport({ page: 'schedule', owner: 'alice', values, storage: makeStorage(async () => { throw new Error('workspace IndexedDB failed'); }),
      saveRecoveryPoint: async (owner, page, snapshot) => saveLocalBackup(owner, page, snapshot) });
    returned = true;
    return result;
  })(), /workspace IndexedDB failed/);
  assert.equal(returned, false, 'the import cannot report success before the IndexedDB-backed queue flush');
  assert.ok((await listLocalBackups('alice', 'schedule')).length > 0, 'recovery point remains available after a later failure');
});

test('local JSON import rejects empty and malformed Schedule data without applying it', () => {
  assert.throws(() => parseLocalPageBackup('', 'schedule'), /JSON 文件格式错误/);
  assert.throws(() => parseLocalPageBackup(JSON.stringify({ version: 1, page: 'schedule', values: { jackyun_schedule_control_v1: '{' } }), 'schedule'), /Schedule JSON 格式错误/);
  assert.throws(() => parseLocalPageBackup(JSON.stringify({ version: 1, page: 'schedule', values: { jackyun_schedule_control_v1: '{"cues":[]}' } }), 'schedule'), /拒绝导入空 Schedule/);
});

test('visible idle scans fall to 240 per hour; hidden scans pause and exits still save immediately', async () => {
  const source = readFileSync(new URL('../src/components/layout/local-workspace-sync.tsx', import.meta.url), 'utf8');
  const callbacks: { task: () => void; interval: number }[] = [], effects: (() => () => void)[] = [];
  const storage = new Map<string, string>([['study', 'old']]);
  let reads = 0, sleeping = false;
  const backups: string[] = [];
  const win = Object.assign(new EventTarget(), { setInterval(task: () => void, interval: number) { callbacks.push({ task, interval }); return callbacks.length; }, clearInterval: () => {} });
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const localStorage = {get length(){return storage.size;},key:(i:number)=>[...storage.keys()][i]??null,getItem:(key:string)=>{reads++;return storage.get(key)??null;}};
  const exports: Record<string, any> = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX } }).outputText, {
    exports, require: (name: string) => {
      if(name==='react/jsx-runtime')return {jsx:()=>null,jsxs:()=>null};
      if(name==='next/navigation')return {usePathname:()=>'/schedule'};
      if(name.endsWith('/sync/repository'))return {workspaceStorage:localStorage};
      if (name === 'react') return { useEffect: (effect: () => () => void) => effects.push(effect), useRef:(current:unknown)=>({current}) };
      if (name.endsWith('/local-workspace')) return { isSyncableStorageKey: (key: string) => key === 'study' };
      if (name.endsWith('/backup/pages')) return { isBackupableLegacyKey: (key: string) => key === 'study', legacyBackupPage: () => 'study' };
      if (name.endsWith('/backup/local')) return { localPageValues: (value: unknown) => value, saveLocalBackup: async (_user: unknown, _page: unknown, value: { study: string }) => { backups.push(value.study); } };
      if (name.endsWith('/backup/cadence')) return { backupIsDue: () => false, recordBackupChange: () => ({ bytes: 1, firstChangedAt: 1 }) };
      if (name.endsWith('/workspace-idle')) return { isWorkspaceSleeping: () => sleeping, LOCAL_SLEEP_SAVE_EVENT: 'sleep-save' };
      return {};
    }, window: win, document: doc, Date, TextEncoder,
    localStorage: { get length() { return storage.size; }, key: (i: number) => [...storage.keys()][i], getItem: (key: string) => { reads++; return storage.get(key) ?? null; } },
  });
  exports.default({ userId: 'alice' }); const stop = effects[0]();
  await new Promise(resolve => setImmediate(resolve)); reads = 0;
  const timer = callbacks[0];
  for (let elapsed = timer.interval; elapsed <= 3_600_000; elapsed += timer.interval) timer.task();
  assert.equal(reads, 240);
  doc.visibilityState = 'hidden'; timer.task(); assert.equal(reads, 240);
  const storageEvent = (key: string | null) => Object.assign(new Event('storage'), { key });
  win.dispatchEvent(storageEvent('notification-lock'));
  assert.equal(reads, 240);
  win.dispatchEvent(storageEvent('study'));
  assert.equal(reads, 241, 'Backupable cross-tab edits still trigger a scan');
  win.dispatchEvent(storageEvent(null));
  assert.equal(reads, 242, 'Storage clear events still trigger a scan');
  doc.visibilityState = 'visible'; sleeping = true; timer.task();
  assert.equal(reads, 242, 'Sleeping workspaces do not scan');
  storage.set('study', 'new edit'); win.dispatchEvent(new Event('pagehide'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(backups.at(-1), 'new edit');
  stop();
});
