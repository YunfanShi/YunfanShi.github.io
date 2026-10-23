'use client';

import type { SyncConflict, SyncOperation, SyncRecord,SyncSubmission,SyncDownloadPart } from '@/types/sync';
import { compactSyncOperations } from '@/lib/sync/batch';
import { reconcileAcknowledgment } from '@/lib/sync/acknowledgment';

const DB_NAME = 'jackyun-sync-v2';
const DB_VERSION = 1;
export type SyncMetadata = SyncRecord;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('metadata')) db.createObjectStore('metadata', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('conflicts')) db.createObjectStore('conflicts', { keyPath: 'operationId' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeRequest<T>(storeName: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
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

export function getOutbox(): Promise<SyncOperation[]> {
  return storeRequest('outbox', 'readonly', (store) => store.getAll());
}

async function updateOutbox(action: (store: IDBObjectStore, operations: SyncOperation[], lastSequence: number) => SyncOperation[]): Promise<SyncOperation[]> {
  const db = await openDatabase();
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

export async function queueOperation(operation: SyncOperation): Promise<void> {
  await updateOutbox((store, operations,lastSequence) => {
    const matching = operations.filter((item) => item.key === operation.key);
    const sequence = lastSequence+1;
    if(!Number.isSafeInteger(sequence))throw Error('同步操作编号超过上限');
    const next = compactSyncOperations([...matching, {...operation,sequence}])[0];
    for (const previous of matching) store.delete(previous.id);
    store.put(next);
    return [next];
  });
}

/** CAS for local intent: a different tab's newer edit cannot be acknowledged away. */
export async function replaceOperation(sent: SyncOperation, next: SyncOperation | null): Promise<boolean> {
  let replaced = false;
  await updateOutbox((store,operations) => {
    const current = operations.find(op=>op.id === sent.id);
    if (!current || current.baseRevision !== sent.baseRevision || current.baseHash !== sent.baseHash || current.sequence !== sent.sequence
      || reconcileAcknowledgment(current,sent,{key:sent.key,value:null,revision:0,contentHash:null,deleted:false,updatedAt:sent.clientUpdatedAt},'unused')) return operations;
    store.delete(sent.id);
    if (next) store.put({...next,sequence:next.sequence ?? current.sequence});
    replaced = true;
    return operations.filter(op=>op.id !== sent.id).concat(next ? [next] : []);
  });
  return replaced;
}

export async function removeOperation(id: string): Promise<void> {
  await storeRequest('outbox', 'readwrite', (store) => store.delete(id));
}

/** Atomically acknowledge only the uploaded edit, retaining concurrent edits. */
export async function acknowledgeOperation(sent: SyncOperation, cloud: SyncRecord, resolvesOperationId?: string): Promise<boolean> {
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
  });
  return removed;
}

export function getMetadata(): Promise<SyncMetadata[]> {
  return storeRequest('metadata', 'readonly', (store) => store.getAll());
}

export async function saveMetadata(metadata: SyncMetadata): Promise<void> {
  await storeRequest('metadata', 'readwrite', (store) => store.put(metadata));
}

export function getConflicts(): Promise<SyncConflict[]> {
  return storeRequest('conflicts', 'readonly', (store) => store.getAll());
}

export async function saveConflict(conflict: SyncConflict): Promise<void> {
  await storeRequest('conflicts', 'readwrite', (store) => store.put(conflict));
}

export async function removeConflict(operationId: string): Promise<void> {
  await storeRequest('conflicts', 'readwrite', (store) => store.delete(operationId));
}

export async function clearConflicts(): Promise<void> {
  await storeRequest('conflicts', 'readwrite', (store) => store.clear());
}

export async function getSetting<T>(key: string): Promise<T | null> {
  const row = await storeRequest<{ key: string; value: T } | undefined>('settings', 'readonly', (store) => store.get(key));
  return row?.value ?? null;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await storeRequest('settings', 'readwrite', (store) => store.put({ key, value }));
}

export const getSubmission = () => getSetting<SyncSubmission>('syncSubmission');
export const saveSubmission = (value:SyncSubmission|null) => setSetting('syncSubmission',value);

const DOWNLOAD_PREFIX='sync-download:';
const DOWNLOAD_USAGE='syncDownloadCharacters';
const downloadPrefix=(key:string)=>DOWNLOAD_PREFIX+encodeURIComponent(key)+':';
const downloadId=(part:SyncDownloadPart)=>`${downloadPrefix(part.key)}${part.revision}:${part.hash}:${part.index}`;
const prefixRange=(prefix:string)=>IDBKeyRange.bound(prefix,prefix+'\uffff');
export async function getDownloadParts(key:string,revision:number,hash:string|null):Promise<SyncDownloadPart[]> {
  const rows=await storeRequest<Array<{key:string;value:SyncDownloadPart}>>('settings','readonly',store=>store.getAll(prefixRange(`${downloadPrefix(key)}${revision}:${hash}:`)));
  return rows.map(row=>row.value);
}
/** Per-part rows avoid rewriting an entire multi-megabyte download per chunk.
 * The cache and its budget change atomically, even across overlapping workers.
 */
export async function saveDownloadPart(part:SyncDownloadPart):Promise<void> {
  if(part.data.length>160_000)throw Error('同步分片缓存超过上限。');
  const db=await openDatabase();
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
export async function clearDownload(key:string):Promise<void> {
  const db=await openDatabase();
  try {await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction('settings','readwrite'),store=tx.objectStore('settings');let removed=0;
    const cursor=store.openCursor(prefixRange(downloadPrefix(key)));
    cursor.onsuccess=()=>{const row=cursor.result;if(row){removed+=typeof row.value?.value?.data==='string'?row.value.value.data.length:0;row.delete();row.continue();}
      else {const usage=store.get(DOWNLOAD_USAGE);usage.onsuccess=()=>store.put({key:DOWNLOAD_USAGE,value:Math.max(0,Number(usage.result?.value??0)-removed)});}};
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??Error('同步缓存清理中止。'));
  });}finally{db.close();}
}

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await getSetting<string>('deviceId');
  if (existing) return existing;
  const id = crypto.randomUUID();
  await setSetting('deviceId', id);
  return id;
}

export async function bindSyncUser(userId: string | null): Promise<void> {
  // A temporary Auth outage can render the portal without claims. Never erase
  // pending writes or their cloud base merely because that request failed.
  if (!userId) return;
  const existing = await getSetting<string>('activeUserId');
  if (existing && existing !== userId) {
    throw new Error('此设备保留着另一账户的待同步数据；请先切回原账户并完成同步。');
  }
  await setSetting('activeUserId', userId);
}
