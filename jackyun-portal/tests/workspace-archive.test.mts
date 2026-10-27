import assert from 'node:assert/strict';
import test from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import { applyV5WorkspaceArchive, createV5WorkspaceArchive, parseV5WorkspaceArchive } from '../src/lib/backup/workspace-archive.ts';
import { exportOfflineWorkspaceArchiveData, restoreOfflineWorkspaceArchiveData } from '../src/lib/offline/workspace.ts';
import { initializeRepository, workspaceStorage } from '../src/lib/sync/repository.ts';
import { getSyncArchiveData, restoreSyncArchiveData } from '../src/lib/sync/outbox.ts';

class StorageMock {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
  removeItem(key: string) { this.values.delete(key); }
}

Object.assign(globalThis, {
  indexedDB: new IDBFactory(),
  window: { localStorage: new StorageMock(), dispatchEvent() { return true; }, addEventListener() {}, removeEventListener() {} },
});

test('v5 workspace archive round-trips a Schedule larger than 1 MB and checks record plus archive hashes', async () => {
  const schedule = JSON.stringify({ cues: [{ id: 'cue-a' }], note: '漢字🙂'.repeat(400_000) });
  assert.ok(Buffer.byteLength(schedule) > 1_000_000);
  const archive = await createV5WorkspaceArchive({ jackyun_schedule_control_v1: schedule }, '2026-10-28T12:00:00.000Z');
  const parsed = await parseV5WorkspaceArchive(JSON.stringify(archive));
  assert.equal(parsed.recordCount, 1);
  assert.equal(parsed.records[0].value, schedule);

  const altered = structuredClone(archive);
  altered.records[0].value = `${schedule} `;
  await assert.rejects(parseV5WorkspaceArchive(JSON.stringify(altered)), /记录完整性校验失败/);
  await assert.rejects(parseV5WorkspaceArchive('{"format":"jackyun-v5-workspace","version":5}'), /归档版本或记录数量无效/);
});

test('workspace restore saves page recovery points first, preserves omitted keys, then queues changed v5 resources', async () => {
  indexedDB = new IDBFactory();
  Object.assign(window, { localStorage: new StorageMock() });
  await initializeRepository('archive-owner');
  workspaceStorage.setItem('quizwise_history', JSON.stringify([{ id: 'old' }]));
  workspaceStorage.setItem('jackyun_schedule_control_v1', JSON.stringify({ cues: [{ id: 'cue-old' }] }));
  await workspaceStorage.flush();

  const archive = await createV5WorkspaceArchive({ quizwise_history: JSON.stringify([{ id: 'new' }]) });
  const recoveries: Array<{ page: string; values: Record<string, string> }> = [];
  const events: string[] = [];
  const changed = await applyV5WorkspaceArchive({
    archive,
    owner: 'archive-owner',
    storage: {
      keys: () => Object.keys(workspaceStorage.snapshot()),
      getItem: key => workspaceStorage.getItem(key),
      setItem: (key, value) => workspaceStorage.setItem(key, value),
      flush: async () => { await workspaceStorage.flush(); events.push('flush'); },
    },
    saveRecoveryPoint: async (_owner, page, values) => { recoveries.push({ page, values }); events.push(`recovery:${page}`); },
    queueV5Targets: async targets => { assert.ok(events.includes('flush')); events.push('targets'); assert.ok(targets.some(target => target.field === 'legacyQuiz')); },
  });

  assert.deepEqual(changed, ['quizwise_history']);
  assert.equal(workspaceStorage.getItem('quizwise_history'), JSON.stringify([{ id: 'new' }]));
  assert.equal(workspaceStorage.getItem('jackyun_schedule_control_v1'), JSON.stringify({ cues: [{ id: 'cue-old' }] }));
  assert.ok(recoveries.some(item => item.page === 'quiz' && item.values.quizwise_history === JSON.stringify([{ id: 'old' }])));
  assert.ok(events.indexOf('recovery:quiz') < events.indexOf('flush'));
  assert.ok(events.indexOf('flush') < events.indexOf('targets'));
});

test('failed workspace IndexedDB flush never queues remote restore targets and leaves a recovery point', async () => {
  indexedDB = new IDBFactory();
  Object.assign(window, { localStorage: new StorageMock() });
  await initializeRepository('archive-failure-owner');
  workspaceStorage.setItem('quizwise_history', JSON.stringify([{ id: 'before' }]));
  await workspaceStorage.flush();
  const archive = await createV5WorkspaceArchive({ quizwise_history: JSON.stringify([{ id: 'after' }]) });
  const recoveries: string[] = [];
  let queued = false;
  const originalFlush = workspaceStorage.flush.bind(workspaceStorage);
  workspaceStorage.flush = async () => { throw new Error('injected archive persistence failure'); };
  try {
    await assert.rejects(applyV5WorkspaceArchive({
      archive,
      owner: 'archive-failure-owner',
      storage: {
        keys: () => Object.keys(workspaceStorage.snapshot()),
        getItem: key => workspaceStorage.getItem(key),
        setItem: (key, value) => workspaceStorage.setItem(key, value),
        flush: () => workspaceStorage.flush(),
      },
      saveRecoveryPoint: async (_owner, page) => { recoveries.push(page); },
      queueV5Targets: async () => { queued = true; },
    }), /injected archive persistence failure/);
  } finally {
    workspaceStorage.flush = originalFlush;
  }
  assert.ok(recoveries.includes('quiz'));
  assert.equal(queued, false);
});

test('v5 workspace archive rejects an empty Schedule instead of replacing local data', async () => {
  const archive = await createV5WorkspaceArchive({ jackyun_schedule_control_v1: JSON.stringify({ cues: [] }) });
  await assert.rejects(parseV5WorkspaceArchive(JSON.stringify(archive)), /拒绝从空 Schedule 归档覆盖本机数据/);
});

test('portable archive includes account-owned offline snapshots and retries and restores them atomically', async () => {
  indexedDB = new IDBFactory();
  Object.assign(window, { localStorage: new StorageMock() });
  const owner = 'offline-archive-owner';
  const offlineWorkspace = {
    ownerId: owner,
    snapshots: [{ id: `${owner}:tasks`, userId: owner, scope: 'tasks' as const, value: { plans: [], inboxTasks: [{ id: 'task-a' }] }, updatedAt: '2026-10-28T10:00:00.000Z' }],
    outbox: [{ id: '00400000-0000-4000-8000-000000000001', userId: owner, kind: 'task.create', payload: { title: 'offline task' }, createdAt: '2026-10-28T10:01:00.000Z', attemptCount: 2, nextAttemptAt: '2026-10-28T10:05:00.000Z' }],
  };
  const archive = await createV5WorkspaceArchive({}, '2026-10-28T10:02:00.000Z', offlineWorkspace);
  const parsed = await parseV5WorkspaceArchive(JSON.stringify(archive));
  await restoreOfflineWorkspaceArchiveData(owner, parsed.offlineWorkspace!);
  const restored = await exportOfflineWorkspaceArchiveData(owner);
  assert.deepEqual(restored.snapshots, offlineWorkspace.snapshots);
  assert.equal(restored.outbox.length, 1);
  assert.equal(restored.outbox[0].id, offlineWorkspace.outbox[0].id);
  assert.equal(restored.outbox[0].attemptCount, 2);
  assert.equal(restored.outbox[0].sequence, 1);
  const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('jackyun-offline-workspace'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  try {
    const checkpoints = await new Promise<unknown[]>((resolve, reject) => {
      const tx = db.transaction('archiveRecoveryPoints', 'readonly');
      const request = tx.objectStore('archiveRecoveryPoints').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    assert.equal(checkpoints.length, 1);
  } finally { db.close(); }

  await assert.rejects(restoreOfflineWorkspaceArchiveData('other-account', parsed.offlineWorkspace!), /属于其他账号/);
});

test('offline archive restore collision rolls back snapshots and operation rows', async () => {
  indexedDB = new IDBFactory();
  Object.assign(window, { localStorage: new StorageMock() });
  const owner = 'offline-archive-conflict';
  const data = {
    ownerId: owner,
    snapshots: [{ id: `${owner}:tasks`, userId: owner, scope: 'tasks' as const, value: { marker: 'archived' }, updatedAt: '2026-10-28T10:00:00.000Z' }],
    outbox: [{ id: '00400000-0000-4000-8000-000000000002', userId: owner, kind: 'task.create', payload: { title: 'archive' }, createdAt: '2026-10-28T10:01:00.000Z' }],
  };
  const archive = await createV5WorkspaceArchive({}, undefined, data);
  await restoreOfflineWorkspaceArchiveData(owner, { ...data, outbox: [{ ...data.outbox[0], payload: { title: 'local collision' } }] });
  await assert.rejects(restoreOfflineWorkspaceArchiveData(owner, archive.offlineWorkspace!), /操作 ID 与本机内容冲突/);
  const current = await exportOfflineWorkspaceArchiveData(owner);
  assert.deepEqual(current.snapshots, [{ id: `${owner}:tasks`, userId: owner, scope: 'tasks', value: { marker: 'archived' }, updatedAt: '2026-10-28T10:00:00.000Z' }]);
  assert.deepEqual(current.outbox[0].payload, { title: 'local collision' });
  const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('jackyun-offline-workspace'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  try {
    const checkpoints = await new Promise<unknown[]>((resolve, reject) => {
      const tx = db.transaction('archiveRecoveryPoints', 'readonly');
      const request = tx.objectStore('archiveRecoveryPoints').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    assert.equal(checkpoints.length, 1);
  } finally { db.close(); }
});

test('portable archive preserves v4 and v5 pending operations and conflicts with account isolation and recovery', async () => {
  indexedDB = new IDBFactory();
  Object.assign(window, { localStorage: new StorageMock() });
  const owner='sync-archive-owner';
  await getSyncArchiveData(owner);
  const operationId='00400000-0000-4000-8000-000000000011';
  const legacyOperation={id:operationId,key:'quizwise_history',baseRevision:2,baseHash:'base-hash',baseValue:'old',value:'pending',deleted:false,clientUpdatedAt:'2026-10-28T10:00:00.000Z'};
  const legacyConflict={operationId:'00400000-0000-4000-8000-000000000012',key:'quizwise_history',baseRevision:1,baseValue:'base',localValue:'local',localDeleted:false,remoteValue:'remote',remoteDeleted:false,remoteHash:'remote-hash',remoteRevision:2,createdAt:'2026-10-28T10:01:00.000Z'};
  const v5Operation={id:'00400000-0000-4000-8000-000000000013',scope:'workspace' as const,recordId:'legacyQuiz:sample',baseRevision:3,baseHash:null,value:{pending:true},deleted:false,clientUpdatedAt:'2026-10-28T10:02:00.000Z'};
  const v5Conflict={operationId:'00400000-0000-4000-8000-000000000014',scope:'workspace' as const,recordId:'legacyQuiz:sample',baseRevision:3,baseHash:null,localValue:{local:true},localDeleted:false,remoteValue:{remote:true},remoteDeleted:false,remoteRevision:4,remoteHash:'remote-hash',createdAt:'2026-10-28T10:03:00.000Z'};
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open(`jackyun-sync-v2:${owner}`);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['outbox','conflicts','v5Outbox','v5Conflicts'],'readwrite');
    tx.objectStore('outbox').put(legacyOperation);tx.objectStore('conflicts').put(legacyConflict);tx.objectStore('v5Outbox').put(v5Operation);tx.objectStore('v5Conflicts').put(v5Conflict);
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}

  const snapshot=await getSyncArchiveData(owner);
  assert.equal(snapshot.legacyOutbox.length,1);assert.equal(snapshot.legacyConflicts.length,1);
  assert.equal(snapshot.v5Outbox.length,1);assert.equal(snapshot.v5Conflicts.length,1);
  await assert.rejects(restoreSyncArchiveData('different-owner',snapshot),/缺少账号归属/);
  const archive=await createV5WorkspaceArchive({},'2026-10-28T10:04:00.000Z',undefined,snapshot);
  const parsed=await parseV5WorkspaceArchive(JSON.stringify(archive));
  await new Promise<void>((resolve,reject)=>{const request=indexedDB.open(`jackyun-sync-v2:${owner}`);request.onsuccess=()=>{const database=request.result,tx=database.transaction(['outbox','conflicts','v5Outbox','v5Conflicts'],'readwrite');
    for(const name of ['outbox','conflicts','v5Outbox','v5Conflicts'])tx.objectStore(name).clear();
    tx.oncomplete=()=>{database.close();resolve();};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);};request.onerror=()=>reject(request.error);});
  const restored=await restoreSyncArchiveData(owner,parsed.syncState);
  assert.deepEqual(restored,{legacyOperations:1,legacyConflicts:1,v5Operations:1,v5Conflicts:1});
  assert.deepEqual(await getSyncArchiveData(owner),snapshot);
  assert.deepEqual(await restoreSyncArchiveData(owner,parsed.syncState),{legacyOperations:0,legacyConflicts:0,v5Operations:0,v5Conflicts:0});
  const changed=structuredClone(parsed.syncState!);changed.legacyOutbox[0].value='different payload';
  await assert.rejects(restoreSyncArchiveData(owner,changed),/内容与本机不同/);
  const recovered=await new Promise<unknown[]>((resolve,reject)=>{const request=indexedDB.open(`jackyun-sync-v2:${owner}`);request.onsuccess=()=>{
    const database=request.result,tx=database.transaction('settings','readonly'),get=tx.objectStore('settings').getAll();get.onsuccess=()=>resolve(get.result);
    tx.onerror=()=>reject(tx.error);tx.oncomplete=()=>database.close();};request.onerror=()=>reject(request.error);});
  assert.equal((recovered as Array<{key:string}>).filter(row=>row.key.startsWith(`archiveRecovery:${owner}:`)).length,2);
  assert.deepEqual(await getSyncArchiveData('unrelated-owner'),{ownerId:'unrelated-owner',legacyOutbox:[],legacyConflicts:[],v5Outbox:[],v5Conflicts:[]});
});
