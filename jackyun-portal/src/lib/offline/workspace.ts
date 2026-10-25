'use client';

import {fetchAuthenticatedSync as fetchSyncWithTimeout} from '../sync/session-transport';
import { canonicalJson } from '../sync/hash.ts';
import { runScheduledSync,recoveryDelay,retryAfterMilliseconds } from '../sync/scheduler';

export type OfflineScope = 'tasks' | 'review' | 'reading';

export interface OfflineMutation {
  id: string;
  userId: string;
  kind: string;
  payload: Record<string, unknown>;
  createdAt: string;
  attemptCount?: number;
  nextAttemptAt?: string;
  lastError?: string;
  blocked?: boolean;
  sequence?: number;
}

interface SnapshotRow<T = unknown> {
  id: string;
  userId: string;
  scope: OfflineScope;
  value: T;
  updatedAt: string;
}

const DB_NAME = 'jackyun-offline-workspace';
const DB_VERSION = 1;
const USER_KEY = 'active-user';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact<T>(stores: string | string[], mode: IDBTransactionMode, run: (transaction: IDBTransaction) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(stores, mode);
      const request = run(transaction);
      let value: T;
      request.onsuccess = () => { value = request.result; };
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve(value);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('Offline database transaction aborted'));
    });
  } finally {
    db.close();
  }
}

async function clearStores(): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(['snapshots', 'outbox', 'settings'], 'readwrite');
      transaction.objectStore('snapshots').clear();
      transaction.objectStore('outbox').clear();
      transaction.objectStore('settings').clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('Offline database clear aborted'));
    });
  } finally {
    db.close();
  }
}

export async function bindOfflineWorkspaceUser(userId: string | null): Promise<void> {
  // Missing claims or intentional logout must not discard pending work.
  if (!userId) return;
  // Each row is keyed to its owner; changing the active view never clears another queue.
  await transact('settings', 'readwrite', (transaction) => transaction.objectStore('settings').put({ key: USER_KEY, value: userId }));
}

export async function clearOfflineWorkspace(): Promise<void> {
  await clearStores();
}

export async function saveOfflineSnapshot<T>(userId: string, scope: OfflineScope, value: T): Promise<void> {
  const row: SnapshotRow<T> = { id: `${userId}:${scope}`, userId, scope, value, updatedAt: new Date().toISOString() };
  await transact('snapshots', 'readwrite', (transaction) => transaction.objectStore('snapshots').put(row));
  window.dispatchEvent(new CustomEvent('jackyun-offline-snapshot', { detail: { userId, scope, value } }));
}

export async function readOfflineSnapshot<T>(userId: string, scope: OfflineScope): Promise<T | null> {
  const row = await transact<SnapshotRow<T> | undefined>('snapshots', 'readonly', (transaction) => transaction.objectStore('snapshots').get(`${userId}:${scope}`));
  return row?.userId === userId ? row.value : null;
}
export const mutationScope=(operation:OfflineMutation):OfflineScope=>operation.kind.startsWith('review.')?'review':operation.kind.startsWith('task.')||operation.kind.startsWith('plan.')?'tasks':'reading';
/** A remote read cannot overwrite a local mutation queued while the network was in flight. */
export async function saveRemoteSnapshot(userId:string,scope:OfflineScope,value:unknown):Promise<boolean>{
  const db=await openDatabase();let applied=false;
  try{await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(['snapshots','outbox'],'readwrite'),pending=tx.objectStore('outbox').getAll();
    pending.onsuccess=()=>{if(pending.result.some((op:OfflineMutation)=>op.userId===userId&&mutationScope(op)===scope))return;
      tx.objectStore('snapshots').put({id:`${userId}:${scope}`,userId,scope,value,updatedAt:new Date().toISOString()});applied=true;};
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });}finally{db.close();}
  if(applied)window.dispatchEvent(new CustomEvent('jackyun-offline-snapshot',{detail:{userId,scope,value}}));
  return applied;
}

export async function queueOfflineMutation(userId: string, kind: string, payload: Record<string, unknown>): Promise<void> {
  const operation: OfflineMutation = { id: crypto.randomUUID(), userId, kind, payload, createdAt: new Date().toISOString() };
  await persistMutation(operation);
}

export async function listOfflineMutations(userId: string): Promise<OfflineMutation[]> {
  const rows = await transact<OfflineMutation[]>('outbox', 'readonly', (transaction) => transaction.objectStore('outbox').getAll());
  return rows.filter((row) => row.userId === userId).sort((a, b) => (a.sequence??0)-(b.sequence??0)||a.createdAt.localeCompare(b.createdAt));
}

export async function removeOfflineMutation(id: string): Promise<void> {
  await transact('outbox', 'readwrite', (transaction) => transaction.objectStore('outbox').delete(id));
  window.dispatchEvent(new CustomEvent('jackyun-offline-synced', { detail: { id } }));
}

export async function deferOfflineMutation(id: string, error: string, now = Date.now()): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('outbox', 'readwrite');
      const store = transaction.objectStore('outbox');
      const request = store.get(id);
      request.onsuccess = () => {
        const operation = request.result as OfflineMutation | undefined;
        if (!operation) return;
        const attemptCount = (operation.attemptCount ?? 0) + 1;
        const delay = recoveryDelay(attemptCount);
        store.put({ ...operation, attemptCount, nextAttemptAt: new Date(now + delay).toISOString(), lastError: error.slice(0, 240) });
      };
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('Offline retry schedule aborted'));
    });
  } finally { db.close(); }
}

class OfflineApiError extends Error {}

export async function runOfflineMutation(userId: string, kind: string, payload: Record<string, unknown>,options?:{operationId?:string;snapshot?:{scope:OfflineScope;value:unknown}}): Promise<'synced' | 'queued'> {
  const operation: OfflineMutation = { id: options?.operationId??crypto.randomUUID(), userId, kind, payload, createdAt: new Date().toISOString() };
  await persistMutation(operation,options?.snapshot); // Persist view + intent before the first network write.
  if (typeof navigator === 'undefined' || !navigator.onLine) {
    return 'queued';
  }
  try {
    const ran=await runScheduledSync('business',userId,async()=>{await submitOfflineOperation(operation);});
    return ran?'synced':'queued';
  } catch (error) {
    if (error instanceof OfflineApiError) {await blockOfflineMutation(operation);throw error;}
    await deferOfflineMutation(operation.id, error instanceof Error ? error.message : 'Network request failed');
    return 'queued';
  }
}

export function offlineEntity(operation:OfflineMutation):string {
  if(operation.kind==='task.create')return 'task:'+operation.id;
  return operation.kind.split('.')[0]+':'+String(operation.payload.taskId??operation.payload.reviewItemId??operation.payload.planId??operation.id);
}
export async function blockOfflineMutation(operation:OfflineMutation):Promise<void>{
  await persistMutation({...operation,blocked:true,lastError:'该操作被拒绝，请检查内容；原操作已保留。'});
}
export async function submitOfflineOperation(operation:OfflineMutation):Promise<void>{
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalJson({kind:operation.kind,payload:operation.payload})));
  const requestHash=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
  if(operation.attemptCount){
    const lookup=await fetchSyncWithTimeout('/api/offline/workspace?receipt='+encodeURIComponent(operation.id),{cache:'no-store'},false);
    if(!lookup.ok)throw Object.assign(Error('离线操作回执暂时不可用'),{status:lookup.status,retryAfterMs:retryAfterMilliseconds(lookup.headers.get('retry-after'))});
    const recovered=await lookup.json() as {receipt?:{operationId:string;requestHash:string;state:string}};
    if(recovered.receipt){
      if(recovered.receipt.operationId!==operation.id||recovered.receipt.requestHash!==requestHash||recovered.receipt.state!=='confirmed')throw new OfflineApiError('离线操作回执不匹配，原操作保留。');
      await removeOfflineMutation(operation.id);return;
    }
  }
  const response=await fetchSyncWithTimeout('/api/offline/workspace',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({operationId:operation.id,kind:operation.kind,payload:operation.payload,requestHash,expectedUserId:operation.userId})},false);
  if(!response.ok){
    const transient=response.status>=500||[408,429,401,403].includes(response.status);
    const error=transient?new Error('离线操作尚未确认'):new OfflineApiError('离线操作需要检查');
    throw Object.assign(error,{status:response.status,retryAfterMs:retryAfterMilliseconds(response.headers.get('retry-after'))});
  }
  const receipt=await response.json() as {operationId?:string;requestHash?:string;state?:string};
  if(receipt.operationId!==operation.id||receipt.requestHash!==requestHash||receipt.state!=='confirmed')throw Error('离线操作缺少有效回执，队列保留。');
  await removeOfflineMutation(operation.id);
}

async function persistMutation(operation: OfflineMutation,snapshot?:{scope:OfflineScope;value:unknown}): Promise<void> {
  const db=await openDatabase();
  try{await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(['outbox','settings','snapshots'],'readwrite'),store=tx.objectStore('outbox'),settings=tx.objectStore('settings');
    if(snapshot)tx.objectStore('snapshots').put({id:`${operation.userId}:${snapshot.scope}`,userId:operation.userId,scope:snapshot.scope,value:snapshot.value,updatedAt:new Date().toISOString()});
    const existing=store.get(operation.id);existing.onsuccess=()=>{try{
      if(existing.result){
        if(existing.result.userId!==operation.userId||existing.result.kind!==operation.kind||canonicalJson(existing.result.payload)!==canonicalJson(operation.payload)){tx.abort();return;}
        store.put({...operation,sequence:existing.result.sequence});return;
      }
      const counter=settings.get('sequence:'+operation.userId);counter.onsuccess=()=>{try{
        const sequence=(counter.result?.value??0)+1;if(!Number.isSafeInteger(sequence))throw Error('离线操作序号无效。');
        store.put({...operation,sequence});settings.put({key:'sequence:'+operation.userId,value:sequence});
      }catch(error){tx.abort();reject(error);}
      };
    }catch(error){tx.abort();reject(error);}};
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??Error('离线操作持久化失败。'));
  });}finally{db.close();}
  if(snapshot)window.dispatchEvent(new CustomEvent('jackyun-offline-snapshot',{detail:{userId:operation.userId,scope:snapshot.scope,value:snapshot.value}}));
  window.dispatchEvent(new CustomEvent('jackyun-offline-queued', { detail: operation }));
}
