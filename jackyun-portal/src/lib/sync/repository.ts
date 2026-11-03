'use client';
import { isSyncableStorageKey, CLOUD_STATE_APPLIED_EVENT } from '../local-workspace.ts';
import { bindSyncUser, getDocuments, persistDocument, activateGuestRepository,evictDownloadCache,projectionOwner,clearDocumentProjections } from './outbox.ts';
import {readLocalData,writeLocalData} from './local-data.ts';
import { SYNC_V5_SCHEDULE_SCOPES } from './resource-model.ts';

const memory=new Map<string,string|null>();
const localMemory=new Map<string,string|null>();
const preInitializationWrites=new Map<string,string|null>();
let tail:Promise<void>=Promise.resolve(),ready:Promise<void>|null=null,failed:unknown=null,pending=0;
let currentOwner:string|null|undefined;
let initialized=false;
let v5ScheduleAuthority=false;
let v5WorkspaceAuthorityKeys=new Set<string>();
let saveState:'saving'|'saved'|'storage_error'|'projection_degraded'='saving';
export const getLocalSaveState=()=>saveState;
export const isRepositoryInitialized=()=>initialized;
export function setV5ScheduleAuthority(scopes:readonly string[]):void{v5ScheduleAuthority=SYNC_V5_SCHEDULE_SCOPES.every(scope=>scopes.includes(scope));}
export function setV5WorkspaceAuthorityKeys(keys:readonly string[]):void{v5WorkspaceAuthorityKeys=new Set(keys);}
/** Long-running imports must retain their creating account, including after network waits. */
export async function captureRepositoryContext(){
  const initialization=ready??initializeRepository(currentOwner??null);
  await initialization;
  const owner=currentOwner??null;
  if(initialization!==ready||await projectionOwner()!==(owner??'guest'))throw Error('账号已变化，请重新打开当前页面。');
  return {owner,databaseScope:`jackyun-sync-v2:${owner??'guest'}`,
    assertCurrent(){if(currentOwner!==owner||ready!==initialization)throw Error('账号已变化，导入已停止。');}};
}
const failures=new Map<string,{value:string|null;error:unknown;expected?:string|null}>();
let compatibilityInstalled=false;
let crossTabChannel:BroadcastChannel|undefined;
let nativeLocalRemove:Storage['removeItem']|undefined;
let nativeLocalGet:Storage['getItem']|undefined;
let nativeLocalKey:Storage['key']|undefined;
let nativeLocalLength:(()=>number)|undefined;
const isManagedLocalKey=(key:string)=>!/^sb-.+-auth-token(?:-code-verifier)?$/.test(key);
export const LEGACY_MIGRATION_CONFLICT_PREFIX='jackyun_migration_conflict_v1:';
const migrationConflicts:string[]=[];
export function getLegacyMigrationConflicts():string[]{return [...migrationConflicts];}
export const LOCAL_DURABILITY_EVENT='jackyun-local-durability';
function status(state:'saving'|'saved'|'storage_error'|'projection_degraded') {
  saveState=state;
  window.dispatchEvent(new CustomEvent(LOCAL_DURABILITY_EVENT,{detail:{state,pending}}));
}
function notifyChanged(key:string,value:string|null,source='repository'):void {
  crossTabChannel?.postMessage({key,value,owner:currentOwner??'guest'});
  window.dispatchEvent(new CustomEvent(CLOUD_STATE_APPLIED_EVENT,{detail:{source,keys:[key]}}));
}
function markMigrationConflict(key:string,preservedKey:string):void {
  if(!migrationConflicts.includes(key))migrationConflicts.push(key);
  window.dispatchEvent(new CustomEvent('jackyun-local-migration-conflict',{detail:{key,preservedKey}}));
}
function readLegacyStorageValue(key:string):string|null {
  try{return nativeLocalGet?nativeLocalGet.call(window.localStorage,key):window.localStorage.getItem(key);}catch{return null;}
}
function readNativeLegacyEntries(storage:Storage):Array<[string,string]> {
  const entries:Array<[string,string]>=[];
  try{
    const total=storage===window.localStorage?(nativeLocalLength?nativeLocalLength.call(storage):storage.length):storage.length;
    for(let index=0;index<total;index++){
      const key=storage===window.localStorage?(nativeLocalKey?nativeLocalKey.call(storage,index):storage.key(index)):storage.key(index);
      if(!key||!isManagedLocalKey(key))continue;
      const value=storage===window.localStorage?readLegacyStorageValue(key):storage.getItem(key);
      if(value!==null)entries.push([key,value]);
    }
  }catch(error){throw error;}
  return entries;
}
function removeLegacyStorageValue(storage:Storage,key:string):void {
  if(nativeLocalRemove)nativeLocalRemove.call(storage,key);else storage.removeItem(key);
}
async function preserveLegacyValue(key:string,value:string,knownRows:Awaited<ReturnType<typeof readLocalData>>):Promise<void> {
  let row=knownRows.find(candidate=>candidate.key.startsWith(LEGACY_MIGRATION_CONFLICT_PREFIX)&&(()=>{
    try{const item=JSON.parse(candidate.value) as {sourceKey?:unknown;value?:unknown};return item.sourceKey===key&&item.value===value;}catch{return false;}
  })());
  if(!row){
    const suffix=typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function'?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const preservedKey=`${LEGACY_MIGRATION_CONFLICT_PREFIX}${encodeURIComponent(key)}:${suffix}`;
    const preservedValue=JSON.stringify({sourceKey:key,value,capturedAt:new Date().toISOString()});
    await writeLocalData(preservedKey,preservedValue);
    row=(await readLocalData()).find(candidate=>candidate.key===preservedKey);
    if(row?.value!==preservedValue)throw Error(`旧设备数据冲突副本校验失败，原数据仍保留：${key}`);
  }
  localMemory.set(row.key,row.value);
  markMigrationConflict(key,row.key);
}
async function applyPreInitializationWrites():Promise<void> {
  while(preInitializationWrites.size){
    const batch=[...preInitializationWrites];
    for(const [key,value] of batch){
      if(preInitializationWrites.get(key)!==value)continue;
      const target=isSyncableStorageKey(key)?memory:localMemory;
      const hadPrevious=target.has(key),previous=target.get(key)??null;
      if(isSyncableStorageKey(key)){
        if(previous!==null&&previous!==value)await preserveLegacyValue(key,previous,await readLocalData());
        const queueLegacy=!(key==='jackyun_schedule_control_v1'&&v5ScheduleAuthority)&&!v5WorkspaceAuthorityKeys.has(key);
        await persistDocument(key,value,queueLegacy,hadPrevious?previous:undefined);
        const stored=(await getDocuments()).find(row=>row.key===key);
        if(!stored)throw Error(`启动前修改迁移未验证：${key}`);
        if(stored.value!==value&&value!==null)await preserveLegacyValue(key,value,await readLocalData());
        memory.set(key,stored.value);
      }else{
        const rows=await readLocalData(),stored=rows.find(row=>row.key===key);
        if(stored&&stored.value!==value&&stored.value!==null)await preserveLegacyValue(key,stored.value,rows);
        await writeLocalData(key,value);
        const verified=(await readLocalData()).find(row=>row.key===key);
        if(value===null?Boolean(verified):verified?.value!==value)throw Error(`启动前本机修改迁移未验证：${key}`);
        localMemory.set(key,value);
      }
      if(preInitializationWrites.get(key)===value)preInitializationWrites.delete(key);
    }
  }
}
export function initializeRepository(userId:string|null):Promise<void> {
  if(ready&&currentOwner===userId)return ready;
  const previous=ready,previousWrites=tail;currentOwner=userId;
  initialized=false;
  ready=(async()=>{
    // Capture the actual browser values before awaiting anything. The compatibility
    // shim may already be buffering app writes, so its getItem/key methods are not
    // a valid source for the legacy migration snapshot.
    const legacy=window.localStorage;
    const startupLegacyEntries=readNativeLegacyEntries(legacy);
    if(previous)await previous;
    // Drain writes against their captured repository before changing the active DB.
    // A write cannot await this initialization while initialization waits for it.
    await previousWrites;
    if(failures.size)throw failures.values().next().value!.error;
    const projectedOwner=await projectionOwner();
    if(projectedOwner&&projectedOwner!==(userId??'guest')){
      await bindSyncUser(projectedOwner);
      const keys=startupLegacyEntries.map(([key])=>key);
      const oldDocuments=await getDocuments();
      for(const key of keys){if(!isSyncableStorageKey(key))continue;const value=startupLegacyEntries.find(([candidate])=>candidate===key)?.[1];if(value===undefined)continue;
        const row=oldDocuments.find(candidate=>candidate.key===key);
        if(row&&row.value!==value&&row.projectedValue!==value){if(row.projectedValue===undefined)await preserveLegacyValue(key,value,await readLocalData());else await persistDocument(key,value,true,row.projectedValue);}
        else if(!row)await persistDocument(key,value,true);
        const stored=(await getDocuments()).find(candidate=>candidate.key===key);
        if(!stored)throw Error(`旧账号数据迁移未验证：${key}`);
        if(stored.value!==value&&row?.projectedValue!==value)await preserveLegacyValue(key,value,await readLocalData());
        removeLegacyStorageValue(legacy,key);
      }
      await clearDocumentProjections(`jackyun-sync-v2:${projectedOwner}`);
      for(const key of memory.keys())if(isSyncableStorageKey(key))memory.delete(key);
    }
    if(userId)await bindSyncUser(userId);else activateGuestRepository();
    await projectionOwner(userId??'guest');
    const documents=await getDocuments(),known=new Map(documents.map(row=>[row.key,row.value]));
    const localRows=await readLocalData();localMemory.clear();
    for(const row of localRows)localMemory.set(row.key,row.value);
    const verifiedLegacyKeys=new Set<string>();
    for(const [key,value] of startupLegacyEntries){
      if(isSyncableStorageKey(key)){
        const row=documents.find(candidate=>candidate.key===key);
        let quarantinedLegacyValue=false;
        if(row&&row.value!==value&&row.projectedValue!==value){
          if(row.projectedValue===undefined){await preserveLegacyValue(key,value,localRows);quarantinedLegacyValue=true;}
          else await persistDocument(key,value,Boolean(userId),row.projectedValue);
        }else if(!known.has(key))await persistDocument(key,value,Boolean(userId));
        const stored=(await getDocuments()).find(row=>row.key===key);
        if(!stored)throw Error(`旧数据迁移未验证：${key}`);
        if(stored.value!==value&&row?.projectedValue!==value&&!quarantinedLegacyValue)await preserveLegacyValue(key,value,localRows);
        memory.set(key,stored.value);
      }else{
        if(localMemory.has(key)&&localMemory.get(key)!==value){
          await preserveLegacyValue(key,value,localRows);
        }
        if(!localMemory.has(key))await writeLocalData(key,value);
        const verified=(await readLocalData()).find(row=>row.key===key)?.value;
        if(verified!==value&&!localRows.some(row=>row.key===key&&row.value===verified))throw Error(`旧数据迁移未验证：${key}`);
        if(!localMemory.has(key))localMemory.set(key,verified??value);
      }
      verifiedLegacyKeys.add(key);
    }
    await clearDocumentProjections();
    for(const row of await getDocuments())memory.set(row.key,row.value);
    await projectionOwner(userId??'guest');
    await applyPreInitializationWrites();
    // No asynchronous work may follow this handoff. Calls arriving after this line
    // enqueue against the initialization promise; calls before it remain buffered.
    installStorageCompatibility();
    initialized=true;
    // Delete legacy copies only after every value has been confirmed in IndexedDB.
    for(const key of verifiedLegacyKeys)removeLegacyStorageValue(legacy,key);
    failed=failures.values().next().value?.error??null;
    if(!pending&&!failed)status('saved');
    window.dispatchEvent(new CustomEvent(CLOUD_STATE_APPLIED_EVENT,{detail:{source:'repository',keys:[...memory.keys()]}}));
  })().catch(error=>{initialized=false;ready=null;failed=error;status('storage_error');throw error;});
  return ready;
}
function enqueue(key:string,value:string|null,expected?:string|null) {
  const repositoryReady=ready??initializeRepository(currentOwner??null),owner=currentOwner;
  pending++;status('saving');
  tail=tail.catch(()=>{}).then(async()=>{
    if(repositoryReady)await repositoryReady;
    if(await projectionOwner()!==(owner??'guest'))throw Error('当前账号已在另一标签页切换，本机草稿保留。');
    const queueLegacy=!(key==='jackyun_schedule_control_v1'&&v5ScheduleAuthority)&&!v5WorkspaceAuthorityKeys.has(key);
    try{if(isSyncableStorageKey(key))await persistDocument(key,value,queueLegacy,expected);else await writeLocalData(key,value);}catch(error){
      if((error as {name?:string}).name!=='QuotaExceededError')throw error;
      await evictDownloadCache();if(isSyncableStorageKey(key))await persistDocument(key,value,queueLegacy,expected);else await writeLocalData(key,value);
    }
    if(isSyncableStorageKey(key)){const row=(await getDocuments()).find(row=>row.key===key);if(row&&memory.get(key)===value)memory.set(key,row.value);}
    notifyChanged(key,value);
    window.dispatchEvent(new Event('jackyun-sync-edit'));
    failures.delete(key);failed=failures.values().next().value?.error??null;
  }).catch(error=>{failures.set(key,{value,error,expected});failed=error;status('storage_error');}).finally(()=>{pending--;if(!pending&&!failed)status('saved');});
}
function installStorageCompatibility():void {
  if(compatibilityInstalled||typeof Storage==='undefined')return;
  compatibilityInstalled=true;
  const prototype=Storage.prototype,nativeGet=prototype.getItem,nativeSet=prototype.setItem,nativeRemove=prototype.removeItem,nativeClear=prototype.clear,nativeKey=prototype.key;
  let local:Storage;
  try{local=window.localStorage;}catch{compatibilityInstalled=false;return;}
  const nativeLength=Object.getOwnPropertyDescriptor(prototype,'length')?.get;
  nativeLocalRemove=nativeRemove;nativeLocalGet=nativeGet;nativeLocalKey=nativeKey;
  nativeLocalLength=nativeLength?()=>nativeLength.call(local):undefined;
  prototype.getItem=function(key:string){return this===local&&isManagedLocalKey(String(key))?workspaceStorage.getItem(String(key)):nativeGet.call(this,key);};
  prototype.setItem=function(key:string,value:string){if(this===local&&isManagedLocalKey(String(key))){workspaceStorage.setItem(String(key),String(value));return;}nativeSet.call(this,key,value);};
  prototype.removeItem=function(key:string){if(this===local&&isManagedLocalKey(String(key))){workspaceStorage.removeItem(String(key));return;}nativeRemove.call(this,key);};
  prototype.clear=function(){if(this===local){for(const key of Object.keys(workspaceStorage.snapshot()))workspaceStorage.removeItem(key);return;}nativeClear.call(this);};
  prototype.key=function(index:number){if(this===local){const managed=Object.keys(workspaceStorage.snapshot()),native:string[]=[],total=nativeLength?.call(local)??0;for(let i=0;i<total;i++){const key=nativeKey.call(local,i);if(key&&!isManagedLocalKey(key))native.push(key);}return [...managed,...native][index]??null;}return nativeKey.call(this,index);};
  const descriptor=Object.getOwnPropertyDescriptor(prototype,'length');
  if(descriptor?.get)Object.defineProperty(prototype,'length',{...descriptor,get:function(){if(this!==local)return descriptor.get!.call(this);let count=workspaceStorage.length;const total=nativeLength?.call(local)??0;for(let i=0;i<total;i++){const key=nativeKey.call(local,i);if(key&&!isManagedLocalKey(key))count++;}return count;}});
  if(typeof BroadcastChannel!=='undefined'){
    crossTabChannel=new BroadcastChannel('jackyun-indexeddb-storage');
    crossTabChannel.onmessage=event=>{const row=event.data as {key?:unknown;value?:unknown;owner?:unknown};if(typeof row.key!=='string'||(row.value!==null&&typeof row.value!=='string')||row.owner!==(currentOwner??'guest'))return;
      const target=isSyncableStorageKey(row.key)?memory:localMemory;
      if(row.value===null)target.delete(row.key);else target.set(row.key,row.value);
      window.dispatchEvent(new CustomEvent(CLOUD_STATE_APPLIED_EVENT,{detail:{source:'repository',keys:[row.key]}}));
      window.dispatchEvent(new StorageEvent('storage',{key:row.key,newValue:row.value as string|null,storageArea:local}));
    };
  }
}
export async function flushLocalWrites():Promise<void>{
  await tail;
  if(failures.size&&ready){for(const [key,draft]of [...failures])enqueue(key,draft.value,draft.expected);await tail;}
  if(failed)throw failed;
}
/** Source imports never replace an existing row, including a concurrently committed tombstone. */
export async function importRepositoryRecordIfMissing(key:string,value:string):Promise<boolean>{
  const context=await captureRepositoryContext();
  await flushLocalWrites();context.assertCurrent();
  if(workspaceStorage.getItem(key)!==null)return false;
  const applied=await persistDocument(key,value,!v5WorkspaceAuthorityKeys.has(key),undefined,{onlyIfMissing:true,databaseScope:context.databaseScope});
  context.assertCurrent();
  if(await projectionOwner()!==(context.owner??'guest'))throw Error('另一标签页已切换账号，导入保留在原账号仓库。');
  context.assertCurrent();
  if(applied){memory.set(key,value);context.assertCurrent();window.dispatchEvent(new CustomEvent('jackyun-sync-edit'));}
  return applied;
}
/** Legacy readers see pending drafts immediately; saved is announced only after IDB commit. */
export const workspaceStorage={
  flush:flushLocalWrites,
  snapshot():Record<string,string>{
    const result:Record<string,string>={};
    if(!initialized){
      try{const legacy=window.localStorage,total=nativeLocalLength?.call(legacy)??legacy.length;for(let index=0;index<total;index++){const key=nativeLocalKey?.call(legacy,index)??legacy.key(index);if(key&&isManagedLocalKey(key)){const value=readLegacyStorageValue(key);if(value!==null)result[key]=value;}}}catch{/* IndexedDB initialization reports storage failures separately. */}
    }
    for(const [key,value]of localMemory){if(value===null)delete result[key];else result[key]=value;}
    for(const [key,value]of memory){if(value===null)delete result[key];else result[key]=value;}
    for(const [key,value]of preInitializationWrites){if(value===null)delete result[key];else result[key]=value;}
    return result;
  },
  getItem(key:string):string|null {if(!initialized&&preInitializationWrites.has(key))return preInitializationWrites.get(key)??null;if(!initialized)return readLegacyStorageValue(key);const target=isSyncableStorageKey(key)?memory:localMemory;if(target.has(key))return target.get(key)??null;return readLegacyStorageValue(key);},
  setItem(key:string,value:string):void {value=String(value);if(!initialized){preInitializationWrites.set(key,value);return;}const previous=workspaceStorage.getItem(key);(isSyncableStorageKey(key)?memory:localMemory).set(key,value);enqueue(key,value,previous);},
  removeItem(key:string):void {if(!initialized){preInitializationWrites.set(key,null);return;}const previous=workspaceStorage.getItem(key);(isSyncableStorageKey(key)?memory:localMemory).set(key,null);enqueue(key,null,previous);},
  key(index:number):string|null {return Object.keys(workspaceStorage.snapshot())[index]??null;},
  get length():number {return Object.keys(workspaceStorage.snapshot()).length;},
};
/** Same-origin iframe Storage events are not consistently delivered to parents. */
export function captureLegacyStorageEdit(key:string,value?:string|null):void {
  if(value===undefined)value=window.localStorage.getItem(key);
  if(value===null)workspaceStorage.removeItem(key);else workspaceStorage.setItem(key,value);
  try{nativeLocalRemove?.call(window.localStorage,key);}catch{/* IndexedDB copy remains authoritative. */}
}
/** Remote application persists first, then updates the compatibility projection. */
export async function applyRepositoryRecord(key:string,value:string|null,expected?:string|null):Promise<void>{
  await flushLocalWrites();if(!await persistDocument(key,value,false,expected))throw Error('本机内容已变化，云端应用推迟到下一轮。');memory.set(key,value);notifyChanged(key,value);
}
/** Reflects a value already committed together with its v5 records and cursor. */
export async function projectCommittedRepositoryRecord(key:string,value:string|null):Promise<void>{
  memory.set(key,value);notifyChanged(key,value,'v5');
}
export async function projectLegacyCloudBaseline(key:string,value:string|null,expected:string|null):Promise<void>{
  const owner=currentOwner;
  if(await projectionOwner()!==(owner??'guest')||currentOwner!==owner)return;
  if(workspaceStorage.getItem(key)!==expected&&workspaceStorage.getItem(key)!==value)return;
  const failure=failures.get(key);if(failure&&failure.value===expected)failures.delete(key);
  failed=failures.values().next().value?.error??null;
  await projectCommittedRepositoryRecord(key,value);
  if(!pending&&!failed)status('saved');
}
export function exportLocalRecovery():string {
  return JSON.stringify({version:2,exportedAt:new Date().toISOString(),values:Object.fromEntries([...localMemory,...memory]),failedDrafts:Object.fromEntries([...failures].map(([key,draft])=>[key,{value:draft.value,expected:draft.expected}])),compatibilityProjection:{}},null,2);
}
if(typeof window!=='undefined')installStorageCompatibility();
