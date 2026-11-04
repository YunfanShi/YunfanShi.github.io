/* eslint-disable @typescript-eslint/no-explicit-any -- VM fixtures expose dynamically evaluated browser globals. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { IDBFactory, IDBKeyRange, IDBObjectStore } from 'fake-indexeddb';
import { ensureLocalBackupBaseline, hasLocalPageData, listIncompleteLocalBackups, listLocalBackups, pruneLocalBackups, saveLocalBackup } from '../src/lib/backup/local.ts';
import { ALL_BACKUP_PAGES } from '../src/lib/backup/pages.ts';
import { applyLocalPageImport, parseLocalPageBackup } from '../src/lib/backup/local-import.ts';

function installDatabase() {
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: new IDBFactory() });
  Object.defineProperty(globalThis, 'IDBKeyRange', { configurable: true, value: IDBKeyRange });
}

async function readStoredRows(userId: string, page: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('jackyun-page-backups-v1');
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('versions', 'readonly');
      const read = tx.objectStore('versions').index('ownerPage').getAll(IDBKeyRange.only([userId, page]));
      read.onsuccess = () => resolve(read.result);
      read.onerror = () => reject(read.error);
      tx.oncomplete = () => db.close();
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
    request.onerror = () => reject(request.error);
  });
}

test('each page keeps ten recoverable versions as two full points and eight deltas', async () => {
  installDatabase();
  const large = '课表笔记'.repeat(100_000);
  for (let i = 0; i < 12; i++) await saveLocalBackup('alice', 'schedule', { large, revision: String(i) });
  const rows = await listLocalBackups('alice', 'schedule');
  assert.equal(rows.length, 10);
  assert.deepEqual(rows.map(row => row.values.revision), ['11','10','9','8','7','6','5','4','3','2']);
  assert.ok(rows.every(row => row.values.large === large), 'every restore point materializes to a complete page');
  const stored = await readStoredRows('alice','schedule');
  assert.equal(stored.filter(row => row.encoding === 'full').length, 2);
  assert.equal(stored.filter(row => row.encoding === 'delta').length, 8);
  assert.ok(JSON.stringify(stored.map(row => row.values)).length < JSON.stringify(rows.map(row => row.values)).length / 4,
    'stable large page data is stored twice, with intervening edits represented as deltas');
});

test('empty pages and an empty Schedule do not create backups or consume retention slots', async () => {
  installDatabase();
  for(const page of ALL_BACKUP_PAGES) await ensureLocalBackupBaseline('alice',page,{});
  await saveLocalBackup('alice','schedule',{jackyun_schedule_control_v1:JSON.stringify({cues:[]})});
  await ensureLocalBackupBaseline('alice','schedule',{jackyun_schedule_control_v1:JSON.stringify({cues:[]})});
  assert.equal(hasLocalPageData('schedule',{jackyun_schedule_control_v1:JSON.stringify({cues:[]})}),false);
  assert.equal((await listLocalBackups('alice','schedule')).length,0);
  const populated={jackyun_schedule_control_v1:JSON.stringify({cues:[{id:'cue-1'}]})};
  await ensureLocalBackupBaseline('alice','schedule',populated);
  assert.equal((await listLocalBackups('alice','schedule')).length,1,'first meaningful content creates one baseline');
  await ensureLocalBackupBaseline('alice','schedule',populated);
  assert.equal((await listLocalBackups('alice','schedule')).length,1,'unchanged content does not create a duplicate');
});

test('unchanged snapshots with a different property order do not create duplicate backups', async () => {
  installDatabase();
  await saveLocalBackup('alice', 'schedule', { a: 'same', b: 'value' });
  await saveLocalBackup('alice', 'schedule', { b: 'value', a: 'same' });
  assert.equal((await listLocalBackups('alice', 'schedule')).length, 1);
  await saveLocalBackup('alice', 'schedule', { a: 'changed', b: 'value' });
  assert.equal((await listLocalBackups('alice', 'schedule')).length, 2);
});

test('pruning cleans empty legacy points, keeps the latest ten, and rebases deltas for recovery', async () => {
  installDatabase();
  for(let i=0;i<12;i++) await saveLocalBackup('alice','schedule',{revision:String(i)});
  for(let i=0;i<3;i++) await saveLocalBackup('bob','schedule',{revision:String(i)});
  // Simulate empty padded versions written by the previous implementation.
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('jackyun-page-backups-v1');
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('versions', 'readwrite'), store = tx.objectStore('versions');
      store.add({ userId:'alice',page:'quiz',values:{},createdAt:'2026-10-11T00:00:00Z' });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
    request.onerror = () => reject(request.error);
  });
  await pruneLocalBackups('alice');
  const schedule=await listLocalBackups('alice','schedule');
  assert.equal(schedule.length,10);
  assert.equal(schedule[0].values.revision,'11');
  assert.equal(schedule.at(-1)!.values.revision,'2');
  assert.equal((await listLocalBackups('alice','quiz')).length,0,'old empty padding is removed');
  assert.equal((await listLocalBackups('bob','schedule')).length,3,'another account is untouched');
  assert.equal((await readStoredRows('alice','schedule')).filter(row=>row.encoding==='full').length,2,'pruning rebuilds complete checkpoints at the start and midpoint');
});

test('orphaned deltas stay preserved while backup listing, pruning, and Schedule JSON import continue', async () => {
  installDatabase();
  await listLocalBackups('alice','schedule'); // Initialize the object store before inserting the legacy raw row.
  const key='jackyun_schedule_control_v1';
  const legacyDelta={id:1,userId:'alice',page:'schedule',createdAt:'2026-11-03T00:00:00.000Z',values:{[key]:JSON.stringify({cues:[{id:'kept-delta-cue'}]})},encoding:'delta',deletedKeys:[]};
  await new Promise<void>((resolve,reject)=>{
    const request=indexedDB.open('jackyun-page-backups-v1');
    request.onsuccess=()=>{const db=request.result,tx=db.transaction('versions','readwrite');tx.objectStore('versions').put(legacyDelta);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};};
    request.onerror=()=>reject(request.error);
  });
  assert.equal((await listLocalBackups('alice','schedule')).length,0,'orphan delta is not offered as a complete replacement');
  assert.deepEqual((await listIncompleteLocalBackups('alice','schedule')).map(row=>row.id),[1]);
  await pruneLocalBackups('alice');
  assert.deepEqual(await readStoredRows('alice','schedule'),[legacyDelta],'pruning does not rewrite or delete the original incomplete row');

  const current=JSON.stringify({cues:[{id:'current-cue'}]});
  const imported=JSON.stringify({cues:[{id:'imported-cue'}],learningRecords:[{id:'lesson-1',completed:true}]});
  const local=new Map([[key,current]]);let flushed=false;
  await applyLocalPageImport({
    page:'schedule',owner:'alice',...parseLocalPageBackup(JSON.stringify({version:1,page:'schedule',values:{[key]:imported}}),'schedule'),
    storage:{keys:()=>[...local.keys()],getItem:item=>local.get(item)??null,setItem:(item,value)=>local.set(item,value),removeItem:item=>local.delete(item),flush:async()=>{flushed=true;}},
    saveRecoveryPoint:saveLocalBackup,
  });
  assert.equal(local.get(key),imported,'the validated page JSON is applied after a recovery point commits');
  assert.equal(flushed,true,'import waits for its storage flush');
  assert.deepEqual(await readStoredRows('alice','schedule').then(rows=>rows.filter(row=>row.id===1)),[legacyDelta],'a later successful import still retains the source delta for recovery');
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
  const importedSchedule = JSON.stringify({ cues: [{ id: 'new-cue' }], practiceSessions: [{ id: 'session-1', questions: [{ id: 'question-1', result: 'completed', firstAttempt: 'incorrect', retest: 'correct' }] }], notes: 'large'.repeat(350_000) });
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
  assert.equal(JSON.parse(current.get(key)!).practiceSessions[0].questions[0].result, 'completed', 'question-level progress survives the large Schedule import');
  assert.equal(current.get('jackyun_schedule_old_v1'), '{"cues":[]}', 'keys absent from an older import are preserved');
  assert.ok(events.indexOf('recovery:complete') < events.indexOf(`set:${key}`));
  assert.ok(events.indexOf('flush:complete') < events.indexOf('v5-targets-queued'));
  assert.ok(queuedFields.includes('cues'), 'Schedule imports target all required v5 Schedule resources');
  assert.ok(queuedFields.includes('practiceSessions'), 'Schedule imports queue the v5 resource containing question-level results');
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
