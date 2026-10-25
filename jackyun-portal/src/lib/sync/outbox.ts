'use client';

import type { SyncConflict, SyncOperation, SyncRecord,SyncSubmission,SyncDownloadPart } from '@/types/sync';
import { compactSyncOperations } from './batch.ts';
import { reconcileAcknowledgment } from './acknowledgment.ts';
import { canonicalJson } from './hash.ts';
import { threeWayMerge } from './merge.ts';
import { isSyncableStorageKey } from '../local-workspace.ts';
import { mergeScheduleResources, type ScheduleResource, type SyncV5Scope } from './resource-model.ts';

const DB_NAME = 'jackyun-sync-v2';
const DB_VERSION = 3;
let account: string | null = null;
const activeLeases=new Map<string,{lost:boolean;until:number}>();
export const isSyncLeaseLost=(key:string)=>{const lease=activeLeases.get(key);return Boolean(lease&&(lease.lost||lease.until<=Date.now()));};
export type SyncMetadata = SyncRecord;

export interface V5ResourceRecord {scope:SyncV5Scope;recordId:string;revision:number;contentHash:string|null;deleted:boolean;updatedAt:string;value:unknown}
export interface V5ResourceOperation {id:string;scope:SyncV5Scope;recordId:string;baseRevision:number;baseHash:string|null;value:unknown;deleted:boolean;clientUpdatedAt:string}
export interface V5ResourceCursor {scope:SyncV5Scope;mode:'baseline'|'changes';after:string;cursor:number;head:number}
export interface V5ResourceConflict {operationId:string;scope:SyncV5Scope;recordId:string;baseRevision:number;baseHash:string|null;localValue:unknown;localDeleted:boolean;remoteValue:unknown;remoteDeleted:boolean;remoteRevision:number;remoteHash:string|null;createdAt:string}
const SCHEDULE_DOCUMENT_KEY='jackyun_schedule_control_v1';
const parseScheduleResources=(rows:V5ResourceRecord[]):ScheduleResource[]=>rows.filter(row=>!row.deleted).map(row=>{
  const colon=row.recordId.indexOf(':');if(colon<1)throw new Error('v5 resource id invalid');
  return {scope:row.scope,recordId:row.recordId,field:row.recordId.slice(0,colon),itemId:decodeURIComponent(row.recordId.slice(colon+1)),value:row.value};
});

export function openDatabase(name = account ? `${DB_NAME}:${account}` : DB_NAME): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('metadata')) db.createObjectStore('metadata', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('conflicts')) db.createObjectStore('conflicts', { keyPath: 'operationId' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('documents')) db.createObjectStore('documents', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('leases')) db.createObjectStore('leases', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('v5Resources')) {const store=db.createObjectStore('v5Resources',{keyPath:['scope','recordId']});store.createIndex('scope','scope');}
      if (!db.objectStoreNames.contains('v5Cursors')) db.createObjectStore('v5Cursors',{keyPath:'scope'});
      if (!db.objectStoreNames.contains('v5Outbox')) db.createObjectStore('v5Outbox',{keyPath:'id'});
      if (!db.objectStoreNames.contains('v5Conflicts')) db.createObjectStore('v5Conflicts',{keyPath:'operationId'});
    };
    request.onsuccess = () => { request.result.onversionchange=()=>request.result.close();resolve(request.result); };
    request.onerror = () => reject(request.error);
  });
}

async function storeRequest<T>(storeName: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>,scope?:string): Promise<T> {
  const db = await openDatabase(scope);
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const request = action(transaction.objectStore(storeName));
      let result: T;
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    });
  } finally { db.close(); }
}

export async function getV5Cursor(scope:SyncV5Scope,dbScope?:string):Promise<V5ResourceCursor|null>{return (await storeRequest<V5ResourceCursor|undefined>('v5Cursors','readonly',store=>store.get(scope),dbScope))??null;}
export async function setV5Cursor(scope:SyncV5Scope,value:V5ResourceCursor|null,dbScope?:string):Promise<void>{
  const db=await openDatabase(dbScope);try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('v5Cursors','readwrite'),store=tx.objectStore('v5Cursors');if(value)store.put(value);else store.delete(scope);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}
}
export async function getV5Resources(scope:SyncV5Scope,dbScope?:string):Promise<V5ResourceRecord[]>{
  const db=await openDatabase(dbScope);try{return await new Promise((resolve,reject)=>{const tx=db.transaction('v5Resources','readonly'),req=tx.objectStore('v5Resources').index('scope').getAll(scope);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}finally{db.close();}
}
export async function getV5Outbox(scope?:SyncV5Scope,dbScope?:string):Promise<V5ResourceOperation[]>{
  const rows=await storeRequest<V5ResourceOperation[]>('v5Outbox','readonly',store=>store.getAll(),dbScope);return rows.filter(row=>!scope||row.scope===scope);
}
export async function getV5Conflicts(dbScope?:string):Promise<V5ResourceConflict[]>{return storeRequest('v5Conflicts','readonly',store=>store.getAll(),dbScope);}
export async function queueV5ResourceOperation(operation:V5ResourceOperation,dbScope?:string):Promise<void>{
  const db=await openDatabase(dbScope);try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['v5Resources','v5Outbox'],'readwrite'),resources=tx.objectStore('v5Resources'),outbox=tx.objectStore('v5Outbox');
    const prior=resources.get([operation.scope,operation.recordId]);prior.onsuccess=()=>{const current=prior.result as V5ResourceRecord|undefined;
      if((current?.revision??0)!==operation.baseRevision||(current?.contentHash??null)!==operation.baseHash){tx.abort();return;}
      const all=outbox.getAll();all.onsuccess=()=>{for(const row of all.result as V5ResourceOperation[])if(row.scope===operation.scope&&row.recordId===operation.recordId)outbox.delete(row.id);outbox.put(operation);};};
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??new Error('v5 local operation could not be queued'));});}finally{db.close();}
}
/** Resource rows, visible Schedule document, and the page cursor commit together. */
export async function commitV5ResourcePage(scope:SyncV5Scope,records:V5ResourceRecord[],cursor:V5ResourceCursor,dbScope?:string):Promise<string|null>{
  const db=await openDatabase(dbScope);try{return await new Promise((resolve,reject)=>{const tx=db.transaction(['v5Resources','v5Cursors','v5Outbox','v5Conflicts','documents'],'readwrite'),resources=tx.objectStore('v5Resources'),cursorStore=tx.objectStore('v5Cursors'),outbox=tx.objectStore('v5Outbox'),documents=tx.objectStore('documents');
    const known=resources.index('scope').getAll(scope),pending=outbox.getAll(),conflictStore=tx.objectStore('v5Conflicts'),conflicts=conflictStore.getAll(),document=documents.get(SCHEDULE_DOCUMENT_KEY);let projected:string|null=null,failed=false,done=0;
    const finish=()=>{if(++done!==4||failed)return;try{
      const rows=new Map((known.result as V5ResourceRecord[]).map(row=>[row.recordId,row]));
      for(const row of records){if(row.scope!==scope)throw Error('v5 scope mismatch');rows.set(row.recordId,row);resources.put(row);}
      const pendingRows=(pending.result as V5ResourceOperation[]).filter(row=>row.scope===scope);
      for(const op of pendingRows)rows.set(op.recordId,{scope,recordId:op.recordId,revision:op.baseRevision,contentHash:op.baseHash,deleted:op.deleted,updatedAt:op.clientUpdatedAt,value:op.value});
      const conflictRows=(conflicts.result as V5ResourceConflict[]).filter(row=>row.scope===scope);
      for(const conflict of conflictRows)rows.set(conflict.recordId,{scope,recordId:conflict.recordId,revision:conflict.baseRevision,contentHash:conflict.baseHash,deleted:conflict.localDeleted,updatedAt:conflict.createdAt,value:conflict.localValue});
      const raw=document.result?.value as string|null|undefined;
      const base=raw?JSON.parse(raw):{};if(!base||typeof base!=='object'||Array.isArray(base))throw Error('Schedule local document invalid');
      const touched=new Set(records.map(row=>row.recordId.slice(0,row.recordId.indexOf(':'))));
      const merged=mergeScheduleResources(base,parseScheduleResources([...rows.values()]),[...touched]);
      projected=JSON.stringify(merged);if(projected!==raw)documents.put({...document.result,key:SCHEDULE_DOCUMENT_KEY,value:projected,updatedAt:Date.now()});
      cursorStore.put(cursor);
    }catch(error){failed=true;tx.abort();reject(error);}};
    for(const request of [known,pending,conflicts,document]){request.onsuccess=finish;request.onerror=()=>{failed=true;reject(request.error);};}
    tx.oncomplete=()=>resolve(projected);tx.onerror=()=>reject(tx.error);tx.onabort=()=>{if(!failed)reject(tx.error??new Error('v5 page commit aborted'));};});}finally{db.close();}
}
export async function acknowledgeV5Operations(applied:Array<{operation:V5ResourceOperation;revision:number;contentHash:string|null;updatedAt:string}>,dbScope?:string):Promise<void>{
  const db=await openDatabase(dbScope);try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['v5Outbox','v5Resources'],'readwrite'),outbox=tx.objectStore('v5Outbox'),resources=tx.objectStore('v5Resources');
    for(const row of applied){outbox.delete(row.operation.id);resources.put({scope:row.operation.scope,recordId:row.operation.recordId,revision:row.revision,contentHash:row.contentHash,deleted:row.operation.deleted,updatedAt:row.updatedAt,value:row.operation.value});}
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}
}
export async function saveV5Conflicts(conflicts:V5ResourceConflict[],dbScope?:string):Promise<void>{
  const db=await openDatabase(dbScope);try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['v5Conflicts','v5Outbox','v5Resources'],'readwrite'),store=tx.objectStore('v5Conflicts'),outbox=tx.objectStore('v5Outbox'),resources=tx.objectStore('v5Resources');for(const conflict of conflicts){store.put(conflict);outbox.delete(conflict.operationId);resources.put({scope:conflict.scope,recordId:conflict.recordId,revision:conflict.remoteRevision,contentHash:conflict.remoteHash,deleted:conflict.remoteDeleted,updatedAt:conflict.createdAt,value:conflict.remoteValue});}tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}
}
export async function resolveV5ConflictLocally(operationId:string,newId:string,dbScope?:string):Promise<V5ResourceOperation|null>{
  const db=await openDatabase(dbScope);try{return await new Promise((resolve,reject)=>{const tx=db.transaction(['v5Conflicts','v5Resources','v5Outbox'],'readwrite'),conflicts=tx.objectStore('v5Conflicts'),resources=tx.objectStore('v5Resources'),outbox=tx.objectStore('v5Outbox');let result:V5ResourceOperation|null=null;
    const found=conflicts.get(operationId);found.onsuccess=()=>{const conflict=found.result as V5ResourceConflict|undefined;if(!conflict)return;const current=resources.get([conflict.scope,conflict.recordId]);current.onsuccess=()=>{const base=current.result as V5ResourceRecord|undefined;result={id:newId,scope:conflict.scope,recordId:conflict.recordId,baseRevision:base?.revision??conflict.remoteRevision,baseHash:base?.contentHash??conflict.remoteHash,value:conflict.localValue,deleted:conflict.localDeleted,clientUpdatedAt:new Date().toISOString()};conflicts.delete(operationId);outbox.put(result!);};};
    tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}
}
export async function resolveV5ConflictRemotely(operationId:string,dbScope?:string):Promise<string|null>{
  const db=await openDatabase(dbScope);try{return await new Promise((resolve,reject)=>{const tx=db.transaction(['v5Conflicts','v5Resources','documents'],'readwrite'),conflicts=tx.objectStore('v5Conflicts'),resources=tx.objectStore('v5Resources'),documents=tx.objectStore('documents');let projected:string|null=null,done=0,failed=false;
    const conflict=conflicts.get(operationId);let all:IDBRequest<V5ResourceRecord[]>,document:IDBRequest<{key:string;value:string}|undefined>;
    conflict.onsuccess=()=>{const row=conflict.result as V5ResourceConflict|undefined;if(!row)return;all=resources.index('scope').getAll(row.scope);document=documents.get(SCHEDULE_DOCUMENT_KEY);
      const finish=()=>{if(++done!==2||failed)return;try{const raw=document.result?.value??'{}',base=JSON.parse(raw) as Record<string,unknown>,touched=[row.recordId.slice(0,row.recordId.indexOf(':'))];
        projected=JSON.stringify(mergeScheduleResources(base,parseScheduleResources(all.result),touched));if(projected!==document.result?.value)documents.put({...document.result,key:SCHEDULE_DOCUMENT_KEY,value:projected,updatedAt:Date.now()});conflicts.delete(operationId);
      }catch(error){failed=true;tx.abort();reject(error);}};
      all.onsuccess=finish;all.onerror=()=>{failed=true;reject(all.error);};document.onsuccess=finish;document.onerror=()=>{failed=true;reject(document.error);};
    };
    conflict.onerror=()=>{failed=true;reject(conflict.error);};tx.oncomplete=()=>resolve(projected);tx.onerror=()=>reject(tx.error);tx.onabort=()=>{if(!failed)reject(tx.error);};});}finally{db.close();}
}

export function getOutbox(scope?:string): Promise<SyncOperation[]> {
  return storeRequest('outbox', 'readonly', (store) => store.getAll(),scope);
}

async function updateOutbox(action: (store: IDBObjectStore, operations: SyncOperation[], lastSequence: number) => SyncOperation[],scope?:string): Promise<SyncOperation[]> {
  const db = await openDatabase(scope);
  try {
    return await new Promise<SyncOperation[]>((resolve, reject) => {
      const transaction = db.transaction(['outbox','settings'], 'readwrite');
      const store = transaction.objectStore('outbox');
      const settings = transaction.objectStore('settings');
      const request = store.getAll();
      let result: SyncOperation[] = [];
      request.onsuccess = () => {
        const counter=settings.get('operationSequence');
        counter.onsuccess=()=>{
          try {
            const lastSequence=Math.max(counter.result?.value ?? 0,0,...request.result.map((op:SyncOperation)=>op.sequence ?? 0));
            result = action(store, request.result,lastSequence);
            settings.put({key:'operationSequence',value:Math.max(lastSequence,...result.map(op=>op.sequence ?? 0))});
          } catch(error) { transaction.abort();reject(error); }
        };
        counter.onerror=()=>reject(counter.error);
      };
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    });
  } finally { db.close(); }
}

export async function compactOutbox(): Promise<SyncOperation[]> {
  return updateOutbox((store, operations) => {
    const compacted = compactSyncOperations(operations);
    const retainedIds = new Set(compacted.map((operation) => operation.id));
    for (const operation of operations) if (!retainedIds.has(operation.id)) store.delete(operation.id);
    for (const operation of compacted) store.put(operation);
    return compacted;
  });
}

export async function queueOperation(operation: SyncOperation,scope?:string): Promise<void> {
  await updateOutbox((store, operations,lastSequence) => {
    const matching = operations.filter((item) => item.key === operation.key);
    const sequence = lastSequence+1;
    if(!Number.isSafeInteger(sequence))throw Error('同步操作编号超过上限');
    const next = compactSyncOperations([...matching, {...operation,sequence}])[0];
    for (const previous of matching) store.delete(previous.id);
    store.put(next);
    return [next];
  },scope);
}

/** CAS for local intent: a different tab's newer edit cannot be acknowledged away. */
export async function replaceOperation(sent: SyncOperation, next: SyncOperation | null,scope?:string): Promise<boolean> {
  let replaced = false;
  await updateOutbox((store,operations) => {
    const current = operations.find(op=>op.id === sent.id);
    if (!current || current.baseRevision !== sent.baseRevision || current.baseHash !== sent.baseHash || current.sequence !== sent.sequence
      || reconcileAcknowledgment(current,sent,{key:sent.key,value:null,revision:0,contentHash:null,deleted:false,updatedAt:sent.clientUpdatedAt},'unused')) return operations;
    store.delete(sent.id);
    if (next) store.put({...next,sequence:next.sequence ?? current.sequence});
    replaced = true;
    return operations.filter(op=>op.id !== sent.id).concat(next ? [next] : []);
  },scope);
  return replaced;
}

export async function removeOperation(id: string): Promise<void> {
  await storeRequest('outbox', 'readwrite', (store) => store.delete(id));
}

/** Atomically acknowledge only the uploaded edit, retaining concurrent edits. */
export async function acknowledgeOperation(sent: SyncOperation, cloud: SyncRecord, resolvesOperationId?: string,scope?:string): Promise<boolean> {
  let removed = false;
  await updateOutbox((store, operations) => {
    const current = operations.find((operation) => operation.id === sent.id)
      ?? operations.find(operation=>operation.key===sent.key && operation.baseRevision===sent.baseRevision && operation.baseHash===sent.baseHash);
    if (!current) return operations;
    const replacement = reconcileAcknowledgment(current, sent, cloud, crypto.randomUUID(), resolvesOperationId);
    store.delete(current.id);
    if (replacement) store.put(replacement);
    removed = !replacement;
    return operations.filter((operation) => operation.id !== current.id).concat(replacement ? [replacement] : []);
  },scope);
  return removed;
}

export function getMetadata(scope?:string): Promise<SyncMetadata[]> {
  return storeRequest('metadata', 'readonly', (store) => store.getAll(),scope);
}

export async function saveMetadata(metadata: SyncMetadata,scope?:string): Promise<void> {
  await storeRequest('metadata', 'readwrite', (store) => store.put(metadata),scope);
}

export function getConflicts(scope?:string): Promise<SyncConflict[]> {
  return storeRequest('conflicts', 'readonly', (store) => store.getAll(),scope);
}

export async function saveConflict(conflict: SyncConflict,scope?:string): Promise<void> {
  await storeRequest('conflicts', 'readwrite', (store) => store.put(conflict),scope);
}

export async function removeConflict(operationId: string,scope?:string): Promise<void> {
  await storeRequest('conflicts', 'readwrite', (store) => store.delete(operationId),scope);
}

export async function clearConflicts(): Promise<void> {
  await storeRequest('conflicts', 'readwrite', (store) => store.clear());
}

export async function getSetting<T>(key: string,scope?:string): Promise<T | null> {
  const row = await storeRequest<{ key: string; value: T } | undefined>('settings', 'readonly', (store) => store.get(key),scope);
  return row?.value ?? null;
}

export async function setSetting(key: string, value: unknown,scope?:string): Promise<void> {
  await storeRequest('settings', 'readwrite', (store) => store.put({ key, value }),scope);
}

export const getSubmission = () => getSetting<SyncSubmission>('syncSubmission');
export const saveSubmission = (value:SyncSubmission|null) => setSetting('syncSubmission',value);
export async function commitPullPage(checkpoint:unknown,scope?:string):Promise<void>{
  const db=await openDatabase(scope);try{await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction('settings','readwrite'),store=tx.objectStore('settings');
    store.put({key:'v4Checkpoint',value:checkpoint});store.delete('v4StagedPage');
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });}finally{db.close();}
}

const DOWNLOAD_PREFIX='sync-download:';
const DOWNLOAD_USAGE='syncDownloadCharacters';
const downloadPrefix=(key:string)=>DOWNLOAD_PREFIX+encodeURIComponent(key)+':';
const downloadId=(part:SyncDownloadPart)=>`${downloadPrefix(part.key)}${part.revision}:${part.hash}:${part.index}`;
const prefixRange=(prefix:string)=>IDBKeyRange.bound(prefix,prefix+'\uffff');
export async function getDownloadParts(key:string,revision:number,hash:string|null,scope?:string):Promise<SyncDownloadPart[]> {
  const rows=await storeRequest<Array<{key:string;value:SyncDownloadPart}>>('settings','readonly',store=>store.getAll(prefixRange(`${downloadPrefix(key)}${revision}:${hash}:`)),scope);
  return rows.map(row=>row.value);
}
/** Per-part rows avoid rewriting an entire multi-megabyte download per chunk.
 * The cache and its budget change atomically, even across overlapping workers.
 */
export async function saveDownloadPart(part:SyncDownloadPart,scope?:string):Promise<void> {
  if(part.data.length>160_000)throw Error('同步分片缓存超过上限。');
  const db=await openDatabase(scope);
  try { await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction('settings','readwrite'),store=tx.objectStore('settings'),id=downloadId(part);
    const usage=store.get(DOWNLOAD_USAGE);
    usage.onsuccess=()=>{
      const existing=store.get(id);
      existing.onsuccess=()=>{
        const used=usage.result?.value??0;
        const invalidUsage=!Number.isSafeInteger(used)||used<0||used>32_000_000;
        const next=Math.max(0,Number(used)-Number(existing.result?.value?.data?.length??0))+part.data.length;
        const put=()=>store.put({key:id,value:part});
        if(invalidUsage||next>32_000_000) {
          const keys=store.getAllKeys(prefixRange(DOWNLOAD_PREFIX));
          keys.onsuccess=()=>{for(const key of keys.result)store.delete(key);put();store.put({key:DOWNLOAD_USAGE,value:part.data.length});};
        } else {put();store.put({key:DOWNLOAD_USAGE,value:next});}
      };
    };
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??Error('同步缓存写入中止。'));
  }); } finally {db.close();}
}
export async function clearDownload(key:string,scope?:string):Promise<void> {
  const db=await openDatabase(scope);
  try {await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction('settings','readwrite'),store=tx.objectStore('settings');let removed=0;
    const cursor=store.openCursor(prefixRange(downloadPrefix(key)));
    cursor.onsuccess=()=>{const row=cursor.result;if(row){removed+=typeof row.value?.value?.data==='string'?row.value.value.data.length:0;row.delete();row.continue();}
      else {const usage=store.get(DOWNLOAD_USAGE);usage.onsuccess=()=>store.put({key:DOWNLOAD_USAGE,value:Math.max(0,Number(usage.result?.value??0)-removed)});}};
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??Error('同步缓存清理中止。'));
  });}finally{db.close();}
}

export async function getOrCreateDeviceId(scope=account?`${DB_NAME}:${account}`:DB_NAME): Promise<string> {
  const db=await openDatabase(scope);try{return await new Promise<string>((resolve,reject)=>{
    const tx=db.transaction('settings','readwrite'),store=tx.objectStore('settings'),read=store.get('deviceId');let id='';
    read.onsuccess=()=>{id=read.result?.value??crypto.randomUUID();if(!read.result)store.put({key:'deviceId',value:id});};
    tx.oncomplete=()=>resolve(id);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });}finally{db.close();}
}

export async function bindSyncUser(userId: string | null): Promise<void> {
  // A temporary Auth outage can render the portal without claims. Never erase
  // pending writes or their cloud base merely because that request failed.
  if (!userId) return;
  if(account===userId&&(await getSetting<{verified?:boolean}>('repositoryMigration'))?.verified)return;
  const legacy=await openDatabase(DB_NAME);
  let rows=await new Promise<Record<string,unknown[]>>((resolve,reject)=>{
    const tx=legacy.transaction(['outbox','metadata','conflicts','settings','documents'],'readonly'),result:Record<string,unknown[]>={};
    for(const name of ['outbox','metadata','conflicts','settings','documents']){const request=tx.objectStore(name).getAll();request.onsuccess=()=>{result[name]=request.result;};}
    tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  }).finally(()=>legacy.close());
  const owner=(rows.settings as Array<{key:string;value:unknown}>).find(r=>r.key==='activeUserId')?.value;
  if(owner&&owner!==userId)rows={outbox:[],metadata:[],conflicts:[],settings:[],documents:[]};
  account=userId;
  if(!(await getSetting<{verified?:boolean}>('repositoryMigration'))?.verified){
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalJson(rows)));
    const fingerprint=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
    const db=await openDatabase();
    try{await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction(['outbox','metadata','conflicts','settings','documents'],'readwrite');
      for(const [name,values] of Object.entries(rows))for(const row of values)tx.objectStore(name).put(row);
      tx.objectStore('settings').put({key:'activeUserId',value:userId});
      tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });
    const restored=await new Promise<Record<string,unknown[]>>((resolve,reject)=>{
      const tx=db.transaction(['outbox','metadata','conflicts','settings','documents'],'readonly'),result:Record<string,unknown[]>={};
      for(const name of Object.keys(rows)){
        const keyOf=(row:unknown)=>{const r=row as {id?:unknown;key?:unknown;operationId?:unknown};return name==='conflicts'?r.operationId:name==='outbox'?r.id:r.key;};
        const expected=new Set(rows[name].map(keyOf)),read=tx.objectStore(name).getAll();
        read.onsuccess=()=>{result[name]=read.result.filter(row=>expected.has(keyOf(row)));};
      }
      tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });
    const actual=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalJson(restored)));
    if(Array.from(new Uint8Array(actual),n=>n.toString(16).padStart(2,'0')).join('')!==fingerprint)throw Error('本机迁移校验未通过，旧仓库保留。');
    await setSetting('repositoryMigration',{owner:userId,fingerprint,verified:true,counts:Object.fromEntries(Object.entries(rows).map(([k,v])=>[k,v.length]))});
    }finally{db.close();}
  }
}
export function activateGuestRepository(){account='guest';}
/** A worker retains its account even if the UI switches accounts mid-request. */
export function accountSyncStore(userId:string){
  const scope=`${DB_NAME}:${userId}`;
  return {
    getOutbox:()=>getOutbox(scope),getMetadata:()=>getMetadata(scope),saveMetadata:(r:SyncRecord)=>saveMetadata(r,scope),
    queueOperation:(o:SyncOperation)=>queueOperation(o,scope),replaceOperation:(o:SyncOperation,n:SyncOperation|null)=>replaceOperation(o,n,scope),
    acknowledgeOperation:(o:SyncOperation,r:SyncRecord)=>acknowledgeOperation(o,r,undefined,scope),
    getConflicts:()=>getConflicts(scope),saveConflict:(c:SyncConflict)=>saveConflict(c,scope),removeConflict:(id:string)=>removeConflict(id,scope),
    getSetting:<T>(key:string)=>getSetting<T>(key,scope),setSetting:(key:string,value:unknown)=>setSetting(key,value,scope),
    getSubmission:()=>getSetting<SyncSubmission>('syncSubmission',scope),saveSubmission:(v:SyncSubmission|null)=>setSetting('syncSubmission',v,scope),
    getDownloadParts:(key:string,revision:number,hash:string|null)=>getDownloadParts(key,revision,hash,scope),
    saveDownloadPart:(p:SyncDownloadPart)=>saveDownloadPart(p,scope),clearDownload:(key:string)=>clearDownload(key,scope),
    commitPullPage:(checkpoint:unknown)=>commitPullPage(checkpoint,scope),getOrCreateDeviceId:()=>getOrCreateDeviceId(scope),
  };
}
export async function projectionOwner(userId?:string):Promise<string|null>{
  const db=await openDatabase(DB_NAME);try{return await new Promise<string|null>((resolve,reject)=>{
    const tx=db.transaction('settings',userId===undefined?'readonly':'readwrite'),store=tx.objectStore('settings');let result:string|null=null;
    if(userId!==undefined){store.put({key:'projectionOwner',value:userId});result=userId;}
    else{const read=store.get('projectionOwner');read.onsuccess=()=>{if(read.result?.value)result=read.result.value;else{const legacy=store.get('activeUserId');legacy.onsuccess=()=>{result=legacy.result?.value??null;};}};}
    tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });}finally{db.close();}
}

const parseDocument=(value:string|null):unknown=>{if(value===null)return null;try{return JSON.parse(value);}catch{return value;}};
/** The document and upload intent commit together; localStorage is only a projection. */
export async function persistDocument(key:string,value:string|null,queue=true,expected?:string|null):Promise<boolean> {
  if(!isSyncableStorageKey(key))throw Error('此键不属于同步数据。');
  if(!queue&&account&&isSyncLeaseLost(`recovery:${account}:workspace`))throw Error('同步租约已过期，本机内容保留。');
  const db=await openDatabase();let applied=false;
  try{return await new Promise<boolean>((resolve,reject)=>{
    const tx=db.transaction(['documents','outbox','metadata','settings'],'readwrite');
    const docs=tx.objectStore('documents'),outbox=tx.objectStore('outbox'),settings=tx.objectStore('settings');
    const current=docs.get(key),base=tx.objectStore('metadata').get(key),pending=outbox.getAll(),counter=settings.get('operationSequence');
    let done=0;const write=()=>{if(++done!==4)return;try{
      if(expected!==undefined&&current.result&&current.result.value!==expected){
        if(!queue)return;
        const merged=threeWayMerge(parseDocument(expected),parseDocument(value),parseDocument(current.result.value));
        if(merged.conflicts.length){tx.abort();reject(Error('另一标签页修改了相同内容，草稿已保留，请处理本机冲突。'));return;}
        value=merged.merged===undefined?null:typeof merged.merged==='string'?merged.merged:JSON.stringify(merged.merged);
      }
      const previous=current.result?.value??null;
      docs.put({...current.result,key,value,updatedAt:Date.now()});applied=true;
      if(!queue||previous===value)return;
      const metadata=base.result as SyncRecord|undefined;
      const same=(metadata?.deleted??true)===(value===null)&&canonicalJson(metadata?.deleted?null:metadata?.value??null)===canonicalJson(parseDocument(value));
      const matches=(pending.result as SyncOperation[]).filter(op=>op.key===key);
      if(!matches.length&&same)return;
      const sequence=Math.max(counter.result?.value??0,0,...pending.result.map((op:SyncOperation)=>op.sequence??0))+1;
      if(!Number.isSafeInteger(sequence)){tx.abort();return;}
      const operation:SyncOperation={id:crypto.randomUUID(),key,baseRevision:metadata?.revision??0,baseHash:metadata?.contentHash??null,
        baseValue:metadata?.deleted?null:metadata?.value??null,baseDeleted:metadata?.deleted??true,value:parseDocument(value),deleted:value===null,
        clientUpdatedAt:new Date().toISOString(),sequence};
      const compacted=compactSyncOperations([...matches,operation])[0];
      for(const row of matches)outbox.delete(row.id);outbox.put(compacted);settings.put({key:'operationSequence',value:sequence});
    }catch(error){tx.abort();reject(error);}};
    current.onsuccess=write;base.onsuccess=write;pending.onsuccess=write;counter.onsuccess=write;
    tx.oncomplete=()=>resolve(applied);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??Error('本机保存未完成，修改未确认。'));
  });}finally{db.close();}
}
export const getDocuments=()=>storeRequest<Array<{key:string;value:string|null;projectedValue?:string|null}>>('documents','readonly',store=>store.getAll());
export async function markDocumentProjected(key:string,value:string|null):Promise<void>{
  const db=await openDatabase();try{await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction('documents','readwrite'),store=tx.objectStore('documents'),read=store.get(key);
    read.onsuccess=()=>{if(read.result?.value===value)store.put({...read.result,projectedValue:value});};
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });}finally{db.close();}
}
export async function evictDownloadCache():Promise<void>{
  const db=await openDatabase();try{await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction('settings','readwrite'),store=tx.objectStore('settings'),keys=store.getAllKeys(prefixRange(DOWNLOAD_PREFIX));
    keys.onsuccess=()=>{for(const key of keys.result)store.delete(key);store.put({key:DOWNLOAD_USAGE,value:0});};
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });}finally{db.close();}
}

/** IndexedDB lease is the fallback when Web Locks is unavailable. */
export async function withSyncLease<T>(key:string,work:()=>Promise<T>,scope?:string):Promise<T|undefined> {
  const owner=crypto.randomUUID(),db=await openDatabase(scope);let token=0,lost=false;
  const lease=async(acquire:boolean)=>new Promise<boolean>((resolve,reject)=>{
    const tx=db.transaction('leases','readwrite'),store=tx.objectStore('leases'),read=store.get(key);let granted=false;
    read.onsuccess=()=>{const row=read.result,now=Date.now();if(acquire?(!row||row.until<=now):row?.owner===owner&&row?.token===token&&row.until>now){token=acquire?(row?.token??0)+1:token;store.put({key,owner,token,until:now+120_000});granted=true;}};
    tx.oncomplete=()=>resolve(granted);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
  try{if(!await lease(true))return;const state={lost:false,until:Date.now()+120_000};activeLeases.set(key,state);
    const timer=setInterval(()=>{void lease(false).then(ok=>{lost||=!ok;state.lost=lost;if(ok)state.until=Date.now()+120_000;}).catch(()=>{lost=true;state.lost=true;});},20_000);
    try{const result=await work();if(lost)throw Error('同步租约已交接，结果将在下一轮核对。');return result;}
    finally{clearInterval(timer);activeLeases.delete(key);await new Promise<void>((resolve,reject)=>{const tx=db.transaction('leases','readwrite'),store=tx.objectStore('leases'),read=store.get(key);read.onsuccess=()=>{if(read.result?.owner===owner)store.put({...read.result,until:0});};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}
  }finally{db.close();}
}
