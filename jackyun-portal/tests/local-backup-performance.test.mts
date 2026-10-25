/* eslint-disable @typescript-eslint/no-explicit-any -- VM fixtures expose dynamically evaluated browser globals. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { IDBFactory, IDBKeyRange, IDBIndex, IDBObjectStore } from 'fake-indexeddb';
import { listLocalBackups, pruneLocalBackups, saveLocalBackup } from '../src/lib/backup/local.ts';

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
      if(name==='react/jsx-runtime')return {jsx:()=>null};
      if(name.endsWith('/sync/repository'))return {workspaceStorage:localStorage};
      if (name === 'react') return { useEffect: (effect: () => () => void) => effects.push(effect) };
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
