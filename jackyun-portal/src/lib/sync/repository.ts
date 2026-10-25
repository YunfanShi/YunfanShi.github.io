'use client';
import { isSyncableStorageKey, CLOUD_STATE_APPLIED_EVENT } from '../local-workspace.ts';
import { bindSyncUser, getDocuments, persistDocument, activateGuestRepository,evictDownloadCache,markDocumentProjected,projectionOwner } from './outbox.ts';

const projection=()=>window.localStorage;
const memory=new Map<string,string|null>();
let tail:Promise<void>=Promise.resolve(),ready:Promise<void>|null=null,failed:unknown=null,pending=0;
let currentOwner:string|null|undefined;
let saveState:'saving'|'saved'|'storage_error'|'projection_degraded'='saving';
export const getLocalSaveState=()=>saveState;
const failures=new Map<string,{value:string|null;error:unknown;expected?:string|null}>();
export const LOCAL_DURABILITY_EVENT='jackyun-local-durability';
function status(state:'saving'|'saved'|'storage_error'|'projection_degraded') {
  saveState=state;
  window.dispatchEvent(new CustomEvent(LOCAL_DURABILITY_EVENT,{detail:{state,pending}}));
}
async function project(key:string,value:string|null) {
  try{if(value===null)projection().removeItem(key);else projection().setItem(key,value);await markDocumentProjected(key,value);}
  catch{status('projection_degraded');} // The authoritative IDB commit already succeeded.
}
export function initializeRepository(userId:string|null):Promise<void> {
  if(ready&&currentOwner===userId)return ready;
  const previous=ready;currentOwner=userId;
  ready=(async()=>{
    if(previous)await previous;
    const projectedOwner=await projectionOwner();
    if(projectedOwner&&projectedOwner!==(userId??'guest')){
      if(pending)throw Error('账户切换前仍有本机保存操作，请保留页面并导出恢复副本。');
      await bindSyncUser(projectedOwner);
      const originals=new Map((await getDocuments()).map(row=>[row.key,row]));
      const keys=Array.from({length:projection().length},(_,i)=>projection().key(i));
      // Save any last legacy-page edits back to their original account first.
      for(const key of keys)if(key&&isSyncableStorageKey(key)){
        const value=projection().getItem(key),row=originals.get(key);
        if(row&&value===row.projectedValue)continue;
        if(row&&value!==row.value&&row.projectedValue===undefined)throw Error('旧账号存在未核对的本机副本，请先导出并切回原账号。');
        await persistDocument(key,value,true,row?.projectedValue);
      }
      for(const key of keys)if(key&&isSyncableStorageKey(key))projection().removeItem(key);
      memory.clear();
    }
    if(userId)await bindSyncUser(userId);else activateGuestRepository();
    await projectionOwner(userId??'guest');
    const documents=await getDocuments(),known=new Set(documents.map(row=>row.key));
    const imported:Array<{key:string;value:string}>=[];
    for(let i=0;i<projection().length;i++){const key=projection().key(i);if(key&&isSyncableStorageKey(key)&&!known.has(key)){
      const value=projection().getItem(key);if(value!==null)imported.push({key,value});
    }}
    for(const row of imported)await persistDocument(row.key,row.value,Boolean(userId));
    // Re-read after migration; documents and queued operations are authoritative.
    for(const row of projectedOwner===(userId??'guest')?await getDocuments():[]){
      const native=projection().getItem(row.key);
      if(native!==row.value&&native!==row.projectedValue&&row.projectedValue!==undefined){
        // A legacy iframe may have saved immediately before a browser crash.
        // Rebase that edit against its last projected base instead of dropping it.
        await persistDocument(row.key,native,Boolean(userId),row.projectedValue);
      }
    }
    for(const row of await getDocuments()){if(!memory.has(row.key))memory.set(row.key,row.value);await project(row.key,row.value);}
    await projectionOwner(userId??'guest');
    window.addEventListener('storage',event=>{
      if(event.key&&isSyncableStorageKey(event.key)&&event.storageArea===projection()){
        const key=event.key;
        void (async()=>{if(await projectionOwner()!==(currentOwner??'guest'))throw Error('另一标签页已切换账号，当前草稿保留，请下载恢复副本。');return getDocuments();})().then(rows=>{
          const row=rows.find(row=>row.key===key);
          if(row&&(row.value===event.newValue||row.projectedValue===event.newValue)){
            memory.set(key,row.value);
            window.dispatchEvent(new CustomEvent(CLOUD_STATE_APPLIED_EVENT,{detail:{source:'repository',keys:[key]}}));return;
          }
          memory.set(key,event.newValue);enqueue(key,event.newValue,event.oldValue);
        }).catch(error=>{failed=error;status('storage_error');});
      }
    });
    failed=failures.values().next().value?.error??null;
    if(!pending&&!failed)status('saved');
    window.dispatchEvent(new CustomEvent(CLOUD_STATE_APPLIED_EVENT,{detail:{source:'repository',keys:[...memory.keys()]}}));
  })().catch(error=>{ready=null;failed=error;status('storage_error');throw error;});
  return ready;
}
function enqueue(key:string,value:string|null,expected?:string|null) {
  pending++;status('saving');
  tail=tail.catch(()=>{}).then(async()=>{
    if(ready)await ready;
    if(await projectionOwner()!==(currentOwner??'guest'))throw Error('当前账号已在另一标签页切换，本机草稿保留。');
    try{await persistDocument(key,value,true,expected);}catch(error){
      if((error as {name?:string}).name!=='QuotaExceededError')throw error;
      await evictDownloadCache();await persistDocument(key,value,true,expected);
    }
    const row=(await getDocuments()).find(row=>row.key===key);
    if(row){if(memory.get(key)===value)memory.set(key,row.value);await project(key,row.value);}
    failures.delete(key);failed=failures.values().next().value?.error??null;
  }).catch(error=>{failures.set(key,{value,error,expected});failed=error;status('storage_error');}).finally(()=>{pending--;if(!pending&&!failed)status('saved');});
}
export async function flushLocalWrites():Promise<void>{
  await tail;
  if(failures.size&&ready){for(const [key,draft]of [...failures])enqueue(key,draft.value,draft.expected);await tail;}
  if(failed)throw failed;
}
/** Legacy readers see pending drafts immediately; saved is announced only after IDB commit. */
export const workspaceStorage={
  flush:flushLocalWrites,
  snapshot():Record<string,string>{
    const result:Record<string,string>={};
    for(let i=0,length=projection().length;i<length;i++){const key=projection().key(i);if(key&&isSyncableStorageKey(key)){const value=projection().getItem(key);if(value!==null)result[key]=value;}}
    for(const [key,value]of memory){if(value===null)delete result[key];else result[key]=value;}
    return result;
  },
  getItem(key:string):string|null {return isSyncableStorageKey(key)&&memory.has(key)?memory.get(key)??null:projection().getItem(key);},
  setItem(key:string,value:string):void {value=String(value);if(!isSyncableStorageKey(key)){projection().setItem(key,value);return;}const previous=workspaceStorage.getItem(key);memory.set(key,value);enqueue(key,value,previous);},
  removeItem(key:string):void {if(!isSyncableStorageKey(key)){projection().removeItem(key);return;}const previous=workspaceStorage.getItem(key);memory.set(key,null);enqueue(key,null,previous);},
  key(index:number):string|null {return [...new Set([...Array.from({length:projection().length},(_,i)=>projection().key(i)).filter((key):key is string=>key!==null),...memory.keys()])].filter(key=>workspaceStorage.getItem(key)!==null)[index]??null;},
  get length():number {return new Set([...Array.from({length:projection().length},(_,i)=>projection().key(i)).filter((key):key is string=>key!==null&&workspaceStorage.getItem(key)!==null),...[...memory].filter(([,value])=>value!==null).map(([key])=>key)]).size;},
};
/** Remote application persists first, then updates the compatibility projection. */
export async function applyRepositoryRecord(key:string,value:string|null,expected?:string|null):Promise<void>{
  await flushLocalWrites();if(!await persistDocument(key,value,false,expected))throw Error('本机内容已变化，云端应用推迟到下一轮。');memory.set(key,value);await project(key,value);
}
export function exportLocalRecovery():string {
  const native:Record<string,string>={};
  try{for(let i=0;i<projection().length;i++){const key=projection().key(i);if(key&&isSyncableStorageKey(key)){const value=projection().getItem(key);if(value!==null)native[key]=value;}}}catch{}
  return JSON.stringify({version:1,exportedAt:new Date().toISOString(),values:Object.fromEntries(memory),compatibilityProjection:native},null,2);
}
