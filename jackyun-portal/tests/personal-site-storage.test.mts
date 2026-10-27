import assert from 'node:assert/strict';
import test from 'node:test';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { getDocuments, getOutbox, openDatabase } from '../src/lib/sync/outbox.ts';
import { importRepositoryRecordIfMissing, initializeRepository } from '../src/lib/sync/repository.ts';
import { personalSiteWorkspaceKey, listLocalSites, saveLocalSite, deleteLocalSite, importLegacyCloudSites } from '../src/lib/personal-site-storage.ts';
import type { PersonalSiteDefinition } from '../src/lib/personal-site.ts';

class StorageMock {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

Object.assign(globalThis, {
  indexedDB: new IDBFactory(),
  window: { localStorage: new StorageMock(), dispatchEvent() { return true; }, addEventListener() {}, removeEventListener() {} },
});

const ownerA='e67a1bf4-9a62-4a7f-8b61-95272c953107',ownerB='2f145b2c-ced8-4183-b65b-b4531b7fe5b0';
const snapshot=(ownerId:string,values:PersonalSiteDefinition[]):typeof fetch=>async()=>Response.json({ownerId,sites:values.map(definition=>({id:definition.id,definition}))});

test('authenticated legacy site import queues stable records, preserves different local edits and never revives tombstones',async()=>{
  await seedLegacyCache({...site,name:'Unowned legacy cache'});
  await initializeRepository(ownerA);
  assert.deepEqual(await listLocalSites(),[],'unowned cache must not be silently claimed by an authenticated account');
  const source={...site,id:crypto.randomUUID(),name:'Cloud source'};
  const result=await importLegacyCloudSites(snapshot(ownerA,[source]));
  assert.equal(result.imported,1);
  assert.deepEqual(await listLocalSites(),[source]);
  assert.equal((await getOutbox()).filter(op=>op.key===personalSiteWorkspaceKey(source.id)).length,1);
  assert.equal((await importLegacyCloudSites(snapshot(ownerA,[source]))).unchanged,1);
  const local={...source,name:'Unsynced local edit'};
  await saveLocalSite(local);
  assert.equal((await importLegacyCloudSites(snapshot(ownerA,[source]))).preservedCopies,1);
  const values=await listLocalSites();
  assert.equal(values.length,2);
  assert.deepEqual(values.find(value=>value.id===local.id),local);
  const copied=values.find(value=>value.id!==local.id)!;
  assert.match(copied.name,/旧版云端副本/);
  assert.equal((await importLegacyCloudSites(snapshot(ownerA,[source]))).unchanged,1);
  assert.equal((await listLocalSites()).length,2,'repeated imports must not create repeated copies');
  await deleteLocalSite(source.id);
  assert.equal((await importLegacyCloudSites(snapshot(ownerA,[source]))).tombstonesPreserved,1);
  assert.equal((await listLocalSites()).some(row=>row.id===source.id),false);
});

test('legacy imports reject a different owner and a response arriving after an account switch',async()=>{
  await initializeRepository(ownerA);
  const source={...site,id:crypto.randomUUID()};
  await assert.rejects(importLegacyCloudSites(snapshot(ownerB,[source])),/账号或格式不匹配/);
  let release!:(value:Response)=>void;
  let started!:()=>void;
  const requested=new Promise<void>(resolve=>{started=resolve;});
  const pending=importLegacyCloudSites(async()=>{started();return new Promise(resolve=>{release=resolve;});});
  await requested;
  await initializeRepository(ownerB);
  release(Response.json({ownerId:ownerA,sites:[{id:source.id,definition:source}]}));
  await assert.rejects(pending,/账号已变化/);
  assert.deepEqual(await listLocalSites(),[]);
  assert.equal((await getDocuments()).some(row=>row.key===personalSiteWorkspaceKey(source.id)),false);
});

test('import commits the document and intent atomically and refuses an already committed tombstone',async()=>{
  await initializeRepository(ownerB);
  const key=personalSiteWorkspaceKey(crypto.randomUUID())!,before=(await getOutbox()).length;
  const original=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(...args:Parameters<IDBObjectStore['put']>){
    if(this.name==='outbox')throw Error('Injected import intent failure');
    return original.apply(this,args);
  };
  try{await assert.rejects(importRepositoryRecordIfMissing(key,JSON.stringify(site)),/Injected import intent failure/);}
  finally{IDBObjectStore.prototype.put=original;}
  assert.equal((await getDocuments()).some(row=>row.key===key),false);
  assert.equal((await getOutbox()).length,before);
  assert.equal(await importRepositoryRecordIfMissing(key,JSON.stringify(site)),true);
  assert.equal((await getOutbox()).length,before+1);
  const tombstoneKey=personalSiteWorkspaceKey(crypto.randomUUID())!;
  const db=await openDatabase();
  try{await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction('documents','readwrite');tx.objectStore('documents').put({key:tombstoneKey,value:null,updatedAt:Date.now()});
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
  });}finally{db.close();}
  assert.equal(await importRepositoryRecordIfMissing(tombstoneKey,JSON.stringify(site)),false);
  assert.equal((await getDocuments()).find(row=>row.key===tombstoneKey)?.value,null);
  const remoteKey=personalSiteWorkspaceKey(crypto.randomUUID())!;
  const metadataDb=await openDatabase();
  try{await new Promise<void>((resolve,reject)=>{
    const tx=metadataDb.transaction('metadata','readwrite');tx.objectStore('metadata').put({key:remoteKey,revision:4,value:site,deleted:false});
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
  });}finally{metadataDb.close();}
  assert.equal(await importRepositoryRecordIfMissing(remoteKey,JSON.stringify(site)),false,'an existing cloud baseline must not be replaced by a stale source snapshot');
});

const site: PersonalSiteDefinition = {
  id: '9b775b2b-8a3f-4a6d-b2c7-0f8a89e14c31', name: 'Study', schemaVersion: 1,
  theme: 'light', blocks: [{ id: 'block-1', type: 'heading', text: 'Study' }], updatedAt: '2026-10-27T00:00:00.000Z',
};

async function seedLegacyCache(value: PersonalSiteDefinition) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('jackyun-personal-sites', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('sites', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('sites', 'readwrite');
    tx.objectStore('sites').put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

test('legacy personal sites migrate to v5 workspace and tombstones prevent stale cache resurrection', async () => {
  await seedLegacyCache(site);
  await initializeRepository(null);
  assert.equal(personalSiteWorkspaceKey(site.id), `jackyun_personal_site_v1:${site.id}`);
  assert.equal(personalSiteWorkspaceKey('legacy arbitrary id'), null);

  assert.deepEqual(await listLocalSites(), [site]);
  const key = personalSiteWorkspaceKey(site.id)!;
  assert.equal((await getDocuments()).find(row => row.key === key)?.value, JSON.stringify(site));

  const changed = { ...site, name: 'Updated', updatedAt: '2026-10-27T01:00:00.000Z' };
  await saveLocalSite(changed);
  assert.equal((await getDocuments()).find(row => row.key === key)?.value, JSON.stringify(changed));
  await deleteLocalSite(site.id);
  assert.equal((await getDocuments()).find(row => row.key === key)?.value, null);

  await seedLegacyCache(changed);
  assert.deepEqual(await listLocalSites(), [], 'a persisted tombstone must win over an old IndexedDB copy');
});
