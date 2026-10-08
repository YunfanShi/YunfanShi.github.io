import { createHash } from 'node:crypto';
import { canonicalJson } from '../sync/hash.ts';
import type { createAzureRecordClient } from '../sync/azure-records.ts';
import type { SyncRecord } from '../../types/sync.ts';
import { ALL_BACKUP_PAGES,isBackupableLegacyKey,legacyBackupPage,type BackupPage } from './pages.ts';

type Source=ReturnType<typeof createAzureRecordClient>;
type Plan={key:string;value:unknown;deleted:boolean;operationId:string;clientUpdatedAt:string;expected:SyncRecord|null};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const digest=(value:unknown,deleted:boolean)=>createHash('sha256').update(deleted?'__deleted__':canonicalJson(value)).digest('hex');
function parseJob(value:unknown,userId:string){
 const job=value as {id:string;page:BackupPage;beforeId:number;plan:Record<string,unknown>[]} | null;
 if(!job||!uuid.test(job.id)||!ALL_BACKUP_PAGES.includes(job.page)||!Number.isSafeInteger(job.beforeId)||job.beforeId<=0||!Array.isArray(job.plan)||job.plan.length>20000) throw Error('恢复计划无效，恢复未确认。');
 const keys=new Set<string>();
 const plan:Plan[]=job.plan.map(item=>{
  if(typeof item.key!=='string'||!isBackupableLegacyKey(item.key)||legacyBackupPage(item.key)!==job.page||keys.has(item.key)||typeof item.deleted!=='boolean'||typeof item.operationId!=='string'||!uuid.test(item.operationId)||typeof item.clientUpdatedAt!=='string'||!Number.isFinite(Date.parse(item.clientUpdatedAt))) throw Error('恢复计划包含无效同步项。');
  keys.add(item.key);let expected:SyncRecord|null=null;
  if(item.expected!==null){
   const r=item.expected as Record<string,unknown>;
   if(!r||r.user_id!==userId||r.storage_key!==item.key||!Number.isSafeInteger(r.revision)||Number(r.revision)<1||typeof r.updated_at!=='string'||!Number.isFinite(Date.parse(r.updated_at))||!(r.deleted_at===null||typeof r.deleted_at==='string'&&Number.isFinite(Date.parse(r.deleted_at)))||!(r.content_hash===null||typeof r.content_hash==='string'&&/^[a-f0-9]{64}$/i.test(r.content_hash))) throw Error('恢复前版本元数据无效。');
   expected={key:item.key,value:r.storage_value,revision:Number(r.revision),contentHash:r.content_hash as string|null,deleted:r.deleted_at!==null,updatedAt:r.updated_at,large:false};
  }
  return {key:item.key,value:item.value,deleted:item.deleted,operationId:item.operationId,clientUpdatedAt:item.clientUpdatedAt,expected};
 });return {...job,plan};
}

/** A durable source job preserves the pre-restore backup and original Azure
 * operation IDs. Both databases remain independently transactional. */
export async function restoreAzurePage(source:Source,userId:string,backupId:number,page:BackupPage,requestId:string,
 prepare:(args:{backup_id:number;current_sync_records:Record<string,unknown>[];request_id:string})=>Promise<{data:unknown;error:unknown}>,
 finish:(args:{restore_id:string;restored_sync_records:Record<string,unknown>[]})=>Promise<{data:unknown;error:unknown}>):Promise<{page:BackupPage;legacyRecords:SyncRecord[]}> {
 if(!uuid.test(requestId)) throw Error('恢复请求编号无效。');
 // Read only the selected authorized page for the pre-restore snapshot.
 const records=await source.list({include:key=>isBackupableLegacyKey(key)&&legacyBackupPage(key)===page});
 const current=records.map(r=>({user_id:userId,storage_key:r.key,storage_value:r.value,revision:r.revision,content_hash:r.contentHash,deleted_at:r.deleted?r.updatedAt:null,client_updated_at:r.updatedAt,updated_at:r.updatedAt}));
 const prepared=await prepare({backup_id:backupId,current_sync_records:current,request_id:requestId});
 if(prepared.error) throw Error('恢复前备份或恢复计划未保存，恢复未执行。');
 const job=parseJob(prepared.data,userId);
 if(job.page!==page) throw Error('恢复页面不匹配。');
 try {
  for(const item of job.plan) await source.write(item.key,item.value,item.deleted,item.expected,{operationId:item.operationId,clientUpdatedAt:item.clientUpdatedAt});
  const verify=async()=>{
   const rows:SyncRecord[]=[];
   for(const item of job.plan){
    const r=await source.read(item.key);
    if(!r||r.deleted!==item.deleted||r.contentHash!==digest(item.value,item.deleted)) throw Error('恢复期间云端有新修改，未确认完成。');
    rows.push(r);
   }return rows;
  };
  const verified=await source.list({include:key=>isBackupableLegacyKey(key)&&legacyBackupPage(key)===page});
  for(const item of job.plan){
    const r=verified.find(row=>row.key===item.key);
    if(!r||r.deleted!==item.deleted||r.contentHash!==digest(item.value,item.deleted)) throw Error('恢复期间云端有新修改，未确认完成。');
  }
  const finished=await finish({restore_id:job.id,restored_sync_records:verified.map(r=>({user_id:userId,storage_key:r.key,storage_value:r.value,revision:r.revision,content_hash:r.contentHash,deleted_at:r.deleted?r.updatedAt:null,client_updated_at:r.updatedAt,updated_at:r.updatedAt}))});
  const result=finished.data as {page?:unknown;completed?:unknown}|null;
  if(finished.error||result?.completed!==true||result.page!==job.page) throw Error('页面业务数据尚未恢复。');
  return {page:job.page,legacyRecords:await verify()};
 } catch {
  throw Error(`恢复尚未完成，恢复前版本 ${job.beforeId} 已保存。请重试同一版本以继续；不要删除原始备份。`);
 }
}
