import type {SyncConflict,SyncResolutionRequest} from '../../types/sync.ts';
import type {V5ResourceConflict} from './outbox.ts';

export type ConflictBatch={id:string;legacy:SyncResolutionRequest[];resources:Array<{conflict:V5ResourceConflict;choice:'local'|'remote'}>};
export function createConflictBatch(id:string,choice:'local'|'remote',reviews:Array<{conflict:SyncConflict;raw:string|null}>,resources:V5ResourceConflict[]):ConflictBatch{
  return {id,legacy:reviews.map(({conflict,raw})=>({operationId:conflict.operationId,
    // Legacy "local" means three-way merge, not exactly the local side.
    choice:choice==='local'?'merged':'remote',review:{expectedLocal:raw,remoteRevision:conflict.remoteRevision,remoteHash:conflict.remoteHash,
      ...(choice==='local'?{value:readLocal(raw),deleted:raw===null}:{})}})),
    resources:resources.map(conflict=>({conflict:structuredClone(conflict),choice}))};
}
function readLocal(raw:string|null):unknown{if(raw===null)return null;try{return JSON.parse(raw);}catch{return raw;}}
export async function runConflictBatch(batch:ConflictBatch,resolveLegacy:(request:SyncResolutionRequest)=>Promise<void>,resolveResource:(conflict:V5ResourceConflict,choice:'local'|'remote')=>Promise<void>){
  const failures:Array<{operationId:string;message:string}>=[];let completed=0;
  for(const item of [...batch.legacy.map(request=>({id:request.operationId,run:()=>resolveLegacy(request)})),
    ...batch.resources.map(({conflict,choice})=>({id:conflict.operationId,run:()=>resolveResource(conflict,choice)}))]){
    try{await item.run();completed++;}catch(error){failures.push({operationId:item.id,message:error instanceof Error?error.message:'选择未完成'});}
  }
  return {completed,failures};
}
