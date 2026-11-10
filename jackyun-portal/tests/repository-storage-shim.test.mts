import assert from 'node:assert/strict';
import test from 'node:test';
import { IDBFactory } from 'fake-indexeddb';

const values = new Map<string, string>();
class StorageMock {
  get length() { return values.size; }
  key(index: number) { return [...values.keys()][index] ?? null; }
  getItem(key: string) { return values.get(key) ?? null; }
  setItem(key: string, value: string) { values.set(String(key), String(value)); }
  removeItem(key: string) { values.delete(String(key)); }
  clear() { values.clear(); }
}

const localStorage = new StorageMock();
values.set('jackyun_theme', 'dark');
values.set('jackyun_schedule_control_v1', JSON.stringify({ cues: [{ id: 'legacy-cue' }] }));
Object.assign(globalThis, {
  indexedDB: new IDBFactory(),
  Storage: StorageMock,
  BroadcastChannel: undefined,
  window: {
    localStorage,
    dispatchEvent: () => true,
    addEventListener() {},
    removeEventListener() {},
  },
});

const { getLocalMigrationProgress, initializeRepository, workspaceStorage, migrateLegacyStorage } = await import('../src/lib/sync/repository.ts');
const { getDocuments } = await import('../src/lib/sync/outbox.ts');
const { readLocalData } = await import('../src/lib/sync/local-data.ts');
localStorage.setItem('jackyun_theme', 'light');
const localOnlyValues = {
  'jackyun_cue_answer_draft_v1:["session","cue"]': '{"text":"old draft"}',
  'jackyun_sync_pause_until_v1:test-user': '2000000000000',
  'jackyun_stepwise_recitations_v1': '[{"id":"legacy-recitation"}]',
};
for (const [key, value] of Object.entries(localOnlyValues)) values.set(key, value);

test('legacy localStorage API reads and writes durable application data through IndexedDB', async () => {
  await initializeRepository('storage-shim-test');
  assert.equal(getLocalMigrationProgress().completed,0,'opening a page never scans old data');
  assert.equal(values.get('jackyun_theme'),'dark','startup leaves native source untouched');
  assert.equal(localStorage.getItem('jackyun_schedule_control_v1'),null,'legacy records stay hidden until explicitly imported');
  await migrateLegacyStorage();
  assert.equal(getLocalMigrationProgress().phase,'complete');
  assert.ok(getLocalMigrationProgress().completed>0);

  assert.equal(localStorage.getItem('jackyun_theme'), 'light');
  assert.equal(values.get('jackyun_theme'), 'dark', 'manual import preserves original source');
  for (const [key, value] of Object.entries(localOnlyValues)) {
    assert.equal(localStorage.getItem(key), value, `${key} remains readable through the old API`);
    assert.equal(values.get(key), value, `${key} retains its original recovery source`);
  }
  const localRows = new Map((await readLocalData()).map((row) => [row.key, row.value]));
  for (const [key, value] of Object.entries(localOnlyValues)) assert.equal(localRows.get(key), value, `${key} is kept in the local-only IndexedDB store`);
  assert([...localRows.values()].some((value) => value.includes('"sourceKey":"jackyun_theme"') && value.includes('"value":"dark"')), 'native legacy theme is preserved when a newer startup write exists');

  const largeSchedule = JSON.stringify({ cues: [{ id: 'restored-cue', body: 'x'.repeat(1_500_000) }] });
  localStorage.setItem('jackyun_schedule_control_v1', largeSchedule);
  await workspaceStorage.flush();

  assert.notEqual(values.get('jackyun_schedule_control_v1'), largeSchedule, 'new writes do not recreate a localStorage quota copy');
  assert.equal(localStorage.getItem('jackyun_schedule_control_v1'), largeSchedule);
  assert.equal((await getDocuments()).find((row) => row.key === 'jackyun_schedule_control_v1')?.value, largeSchedule);

  localStorage.setItem('sb-project-auth-token', 'session-token');
  assert.equal(values.get('sb-project-auth-token'), 'session-token', 'authentication state remains in native browser storage');
});

test('stale projected content never blocks startup or replaces newer IndexedDB data',async()=>{
  const key='jackyun_schedule_control_v1';
  const latest=workspaceStorage.getItem(key);
  const {openDatabase}=await import('../src/lib/sync/outbox.ts');
  const db=await openDatabase();
  await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction('documents','readwrite');
    tx.objectStore('documents').put({key,value:latest,projectedValue:JSON.stringify({cues:[{id:'outdated-base'}]})});
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
  });db.close();
  values.set(key,JSON.stringify({cues:[{id:'conflicting-old-copy'}]}));
  await initializeRepository('other-account');
  assert.equal(workspaceStorage.getItem(key),null,'switching accounts does not claim unowned legacy content');
  await initializeRepository('storage-shim-test');
  assert.equal(workspaceStorage.getItem(key),latest);
  await migrateLegacyStorage();
  assert.equal(workspaceStorage.getItem(key),latest,'manual migration preserves the authoritative document');
  const preserved=(await readLocalData()).filter(row=>row.key.startsWith('jackyun_migration_conflict_v1:'));
  assert.ok(preserved.some(row=>JSON.parse(row.value).value===values.get(key)));
  const count=preserved.length;
  await migrateLegacyStorage();
  assert.equal((await readLocalData()).filter(row=>row.key.startsWith('jackyun_migration_conflict_v1:')).length,count,'repeating migration deduplicates recovery copies');
  workspaceStorage.removeItem(key);await workspaceStorage.flush();
  await migrateLegacyStorage();
  assert.equal(workspaceStorage.getItem(key),null,'an existing tombstone is not resurrected');
});

test('a manual recovery failure leaves current storage usable and source available for retry',async()=>{
  // An invalid IndexedDB source write simulates storage failure after the scan.
  const {IDBObjectStore}=await import('fake-indexeddb');
  const put=IDBObjectStore.prototype.put;
  values.set('manual-recovery-failure','source remains');
  IDBObjectStore.prototype.put=function(...args:Parameters<typeof put>){
    if(this.name==='values')throw new DOMException('injected quota','QuotaExceededError');
    return put.apply(this,args);
  };
  try{await assert.rejects(migrateLegacyStorage(),/injected quota/);}finally{IDBObjectStore.prototype.put=put;}
  assert.equal(values.get('manual-recovery-failure'),'source remains');
  await initializeRepository('storage-shim-test');
  workspaceStorage.setItem('current-preference','still editable');await workspaceStorage.flush();
  assert.equal(workspaceStorage.getItem('current-preference'),'still editable');
  await migrateLegacyStorage();
  assert.equal(workspaceStorage.getItem('manual-recovery-failure'),'source remains');
});
