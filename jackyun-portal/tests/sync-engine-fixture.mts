import {createHash,randomUUID} from 'node:crypto';
import {createWorkspaceSync,type SyncEnvironment,type SyncStore} from '../src/lib/sync/engine.ts';
import {canonicalJson} from '../src/lib/sync/hash.ts';
import {applyRecordDelta} from '../src/lib/sync/delta.ts';
import {compactSyncOperations} from '../src/lib/sync/batch.ts';
import {reconcileAcknowledgment} from '../src/lib/sync/acknowledgment.ts';
import type {SyncConflict,SyncOperation,SyncRecord} from '../src/types/sync.ts';
export const key='jackyun_schedule_control_v1';
export const checksum=(value:unknown,deleted=false)=>createHash('sha256').update(deleted?'__deleted__':canonicalJson(value)).digest('hex');
export function remote(value:unknown,revision=1,deleted=false):SyncRecord{return {key,value,revision,contentHash:checksum(value,deleted),deleted,updatedAt:'2026-10-11T00:00:00Z'};}
export function server(initial?:SyncRecord){
  let cloud=initial;const receipts=new Map<string,unknown>();let calls=0,writes=0,lost=false;
  return {
    get cloud(){return cloud;},set cloud(value:SyncRecord|undefined){cloud=value;},get calls(){return calls;},get writes(){return writes;},loseNextReply(){lost=true;},
    async request(url:string,init?:RequestInit){
      calls++;
      if(!init?.method || init.method==='GET')return Response.json({ok:true,syncProtocol:3,records:cloud?[url.includes('/v3')?({...cloud,value:undefined}):cloud]:[],next:null});
      const body=JSON.parse(String(init.body));const applied:unknown[]=[],conflicts:unknown[]=[];
      for(const operation of body.operations){
        const cached=receipts.get(operation.id);if(cached){applied.push(cached);continue;}
        if(operation.baseRevision!==(cloud?.revision??0)||operation.baseHash!==(cloud?.contentHash??null)){
          conflicts.push({operationId:operation.id,key,remoteValue:cloud?.value??null,remoteDeleted:cloud?.deleted??true,remoteRevision:cloud?.revision??0,remoteHash:cloud?.contentHash??null});continue;
        }
        writes++;cloud=remote(operation.deleted?null:applyRecordDelta(cloud?.deleted?undefined:cloud?.value,operation.patch),(cloud?.revision??0)+1,operation.deleted);
        const receipt={operationId:operation.id,key,revision:cloud.revision,contentHash:cloud.contentHash};receipts.set(operation.id,receipt);applied.push(receipt);
      }
      if(lost){lost=false;throw Error('response lost after commit');}
      return Response.json({ok:true,applied,conflicts,remote:[]});
    },
  };
}
export function device(backend:ReturnType<typeof server>,initial?:SyncRecord){
  const values=new Map<string,string>(),metadata=new Map<string,SyncRecord>();
  if(initial){metadata.set(key,structuredClone(initial));if(!initial.deleted)values.set(key,JSON.stringify(initial.value));}
  let operations:SyncOperation[]=[],conflicts:SyncConflict[]=[],sequence=0,backups=0,changes=0,failBackup=false;
  const store:SyncStore={
    getMetadata:async()=>structuredClone([...metadata.values()]),saveMetadata:async r=>{metadata.set(r.key,structuredClone(r));},
    getOutbox:async()=>structuredClone(operations),queueOperation:async op=>{operations=compactSyncOperations([...operations,{...op,sequence:++sequence}]);},
    replaceOperation:async(sent,next)=>{const found=operations.find(op=>op.id===sent.id);if(canonicalJson(found)!==canonicalJson(sent))return false;operations=operations.filter(op=>op.id!==sent.id);if(next)operations.push(next);return true;},
    acknowledgeOperation:async(sent,cloud)=>{const current=operations.find(op=>op.id===sent.id)??operations.find(op=>op.key===sent.key&&op.baseRevision===sent.baseRevision&&op.baseHash===sent.baseHash);if(!current)return false;operations=operations.filter(op=>op.id!==current.id);const next=reconcileAcknowledgment(current,sent,cloud,randomUUID());if(next)operations.push(next);return !next;},
    getConflicts:async()=>structuredClone(conflicts),saveConflict:async c=>{conflicts=conflicts.filter(item=>item.key!==c.key).concat(structuredClone(c));},removeConflict:async id=>{conflicts=conflicts.filter(item=>item.operationId!==id);},
  };
  const environment:SyncEnvironment={store,snapshot:()=>Object.fromEntries(values),read:k=>values.get(k)??null,write:(k,v)=>{if(v===null)values.delete(k);else values.set(k,v);},backup:async()=>{if(failBackup)throw Error('backup failed');backups++;},changed:()=>{changes++;},
    request:backend.request,progress:()=>{},deviceId:async()=>randomUUID(),device:()=>({name:'test',platform:'web'}),cancelled:()=>false,now:()=>new Date('2999-01-01').getTime(),uuid:randomUUID};
  const engine=createWorkspaceSync(environment);
  return {engine,store,environment,values,set(value:unknown){values.set(key,JSON.stringify(value));},get value(){const raw=values.get(key);return raw===undefined?undefined:JSON.parse(raw);},get backups(){return backups;},get changes(){return changes;},set failBackup(value:boolean){failBackup=value;},restart(){return createWorkspaceSync(environment);}};
}
