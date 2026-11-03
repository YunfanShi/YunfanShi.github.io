import { threeWayMerge } from './merge.ts';

export interface LocalEditStorage { getItem(key:string):string|null; setItem(key:string,value:string):void }
export const LOCAL_CONFLICT_PREFIX = 'jackyun_debug_unsaved_edit:';
const RECOVERY_DB = 'jackyun-local-edit-recovery-v1';
const RECOVERY_STORE = 'conflicts';
type LocalEditConflictSnapshot = { base:unknown;local:unknown;remote:unknown;paths:string[] };
const memoryRecovery = new Map<string,LocalEditConflictSnapshot>();
export class LocalEditConflict extends Error {
  key:string;paths:string[];recoverySnapshot?:LocalEditConflictSnapshot;
  constructor(key:string, paths:string[], recoverySnapshot?:LocalEditConflictSnapshot) { super('其他标签页也修改了相同内容。冲突副本已保存在本机，请先下载未保存修改，再处理冲突。');this.key=key;this.paths=paths;this.recoverySnapshot=recoverySnapshot; }
}
export function parseLocalValue(raw:string|null):unknown {
  if (raw === null) return undefined;
  try { return JSON.parse(raw); } catch { throw Error('本机数据无法解析，未覆盖原内容。'); }
}

function openRecoveryDatabase():Promise<IDBDatabase> {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(RECOVERY_DB,1);
    request.onupgradeneeded=()=>request.result.createObjectStore(RECOVERY_STORE,{keyPath:'key'});
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error??Error('本机冲突恢复存储无法打开。'));
  });
}
async function saveConflictRecovery(key:string,snapshot:LocalEditConflictSnapshot):Promise<void> {
  const db=await openRecoveryDatabase();
  await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(RECOVERY_STORE,'readwrite');
    tx.objectStore(RECOVERY_STORE).put({key,snapshot,savedAt:new Date().toISOString()});
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error??Error('本机冲突副本保存失败。'));
    tx.onabort=()=>reject(tx.error??Error('本机冲突副本保存失败。'));
  }).finally(()=>db.close());
}
async function loadConflictRecovery(key:string):Promise<LocalEditConflictSnapshot|undefined> {
  const db=await openRecoveryDatabase();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(RECOVERY_STORE,'readonly');
    const request=tx.objectStore(RECOVERY_STORE).get(key);
    request.onsuccess=()=>resolve(request.result?.snapshot as LocalEditConflictSnapshot|undefined);
    request.onerror=()=>reject(request.error??Error('本机冲突副本读取失败。'));
    tx.oncomplete=()=>db.close();
    tx.onerror=()=>{db.close();reject(tx.error??Error('本机冲突副本读取失败。'));};
    tx.onabort=()=>{db.close();reject(tx.error??Error('本机冲突副本读取失败。'));};
  });
}
export async function readLocalEditConflict(storage:LocalEditStorage,key:string):Promise<LocalEditConflictSnapshot|unknown|undefined> {
  const raw=storage.getItem(LOCAL_CONFLICT_PREFIX+key);
  if(raw!==null)return parseLocalValue(raw);
  try { return await loadConflictRecovery(key) ?? memoryRecovery.get(key); }
  catch { return memoryRecovery.get(key); }
}
function isQuotaExceeded(error:unknown):boolean {
  return Boolean(error&&typeof error==='object'&&'name'in error&&(error as {name?:unknown}).name==='QuotaExceededError');
}

/** All Schedule writers share this lock, including resumable-study completion. */
export async function persistLocalEdit(storage:LocalEditStorage,key:string,base:unknown,next:unknown,
  lock?: <T>(name:string,work:()=>Promise<T>)=>Promise<T>):Promise<unknown> {
  const work=async()=>{
    try {
      const result=persistLocalEditNow(storage,key,base,next);
      if('flush'in storage)await (storage as LocalEditStorage&{flush:()=>Promise<void>}).flush();
      return result;
    } catch(error) {
      if(error instanceof LocalEditConflict&&error.recoverySnapshot) {
        try { await saveConflictRecovery(key,error.recoverySnapshot); error.message='检测到其他标签页也修改了相同内容。副本已保存到本机恢复存储，请先下载未保存修改，再处理冲突。'; }
        catch { error.message='检测到其他标签页也修改了相同内容，但浏览器存储空间已满。冲突副本暂存在当前页面内存，请立即下载后再处理。'; }
      }
      throw error;
    }
  };
  return lock ? lock('jackyun:local-edit:'+key,work) : work();
}

export function persistLocalEditNow(storage:LocalEditStorage,key:string,base:unknown,next:unknown):unknown {
    const current=parseLocalValue(storage.getItem(key));
    const result=threeWayMerge(base,next,current);
    if(result.conflicts.length){
      // Excluded from cloud sync by the sensitive/debug key filter. Never silently
      // discard a React draft or use its timestamp to replace the other tab.
      const snapshot={base,local:next,remote:current,paths:result.conflicts};
      try { storage.setItem(LOCAL_CONFLICT_PREFIX+key,JSON.stringify(snapshot)); }
      catch(error) {
        if(!isQuotaExceeded(error))throw error;
        memoryRecovery.set(key,snapshot);
        throw new LocalEditConflict(key,result.conflicts,snapshot);
      }
      throw new LocalEditConflict(key,result.conflicts);
    }
    const serialized=JSON.stringify(result.merged);
    if(serialized===undefined)throw Error('页面数据无效，原内容已保留。');
    if(storage.getItem(key)!==serialized)storage.setItem(key,serialized);
    return result.merged;
}

/** Queue UI intents using the preceding UI candidate, rather than a base
 * captured while an earlier save is waiting. Merged remote-only fields are
 * preserved when the following candidate predates its predecessor's render. */
export function createLocalEditWriter(storage:LocalEditStorage,key:string,
  lock?: <T>(name:string,work:()=>Promise<T>)=>Promise<T>) {
  let submitted:unknown,initialized=false,pending=0;
  let tail:Promise<unknown>=Promise.resolve();
  return {
    write(base:unknown,next:unknown):Promise<unknown> {
      const previous=initialized?submitted:base;
      submitted=next;initialized=true;pending++;
      const job=tail.catch(()=>{}).then(()=>persistLocalEdit(storage,key,previous,next,lock));
      tail=job;
      return job.finally(()=>{pending--;});
    },
    reset(base:unknown) {if(!pending){submitted=base;initialized=true;}},
  };
}
