import {createHash} from 'node:crypto';
import {canonicalJson} from '../../src/lib/sync/hash.ts';
import {mergeScheduleResources,resourceScopeForRecordId,scheduleToResources} from '../../src/lib/sync/resource-model.ts';
import {unsafeScheduleReplacement} from '../../src/lib/sync/schedule-safety.ts';
import {ApiError} from './errors.mjs';

export const SYNC_V5_SCOPES=new Set(['timetable','learning','cue','practice','timer','settings']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH=/^[a-f0-9]{64}$/i;
const MAX_OPERATIONS=100,MAX_BODY_BYTES=1_000_000,MAX_RECORD_BYTES=900_000;
const fail=(status,code)=>{throw new ApiError(status,code);};
const json=value=>JSON.stringify(value??null);
const digest=(value,deleted=false)=>createHash('sha256').update(deleted?'__deleted__':canonicalJson(value)).digest('hex');
const integer=value=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<0)fail(400,'INVALID_CURSOR');return n;};
const validScope=value=>typeof value==='string'&&SYNC_V5_SCOPES.has(value);
const descriptor=row=>({scope:row.scope,recordId:row.record_id,revision:Number(row.revision),contentHash:row.content_hash,
  deleted:Boolean(row.deleted_at),updatedAt:row.updated_at instanceof Date?row.updated_at.toISOString():row.updated_at,
  ...(row.sequence===undefined?{}:{sequence:Number(row.sequence)})});
const scheduleKey='jackyun_schedule_control_v1';
const parseRecordId=recordId=>{const colon=recordId.indexOf(':');if(colon<1)throw new ApiError(503,'SYNC_V5_RECORD_CORRUPT');
  return {field:recordId.slice(0,colon),itemId:decodeURIComponent(recordId.slice(colon+1))};};
const hashValue=value=>createHash('sha256').update(canonicalJson(value)).digest('hex');
async function readLegacySchedule(client,userId){
  return (await client.query('SELECT storage_value,revision,content_hash,deleted_at,updated_at FROM public.legacy_sync_data WHERE user_id=$1 AND storage_key=$2',[userId,scheduleKey])).rows[0]??null;
}
export async function readScheduleProjection(client,userId){
  const legacy=await readLegacySchedule(client,userId),head=(await client.query('SELECT revision,content_hash,updated_at FROM public.sync_v5_projection_heads WHERE user_id=$1',[userId])).rows[0];
  const rows=(await client.query(`SELECT scope,record_id,value,deleted_at FROM public.sync_v5_records WHERE user_id=$1`,[userId])).rows;
  const base=legacy&&!legacy.deleted_at&&legacy.storage_value&&typeof legacy.storage_value==='object'?legacy.storage_value:{};
  const projectionRecordCount=rows.length,projectionBytes=rows.reduce((total,row)=>total+Buffer.byteLength(json(row.value)),0);
  if(!rows.length)return {value:base,revision:integer(head?.revision??legacy?.revision??0),contentHash:head?.content_hash??legacy?.content_hash??null,legacy,projectionRecordCount,projectionBytes};
  const resources=[],touched=new Set();
  for(const row of rows){const {field,itemId}=parseRecordId(row.record_id);touched.add(field);
    if(!row.deleted_at)resources.push({scope:row.scope,recordId:row.record_id,field,itemId,value:row.value});}
  const value=mergeScheduleResources(base,resources,[...touched]);
  return {value,revision:integer(head?.revision??legacy?.revision??0),contentHash:head?.content_hash??legacy?.content_hash??hashValue(value),legacy,projectionRecordCount,projectionBytes};
}
export async function scheduleProjectionState(client,userId,rolloutScopes=[]){
  const ready=(await client.query(`SELECT to_regclass('public.sync_v5_records') IS NOT NULL
    AND to_regclass('public.sync_v5_heads') IS NOT NULL AND to_regclass('public.sync_v5_projection_heads') IS NOT NULL AS ready`)).rows[0]?.ready===true;
  if(!ready)return null;
  if(rolloutScopes.length)return [...new Set(rolloutScopes)];
  const exists=(await client.query('SELECT 1 FROM public.sync_v5_projection_heads WHERE user_id=$1',[userId])).rows.length>0;
  if(!exists)return null;
  return (await client.query('SELECT scope FROM public.sync_v5_heads WHERE user_id=$1 ORDER BY scope',[userId])).rows.map(row=>row.scope);
}
export async function writeProjectionHead(client,userId,revision,value,{recordV4Change=false}={}){
  const contentHash=hashValue(value);
  // Keep v4's row-based CAS and change-log readers on the same account-wide
  // revision without rewriting the multi-megabyte compatibility body.
  await client.query(`INSERT INTO public.legacy_sync_data(user_id,storage_key,storage_value,revision,content_hash,updated_at,deleted_at)
    VALUES($1,$4,$5::jsonb,$2,$3,now(),NULL)
    ON CONFLICT(user_id,storage_key) DO UPDATE SET revision=excluded.revision,content_hash=excluded.content_hash,
    updated_at=now(),deleted_at=NULL`,[userId,revision,contentHash,scheduleKey,json(value)]);
  await client.query(`INSERT INTO public.sync_v5_projection_heads(user_id,revision,content_hash,updated_at)
    VALUES($1,$2,$3,now()) ON CONFLICT(user_id) DO UPDATE SET revision=excluded.revision,content_hash=excluded.content_hash,updated_at=now()`,[userId,revision,contentHash]);
  if(recordV4Change){
    const sequence=Number((await client.query(`INSERT INTO public.sync_change_heads(user_id,sequence) VALUES($1,1)
      ON CONFLICT(user_id) DO UPDATE SET sequence=public.sync_change_heads.sequence+1 RETURNING sequence`,[userId])).rows[0].sequence);
    await client.query('INSERT INTO public.sync_change_log(user_id,sequence,storage_key) VALUES($1,$2,$3)',[userId,sequence,scheduleKey]);
  }
  return {revision,contentHash};
}
async function bootstrapScopes(client,userId,scopes){
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[userId]);
  const current=await readScheduleProjection(client,userId);
  const existing=(await client.query('SELECT scope FROM public.sync_v5_heads WHERE user_id=$1',[userId])).rows.map(row=>row.scope);
  const pending=scopes.filter(scope=>!existing.includes(scope));
  if(!pending.length)return current;
  const resources=scheduleToResources(current.value);
  for(const scope of pending){
    let sequence=0;
    for(const resource of resources.filter(item=>item.scope===scope)){
      const contentHash=hashValue(resource.value);
      await client.query(`INSERT INTO public.sync_v5_records(user_id,scope,record_id,revision,content_hash,value,updated_at)
        VALUES($1,$2,$3,1,$4,$5::jsonb,now()) ON CONFLICT(user_id,scope,record_id) DO NOTHING`,
        [userId,scope,resource.recordId,contentHash,json(resource.value)]);
    }
    await client.query(`INSERT INTO public.sync_v5_heads(user_id,scope,sequence,retained_after)
      VALUES($1,$2,$3,0) ON CONFLICT(user_id,scope) DO NOTHING`,[userId,scope,sequence]);
  }
  if(!current.revision&&!current.contentHash)await writeProjectionHead(client,userId,0,current.value);
  else await client.query(`INSERT INTO public.sync_v5_projection_heads(user_id,revision,content_hash,updated_at)
    VALUES($1,$2,$3,now()) ON CONFLICT(user_id) DO NOTHING`,[userId,current.revision,current.contentHash]);
  return readScheduleProjection(client,userId);
}
export async function replaceScheduleResources(client,userId,schedule,scopes){
  const desired=scheduleToResources(schedule).filter(resource=>scopes.includes(resource.scope));
  const current=(await client.query('SELECT scope,record_id,revision,content_hash,value,deleted_at FROM public.sync_v5_records WHERE user_id=$1 AND scope=ANY($2::text[]) FOR UPDATE',[userId,scopes])).rows;
  const next=new Map(desired.map(resource=>[`${resource.scope}\0${resource.recordId}`,resource]));
  const prior=new Map(current.map(row=>[`${row.scope}\0${row.record_id}`,row]));
  const changes=[...desired.map(resource=>({scope:resource.scope,recordId:resource.recordId,value:resource.value,deleted:false})),
    ...current.filter(row=>!row.deleted_at&&!next.has(`${row.scope}\0${row.record_id}`)).map(row=>({scope:row.scope,recordId:row.record_id,value:null,deleted:true}))];
  for(const change of changes){
    const key=`${change.scope}\0${change.recordId}`,row=prior.get(key),contentHash=digest(change.value,change.deleted);
    if(row&&row.content_hash===contentHash&&Boolean(row.deleted_at)===change.deleted)continue;
    const revision=Number(row?.revision??0)+1;
    await client.query(`INSERT INTO public.sync_v5_records(user_id,scope,record_id,revision,content_hash,value,deleted_at,updated_at)
      VALUES($1,$2,$3,$4,$5,$6::jsonb,CASE WHEN $7 THEN now() ELSE NULL END,now())
      ON CONFLICT(user_id,scope,record_id) DO UPDATE SET revision=excluded.revision,content_hash=excluded.content_hash,
      value=excluded.value,deleted_at=excluded.deleted_at,updated_at=now()`,[userId,change.scope,change.recordId,revision,contentHash,json(change.value),change.deleted]);
    const sequence=Number((await client.query(`INSERT INTO public.sync_v5_heads(user_id,scope,sequence)
      VALUES($1,$2,1) ON CONFLICT(user_id,scope) DO UPDATE SET sequence=public.sync_v5_heads.sequence+1 RETURNING sequence`,[userId,change.scope])).rows[0].sequence);
    await client.query('INSERT INTO public.sync_v5_changes(user_id,scope,sequence,record_id) VALUES($1,$2,$3,$4)',[userId,change.scope,sequence,change.recordId]);
  }
}

export function syncV5Rollout(identity) {
  const enabledUsers=(process.env.SYNC_V5_USERS??'').split(',').map(value=>value.trim()).filter(Boolean);
  const scopes=(process.env.SYNC_V5_SCOPES??'').split(',').map(value=>value.trim()).filter(validScope);
  if(!scopes.length)return [];
  if(enabledUsers.includes(identity.sub))return [...new Set(scopes)];
  return [];
}

function validateOperation(operation,scope) {
  if(!operation||typeof operation!=='object'||!UUID.test(operation.id??'')||operation.scope!==scope
    ||typeof operation.recordId!=='string'||operation.recordId.indexOf(':')<1||operation.recordId.length>240
    ||/[\u0000-\u001f]/.test(operation.recordId)||!Number.isSafeInteger(operation.baseRevision)||operation.baseRevision<0
    ||!(operation.baseHash===null||(typeof operation.baseHash==='string'&&HASH.test(operation.baseHash)))
    ||typeof operation.deleted!=='boolean'||(!operation.deleted&&!Object.hasOwn(operation,'value'))
    ||typeof operation.clientUpdatedAt!=='string'||!Number.isFinite(Date.parse(operation.clientUpdatedAt)))fail(400,'INVALID_V5_OPERATION');
  if(resourceScopeForRecordId(operation.recordId)!==scope)fail(400,'V5_RESOURCE_SCOPE_MISMATCH');
  if(Buffer.byteLength(json(operation.deleted?null:operation.value))>MAX_RECORD_BYTES)fail(413,'V5_RECORD_TOO_LARGE');
}

export async function handleSyncV5(client,identity,method,url,body,enabledScopes) {
  const route=url.pathname,available=[...new Set(enabledScopes)].filter(validScope);
  const schema=(await client.query(`SELECT to_regclass('public.sync_v5_records') IS NOT NULL
    AND to_regclass('public.sync_v5_heads') IS NOT NULL AND to_regclass('public.sync_v5_changes') IS NOT NULL
    AND to_regclass('public.sync_v5_receipts') IS NOT NULL AND to_regclass('public.sync_v5_projection_heads') IS NOT NULL AS ready`)).rows[0]?.ready===true;
  if(route==='/api/sync/v5'&&method==='GET'){
    return {ok:true,syncProtocol:5,capabilities:{v5:schema&&available.length>0},scopes:schema?available:[],transferEncoding:'gzip'};
  }
  if(!schema)fail(503,'SYNC_V5_NOT_READY');
  const scope=url.searchParams.get('scope')??body?.scope;
  if(!validScope(scope)||!available.includes(scope))fail(404,'SYNC_V5_SCOPE_UNAVAILABLE');
  await bootstrapScopes(client,identity.sub,[scope]);
  if(route==='/api/sync/v5/manifest'){
    if(method!=='GET')fail(405,'METHOD_NOT_ALLOWED');
    const after=url.searchParams.get('after')??'';
    if(after.length>240)fail(400,'INVALID_CURSOR');
    const rows=(await client.query(`SELECT scope,record_id,revision,content_hash,deleted_at,updated_at
      FROM public.sync_v5_records WHERE user_id=$1 AND scope=$2 AND record_id COLLATE "C">$3 COLLATE "C"
      ORDER BY record_id COLLATE "C" LIMIT 101`,[identity.sub,scope,after])).rows;
    const head=(await client.query('SELECT sequence,retained_after FROM public.sync_v5_heads WHERE user_id=$1 AND scope=$2',[identity.sub,scope])).rows[0];
    return {ok:true,syncProtocol:5,records:rows.slice(0,100).map(descriptor),next:rows.length>100?rows[99].record_id:null,
      head:integer(head?.sequence??0),retainedAfter:integer(head?.retained_after??0)};
  }
  if(route==='/api/sync/v5/changes'){
    if(method!=='GET')fail(405,'METHOD_NOT_ALLOWED');
    const cursor=integer(url.searchParams.get('cursor')??0);
    const head=(await client.query('SELECT sequence,retained_after FROM public.sync_v5_heads WHERE user_id=$1 AND scope=$2',[identity.sub,scope])).rows[0];
    const high=integer(head?.sequence??0),floor=integer(head?.retained_after??0);
    if(cursor<floor||cursor>high)fail(409,'SYNC_V5_BASELINE_REQUIRED');
    const rows=(await client.query(`SELECT c.sequence,r.scope,r.record_id,r.revision,r.content_hash,r.deleted_at,r.updated_at
      FROM public.sync_v5_changes c JOIN public.sync_v5_records r
      ON r.user_id=c.user_id AND r.scope=c.scope AND r.record_id=c.record_id
      WHERE c.user_id=$1 AND c.scope=$2 AND c.sequence>$3 ORDER BY c.sequence LIMIT 101`,[identity.sub,scope,cursor])).rows;
    const page=rows.slice(0,100),next=page.length?integer(page.at(-1).sequence):high;
    return {ok:true,syncProtocol:5,records:page.map(descriptor),cursor:next,head:high,hasMore:rows.length>100};
  }
  if(route==='/api/sync/v5/records'){
    if(method!=='GET')fail(405,'METHOD_NOT_ALLOWED');
    const ids=url.searchParams.getAll('id');
    if(!ids.length||ids.length>100||ids.some(id=>!id||id.length>240))fail(400,'INVALID_RECORD_IDS');
    const rows=(await client.query(`SELECT scope,record_id,revision,content_hash,value,deleted_at,updated_at
      FROM public.sync_v5_records WHERE user_id=$1 AND scope=$2 AND record_id=ANY($3::text[])`,[identity.sub,scope,ids])).rows;
    return {ok:true,syncProtocol:5,records:rows.map(row=>({...descriptor(row),value:row.deleted_at?null:row.value}))};
  }
  if(route==='/api/sync/v5/receipts'){
    if(method!=='POST')fail(405,'METHOD_NOT_ALLOWED');
    if(!Array.isArray(body?.operations)||body.operations.length>MAX_OPERATIONS
      ||!body.operations.every(row=>UUID.test(row?.id??'')&&HASH.test(row?.requestHash??'')))fail(400,'INVALID_V5_RECEIPT_QUERY');
    const rows=(await client.query('SELECT operation_id,request_hash,result FROM public.sync_v5_receipts WHERE user_id=$1 AND scope=$2 AND operation_id=ANY($3::uuid[])',
      [identity.sub,scope,body.operations.map(row=>row.id)])).rows;
    const receipts=body.operations.map(operation=>{
      const row=rows.find(candidate=>candidate.operation_id===operation.id);
      if(!row)return {operationId:operation.id,state:'unknown'};
      if(row.request_hash!==operation.requestHash)fail(409,'OPERATION_ID_REUSED');
      return {operationId:operation.id,state:'confirmed',result:row.result};
    });
    return {ok:true,syncProtocol:5,receipts};
  }
  if(route==='/api/sync/v5/operations'){
    if(method!=='POST')fail(405,'METHOD_NOT_ALLOWED');
    if(!UUID.test(body?.deviceId??'')||!Array.isArray(body.operations)||body.operations.length<1||body.operations.length>MAX_OPERATIONS
      ||Buffer.byteLength(json(body))>MAX_BODY_BYTES)fail(400,'INVALID_V5_BODY');
    for(const operation of body.operations)validateOperation(operation,scope);
    if(new Set(body.operations.map(row=>row.id)).size!==body.operations.length
      ||new Set(body.operations.map(row=>row.recordId)).size!==body.operations.length)fail(400,'DUPLICATE_V5_OPERATION');
    const recent=Number((await client.query("SELECT count(*)::integer AS count FROM public.sync_v5_receipts WHERE user_id=$1 AND created_at>=now()-interval '1 minute'",[identity.sub])).rows[0]?.count??0);
    if(recent+body.operations.length>600)fail(429,'RATE_LIMITED');
    const device=(await client.query('SELECT revoked_at FROM public.web_sync_devices WHERE id=$1 AND user_id=$2',[body.deviceId,identity.sub])).rows[0];
    if(device?.revoked_at)fail(403,'DEVICE_REVOKED');
    const applied=[],remote=[],conflicts=[],newlyApplied=[],evidenceBaseline=scope==='practice'?(await readScheduleProjection(client,identity.sub)).value:null;
    for(const operation of body.operations){
      const requestHash=digest(operation);
      const prior=(await client.query('SELECT request_hash,result FROM public.sync_v5_receipts WHERE user_id=$1 AND scope=$2 AND operation_id=$3',[identity.sub,scope,operation.id])).rows[0];
      if(prior){if(prior.request_hash!==requestHash)fail(409,'OPERATION_ID_REUSED');
        const result=prior.result;if(result.status==='applied')applied.push(result);else if(result.status==='conflict')conflicts.push(result);continue;}
      const current=(await client.query(`SELECT scope,record_id,revision,content_hash,value,deleted_at,updated_at FROM public.sync_v5_records
        WHERE user_id=$1 AND scope=$2 AND record_id=$3 FOR UPDATE`,[identity.sub,scope,operation.recordId])).rows[0];
      const revision=integer(current?.revision??0),contentHash=current?.content_hash??null;
      if(revision!==operation.baseRevision||contentHash!==operation.baseHash){
        const result={status:'conflict',operationId:operation.id,scope,recordId:operation.recordId,revision,
          contentHash,deleted:!current||Boolean(current.deleted_at),value:current?.deleted_at?null:current?.value??null};
        conflicts.push(result);
        await client.query(`INSERT INTO public.sync_v5_receipts(user_id,scope,operation_id,request_hash,result)
          VALUES($1,$2,$3,$4,$5::jsonb)`,[identity.sub,scope,operation.id,requestHash,json(result)]);
        continue;
      }
      const nextRevision=revision+1,value=operation.deleted?null:operation.value,nextHash=digest(value,operation.deleted);
      const saved=(await client.query(`INSERT INTO public.sync_v5_records(user_id,scope,record_id,revision,content_hash,value,deleted_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6::jsonb,CASE WHEN $7 THEN now() ELSE NULL END,now())
        ON CONFLICT(user_id,scope,record_id) DO UPDATE SET revision=excluded.revision,content_hash=excluded.content_hash,
        value=excluded.value,deleted_at=excluded.deleted_at,updated_at=now()
        RETURNING scope,record_id,revision,content_hash,deleted_at,updated_at`,
        [identity.sub,scope,operation.recordId,nextRevision,nextHash,json(value),operation.deleted])).rows[0];
      const sequence=integer((await client.query(`INSERT INTO public.sync_v5_heads(user_id,scope,sequence)
        VALUES($1,$2,1) ON CONFLICT(user_id,scope) DO UPDATE SET sequence=public.sync_v5_heads.sequence+1
        RETURNING sequence`,[identity.sub,scope])).rows[0]?.sequence);
      await client.query('INSERT INTO public.sync_v5_changes(user_id,scope,sequence,record_id) VALUES($1,$2,$3,$4)',[identity.sub,scope,sequence,operation.recordId]);
      const result={status:'applied',operationId:operation.id,...descriptor(saved)};
      applied.push(result);
      newlyApplied.push(result);
      if(evidenceBaseline){const projected=await readScheduleProjection(client,identity.sub);if(unsafeScheduleReplacement(evidenceBaseline,projected.value))fail(409,'SCHEDULE_EVIDENCE_IMMUTABLE');}
      await client.query(`INSERT INTO public.sync_v5_receipts(user_id,scope,operation_id,request_hash,result)
        VALUES($1,$2,$3,$4,$5::jsonb)`,[identity.sub,scope,operation.id,requestHash,json(result)]);
    }
    let projectionBuildMs=0,projectionRecordCount=0,projectionBytes=0;
    if(newlyApplied.length){
      const started=performance.now(),projection=await readScheduleProjection(client,identity.sub);
      await writeProjectionHead(client,identity.sub,projection.revision+1,projection.value,{recordV4Change:true});
      projectionBuildMs=Math.round(performance.now()-started);
      projectionRecordCount=projection.projectionRecordCount;projectionBytes=projection.projectionBytes;
    }
    await client.query(`WITH removed AS (
      DELETE FROM public.sync_v5_changes WHERE user_id=$1 AND scope=$2 AND created_at<now()-interval '90 days' RETURNING sequence
    ), floor AS (SELECT max(sequence) AS sequence FROM removed)
    UPDATE public.sync_v5_heads SET retained_after=GREATEST(retained_after,COALESCE((SELECT sequence FROM floor),retained_after))
    WHERE user_id=$1 AND scope=$2`,[identity.sub,scope]);
    const head=(await client.query('SELECT sequence FROM public.sync_v5_heads WHERE user_id=$1 AND scope=$2',[identity.sub,scope])).rows[0];
    return {ok:true,syncProtocol:5,applied,remote,conflicts,head:integer(head?.sequence??0),projectionBuildMs,projectionRecordCount,projectionBytes};
  }
  fail(404,'NOT_FOUND');
}
