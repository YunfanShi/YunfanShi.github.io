import { ApiError } from './errors.mjs';
import {isSyncableStorageKey} from '../../src/lib/local-workspace.ts';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const number=value=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<0)throw new ApiError(400,'INVALID_CURSOR');return n;};
export async function handleSyncV4(client,identity,method,url,body,applyBody) {
  const rollout=process.env.SYNC_V4_ENABLED==='true'
    || (process.env.SYNC_V4_USERS??'').split(',').map(s=>s.trim()).includes(identity.sub);
  if(!rollout)return {ok:true,syncProtocol:3,capabilities:{v4:false}};
  const ready=(await client.query(`SELECT to_regclass('public.sync_change_heads') IS NOT NULL
    AND to_regclass('public.sync_change_log') IS NOT NULL AND to_regclass('public.sync_v3_receipts') IS NOT NULL
    AND (SELECT bool_and(has_table_privilege(current_user,to_regclass(required.relation),required.privilege))
      FROM (VALUES ('public.sync_change_heads','SELECT'),('public.sync_change_heads','INSERT'),('public.sync_change_heads','UPDATE'),
      ('public.sync_change_log','SELECT'),('public.sync_change_log','INSERT'),('public.sync_change_log','DELETE'),
      ('public.sync_v3_receipts','SELECT'),('public.sync_v3_receipts','INSERT')) AS required(relation,privilege)) AS ready`)).rows[0]?.ready;
  if(!ready)return {ok:true,syncProtocol:3,capabilities:{v4:false}};
  if(method==='POST') {
    await client.query('SELECT public.prune_sync_changes()');
    if(body?.action==='receipts') {
      if(!Array.isArray(body.operations)||body.operations.length>100||!body.operations.every(o=>UUID.test(o?.id??'')&&/^[a-f0-9]{64}$/.test(o?.requestHash??'')))throw new ApiError(400,'INVALID_RECEIPT_QUERY');
      const rows=(await client.query('SELECT o.id,o.storage_key,o.result,r.request_hash FROM public.sync_operations o LEFT JOIN public.sync_v3_receipts r ON r.user_id=o.user_id AND r.operation_id=o.id WHERE o.user_id=$1 AND o.id=ANY($2::uuid[])',[identity.sub,body.operations.map(o=>o.id)])).rows;
      return {ok:true,syncProtocol:4,receipts:body.operations.map(op=>{
        const row=rows.find(r=>r.id===op.id);
        if(!row)return {operationId:op.id,state:'unknown'};
        if((row.request_hash??row.result.requestHash)!==op.requestHash)throw new ApiError(409,'OPERATION_ID_REUSED');
        return {operationId:op.id,key:row.storage_key,state:'confirmed',result:row.result};
      })};
    }
    if(body?.syncProtocol!==4)throw new ApiError(400,'INVALID_PROTOCOL');
    return {...await applyBody(client,identity,{...body,syncProtocol:3}),syncProtocol:4};
  }
  if(method!=='GET')throw new ApiError(405,'METHOD_NOT_ALLOWED');
  const head=(await client.query('SELECT sequence,retained_after FROM public.sync_change_heads WHERE user_id=$1',[identity.sub])).rows[0];
  const high=number(head?.sequence??0),floor=number(head?.retained_after??0);
  const mode=url.searchParams.get('mode');
  if(!mode)return {ok:true,syncProtocol:4,capabilities:{v4:true,receipts:true,incremental:true},head:high,transferEncoding:'gzip'};
  const descriptor=row=>({key:row.storage_key,revision:number(row.revision),contentHash:row.content_hash,
    deleted:Boolean(row.deleted_at),updatedAt:row.updated_at instanceof Date?row.updated_at.toISOString():row.updated_at,
    large:Boolean(row.large),value:null});
  if(mode==='baseline') {
    const after=url.searchParams.get('after')??'';
    if(after.length>120)throw new ApiError(400,'INVALID_CURSOR');
    const rows=(await client.query(`SELECT storage_key,revision,content_hash,deleted_at,updated_at,
      deleted_at IS NULL AND octet_length(storage_value::text)>400000 AS large
      FROM public.legacy_sync_data WHERE user_id=$1 AND storage_key COLLATE "C">$2 COLLATE "C"
      ORDER BY storage_key COLLATE "C" LIMIT 101`,[identity.sub,after])).rows;
    return {ok:true,syncProtocol:4,records:rows.slice(0,100).filter(row=>isSyncableStorageKey(row.storage_key)).map(descriptor),next:rows.length>100?rows[99].storage_key:null,head:high};
  }
  if(mode!=='changes')throw new ApiError(400,'INVALID_SYNC_MODE');
  const cursor=number(url.searchParams.get('cursor')??0);
  if(cursor<floor)throw new ApiError(409,'SYNC_BASELINE_REQUIRED');
  if(cursor>high)throw new ApiError(409,'SYNC_BASELINE_REQUIRED');
  const until=url.searchParams.has('until')?number(url.searchParams.get('until')):high;
  if(until<cursor||until>high)throw new ApiError(400,'INVALID_CURSOR');
  const rows=(await client.query(`SELECT c.sequence,l.storage_key,l.revision,l.content_hash,l.deleted_at,l.updated_at,
    l.deleted_at IS NULL AND octet_length(l.storage_value::text)>400000 AS large
    FROM public.sync_change_log c JOIN public.legacy_sync_data l ON l.user_id=c.user_id AND l.storage_key=c.storage_key
    WHERE c.user_id=$1 AND c.sequence>$2 AND c.sequence<=$3 ORDER BY c.sequence LIMIT 101`,[identity.sub,cursor,until])).rows;
  const page=rows.slice(0,100),next=page.length?number(page.at(-1).sequence):until;
  return {ok:true,syncProtocol:4,records:page.filter(row=>isSyncableStorageKey(row.storage_key)).map(r=>({...descriptor(r),sequence:number(r.sequence)})),cursor:next,until,hasMore:rows.length>100};
}
