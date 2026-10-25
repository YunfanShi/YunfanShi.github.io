import { createHash, randomUUID } from 'node:crypto';
import { isSyncableStorageKey, syncValueFits } from '../../src/lib/local-workspace.ts';
import { canonicalJson } from '../../src/lib/sync/hash.ts';
import { SCHEDULE_STORAGE_KEY, unsafeScheduleReplacement } from '../../src/lib/sync/schedule-safety.ts';
import { MAX_LARGE_SYNC_BYTES, MAX_SYNC_PARTS, MAX_SYNC_UPLOAD_PART_BYTES } from '../../src/lib/sync/transfer.ts';
import { ApiError } from './errors.mjs';
import { applyRecordDelta } from '../../src/lib/sync/delta.ts';
import { decodeSyncUpload, compressSyncPart } from '../../src/lib/sync/compression.ts';
import { handleSyncV4 } from './sync-v4.mjs';
import { handleSyncV5,syncV5Rollout } from './sync-v5.mjs';
import {readScheduleProjection,scheduleProjectionState,replaceScheduleResources,writeProjectionHead} from './sync-v5.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[a-f0-9]{64}$/i;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const BACKUP_PAGES = new Set(['schedule','study','definitions','ielts','vocabulary','quiz','poetry','music','countdown','relax','reader','sites','settings','other']);
const fail = (status, code) => { throw new ApiError(status, code); };
const json = value => JSON.stringify(value ?? null);
const iso = value => value instanceof Date ? value.toISOString() : value;
const hash = (value, deleted) => createHash('sha256').update(deleted ? '__deleted__' : canonicalJson(value)).digest('hex');
const validOperation = (op, large) => op && typeof op === 'object' && UUID.test(op.id ?? '')
  && typeof op.key === 'string' && isSyncableStorageKey(op.key)
  && Number.isSafeInteger(op.baseRevision) && op.baseRevision >= 0
  && (op.baseHash === null || (typeof op.baseHash === 'string' && HASH.test(op.baseHash)))
  && typeof op.deleted === 'boolean' && (op.deleted || Object.hasOwn(op, 'value') || Array.isArray(op.patch))
  && typeof op.clientUpdatedAt === 'string' && Number.isFinite(Date.parse(op.clientUpdatedAt))
  && (!op.resolvesOperationId || UUID.test(op.resolvesOperationId))
  && (large || (syncValueFits(op.value) && syncValueFits(op.baseValue)));

async function applyOperation(client, op, deviceId) {
  const result = await client.query(`SELECT public.apply_web_sync_operation(
    $1::uuid,$2::uuid,$3::text,$4::bigint,$5::text,$6::jsonb,$7::jsonb,$8::text,$9::boolean,$10::timestamptz) AS result`,
  [op.id, deviceId, op.key, op.baseRevision, op.baseHash, json(op.baseValue),
    json(op.deleted ? null : op.value), hash(op.value, op.deleted), op.deleted, op.clientUpdatedAt]);
  return result.rows[0].result;
}

async function applyBody(client, identity, body, large = false, originalOperations = body?.operations) {
  if (body?.syncProtocol !== 3 && body?.requireCurrentVersion !== true) fail(426, 'SYNC_UPGRADE_REQUIRED');
  if (!body || !UUID.test(body.deviceId ?? '') || json(body).length > (large ? MAX_LARGE_SYNC_BYTES : 1_000_000)) fail(400, 'INVALID_BODY');
  if (!Array.isArray(body.operations) || body.operations.length > 100 || !body.operations.every(op => validOperation(op, large))) fail(400, 'INVALID_OPERATIONS');
  if (new Set(body.operations.map(op => op.key)).size !== body.operations.length) fail(400, 'DUPLICATE_KEYS');
  if (new Set(body.operations.map(op => op.id)).size !== body.operations.length) fail(400, 'DUPLICATE_OPERATION_IDS');
  if (Object.hasOwn(body, 'requireCurrentVersion') && typeof body.requireCurrentVersion !== 'boolean') fail(400, 'INVALID_BODY');
  // Restores must not use last-write-wins across a newer change. This check runs
  // in the same transaction and user write lock as the following mutation,
  // including when the request has been reassembled from large-value chunks.
  if (body.requireCurrentVersion && body.syncProtocol !== 3) {
    for (const op of body.operations) {
      const prior = (await client.query('SELECT storage_key,result,(SELECT request_hash FROM public.sync_v3_receipts r WHERE r.user_id=$1 AND r.operation_id=$2) AS request_hash FROM public.sync_operations WHERE user_id=$1 AND id=$2', [identity.sub,op.id])).rows[0];
      if (prior) {
        if (prior.storage_key !== op.key || prior.result?.status !== 'applied' || prior.result.contentHash !== hash(op.value,op.deleted)) fail(409,'RESTORE_OPERATION_MISMATCH');
        continue;
      }
      const current = (await client.query('SELECT revision,content_hash FROM public.legacy_sync_data WHERE user_id=$1 AND storage_key=$2 FOR UPDATE', [identity.sub, op.key])).rows[0];
      if (Number(current?.revision ?? 0) !== op.baseRevision || (current?.content_hash ?? null) !== op.baseHash) fail(409, 'RESTORE_VERSION_CHANGED');
    }
  }
  const schedule = body.operations.find(op => op.key === SCHEDULE_STORAGE_KEY);
  if (schedule && !Object.hasOwn(schedule,'patch')) {
    const current = (await client.query('SELECT storage_value,deleted_at FROM public.legacy_sync_data WHERE user_id=$1 AND storage_key=$2 FOR UPDATE', [identity.sub, SCHEDULE_STORAGE_KEY])).rows[0];
    if (!current?.deleted_at && unsafeScheduleReplacement(current?.storage_value, schedule.deleted ? null : schedule.value)) fail(409, 'SCHEDULE_EMPTY_REPLACEMENT');
  }
  const device = (await client.query('SELECT revoked_at FROM public.web_sync_devices WHERE id=$1 AND user_id=$2', [body.deviceId, identity.sub])).rows[0];
  if (device?.revoked_at) fail(403, 'DEVICE_REVOKED');
  const platform = ['web', 'pwa', 'mobile-web'].includes(body.device?.platform) ? body.device.platform : 'web';
  const name = String(body.device?.name || 'Web browser').trim().slice(0, 80) || 'Web browser';
  await client.query(`INSERT INTO public.web_sync_devices(id,user_id,name,platform,last_seen_at,updated_at)
    VALUES($1,$2,$3,$4,now(),now()) ON CONFLICT(id) DO UPDATE SET name=excluded.name,
    platform=excluded.platform,last_seen_at=now(),updated_at=now()`, [body.deviceId, identity.sub, name, platform]);
  const recent = (await client.query("SELECT count(*)::integer AS count FROM public.sync_operations WHERE user_id=$1 AND created_at>=now()-interval '1 minute'", [identity.sub])).rows[0].count;
  if (recent + body.operations.length > 600) fail(429, 'RATE_LIMITED');
  const applied = [], remote = [], conflicts = [];
  for (const incoming of body.operations) {
    const requestSource=originalOperations?.find(operation=>operation.id===incoming.id)??incoming;
    const requestHash = createHash('sha256').update(canonicalJson(requestSource)).digest('hex');
    const prior = (await client.query('SELECT storage_key,result,(SELECT request_hash FROM public.sync_v3_receipts r WHERE r.user_id=$1 AND r.operation_id=$2) AS request_hash FROM public.sync_operations WHERE user_id=$1 AND id=$2', [identity.sub,incoming.id])).rows[0];
    const current = prior ? undefined : (await client.query('SELECT * FROM public.legacy_sync_data WHERE user_id=$1 AND storage_key=$2 FOR UPDATE', [identity.sub,incoming.key])).rows[0];
    let op = incoming;
    let result;
    if (prior) {
      if (prior.storage_key !== incoming.key || ((prior.request_hash ?? prior.result.requestHash) ? (prior.request_hash ?? prior.result.requestHash) !== requestHash : prior.result.status === 'applied' && (Object.hasOwn(incoming,'patch') || prior.result.contentHash !== hash(incoming.value,incoming.deleted)))) fail(409,'OPERATION_ID_REUSED');
      result = prior.result;
    } else if (Number(current?.revision ?? 0) !== incoming.baseRevision || (current?.content_hash ?? null) !== incoming.baseHash) {
      result = {status:'conflict',revision:Number(current?.revision ?? 0),remoteValue:current?.storage_value ?? null,
        remoteDeleted:!current || Boolean(current.deleted_at),remoteHash:current?.content_hash ?? null,
        remoteUpdatedAt:iso(current?.updated_at)};
      await client.query(`INSERT INTO public.sync_conflicts(user_id,device_id,operation_id,storage_key,base_revision,base_value,local_value,local_deleted,remote_value,remote_deleted,remote_hash,remote_revision)
        VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9::jsonb,$10,$11,$12) ON CONFLICT(user_id,operation_id) DO NOTHING`,
        [identity.sub,body.deviceId,op.id,op.key,op.baseRevision,json(op.baseValue),json(op.patch ? {syncDelta:op.patch} : op.value),op.deleted,json(result.remoteValue),result.remoteDeleted,result.remoteHash,result.revision]);
      await client.query('INSERT INTO public.sync_operations(id,user_id,device_id,storage_key,result) VALUES($1,$2,$3,$4,$5::jsonb)',
        [op.id,identity.sub,body.deviceId,op.key,json({...result,requestHash})]);
    } else {
      if (Object.hasOwn(op,'patch')) {
        try { op = {...op,value:op.deleted ? null : applyRecordDelta(current?.deleted_at ? undefined : current?.storage_value,op.patch)}; }
        catch { fail(400,'INVALID_DELTA'); }
      }
      if (!op.deleted && op.value === undefined) fail(400,'INVALID_DELTA');
      if (json(op.value).length > MAX_LARGE_SYNC_BYTES) fail(413,'PAYLOAD_TOO_LARGE');
      if (op.key === SCHEDULE_STORAGE_KEY && !current?.deleted_at && unsafeScheduleReplacement(current?.storage_value,op.deleted ? null : op.value)) fail(409,'SCHEDULE_EMPTY_REPLACEMENT');
      result = await applyOperation(client,op,body.deviceId);
      await client.query('INSERT INTO public.sync_v3_receipts(user_id,operation_id,request_hash) VALUES($1,$2,$3)',[identity.sub,op.id,requestHash]);
    }
    if (result.status === 'remote' || result.status === 'conflict') {
      const row = (await client.query('SELECT * FROM public.list_web_sync_records(NULL,$1)',[op.key])).rows[0];
      if (!row && Number(result.revision) !== 0) fail(503,'SYNC_REMOTE_UNAVAILABLE');
      if (row && row.storage_key !== op.key) fail(503,'SYNC_REMOTE_UNAVAILABLE');
      if (row) result = { ...result,revision:Number(row.revision),remoteValue:row.storage_value,
        remoteLarge:Boolean(row.large),remoteDeleted:Boolean(row.deleted_at),
        remoteHash:row.content_hash,remoteUpdatedAt:iso(row.updated_at) };
    }
    if (result.status === 'applied') applied.push({ operationId: op.id, key: op.key, revision: Number(result.revision), contentHash: result.contentHash, updatedAt: result.updatedAt ?? op.clientUpdatedAt });
    else if (result.status === 'remote') {
      const large = !result.remoteDeleted && (Boolean(result.remoteLarge) || !syncValueFits(result.remoteValue));
      remote.push({ key: op.key, value: large ? null : result.remoteValue, revision: Number(result.revision ?? 0),
        contentHash: result.remoteHash ?? null, deleted: Boolean(result.remoteDeleted), updatedAt: result.remoteUpdatedAt, large });
    } else {
      const remoteLarge = !result.remoteDeleted && (Boolean(result.remoteLarge) || !syncValueFits(result.remoteValue));
      conflicts.push({ operationId: op.id, key: op.key, baseRevision: op.baseRevision, baseValue: op.baseValue,
        localValue: op.deleted ? null : op.value ?? {syncDelta:op.patch}, localDeleted: op.deleted, remoteValue: remoteLarge ? null : result.remoteValue,
        remoteLarge, remoteDeleted: Boolean(result.remoteDeleted), remoteHash: result.remoteHash,
        remoteRevision: Number(result.revision ?? 0), remoteUpdatedAt: result.remoteUpdatedAt });
    }
    if (['applied', 'remote'].includes(result.status) && op.resolvesOperationId) {
      await client.query('UPDATE public.sync_conflicts SET resolved_at=now() WHERE operation_id=$1 AND user_id=$2', [op.resolvesOperationId, identity.sub]);
    }
  }
  return { ok: true, applied, remote, conflicts, cursor: new Date().toISOString(), serverTime: new Date().toISOString() };
}

export function createSyncApi(database, { verifyBackupCapture } = {}) {
  return async function handle(method, url, body, identity, token, context={}) {
    const route = url.pathname;
    const write = method !== 'GET';
    // Verify a committed source receipt before opening the Azure transaction.
    // User-controlled HTTP calls cannot clear an unsaved backup generation.
    if (route === '/api/sync/backup-markers' && method === 'POST') {
      if (!body || !BACKUP_PAGES.has(body.page) || !UUID.test(body.generation ?? '')
        || !Number.isSafeInteger(body.versionId) || body.versionId < 1 || json(body).length > 512) fail(400,'INVALID_BACKUP_MARKER');
      if (!verifyBackupCapture) fail(503,'BACKUP_CAPTURE_VERIFICATION_UNAVAILABLE');
      await verifyBackupCapture(identity,token,body);
    }
    return database.withUser(identity, async client => {
      if (route.startsWith('/api/sync/v5')) {
        const result=await handleSyncV5(client,identity,method,url,body,syncV5Rollout(identity));
        if(Number.isFinite(result.projectionBuildMs))Object.assign(context,{projectionBuildMs:result.projectionBuildMs,
          projectionRecordCount:result.projectionRecordCount,projectionV5RecordBytes:result.projectionBytes,
          projectionStorageInsertBytes:result.projectionStorageInsertBytes});
        return result;
      }
      const v5Scopes=syncV5Rollout(identity);
      let projectionScopesPromise;
      const projectionScopes=()=>projectionScopesPromise??=scheduleProjectionState(client,identity.sub,v5Scopes);
      const scheduleProjection=async()=>{
        if(await projectionScopes()===null)return null;
        return readScheduleProjection(client,identity.sub);
      };
      const shapeScheduleRecord=async(record)=>{
        if(!record||record.key!==SCHEDULE_STORAGE_KEY)return record;
        const projection=await scheduleProjection();
        if(!projection)return record;
        const large=!projection.legacy?.deleted_at&&!syncValueFits(projection.value);
        return {...record,value:large?null:projection.value,revision:projection.revision,contentHash:projection.contentHash,
          deleted:false,large,updatedAt:projection.legacy?.updated_at?iso(projection.legacy.updated_at):record.updatedAt};
      };
      const applyCompatibleBody=async(requestBody,large=false)=>{
        if(!Array.isArray(requestBody?.operations))return applyBody(client,identity,requestBody,large);
        const operation=requestBody.operations.find(row=>row.key===SCHEDULE_STORAGE_KEY);
        if(!operation)return applyBody(client,identity,requestBody,large);
        if(json(requestBody).length>(large?MAX_LARGE_SYNC_BYTES:1_000_000)||!requestBody.operations.every(row=>validOperation(row,large)))fail(400,'INVALID_OPERATIONS');
        const projection=await scheduleProjection();
        if(!projection)return applyBody(client,identity,requestBody,large);
        const physical=projection.legacy,baseMatches=!operation.deleted&&operation.baseRevision===projection.revision&&operation.baseHash===projection.contentHash;
        let nextValue;
        if(baseMatches){
          try{nextValue=Object.hasOwn(operation,'patch')?applyRecordDelta(projection.value,operation.patch):(operation.deleted?null:operation.value);}
          catch{fail(400,'INVALID_DELTA');}
          if(!operation.deleted&&unsafeScheduleReplacement(projection.value,nextValue))fail(409,'SCHEDULE_EMPTY_REPLACEMENT');
        }
        const physicalRevision=Number(physical?.revision??0),physicalHash=physical?.content_hash??null;
        const rewritten={...operation,baseRevision:baseMatches?physicalRevision:physicalRevision+1,baseHash:baseMatches?physicalHash:'0'.repeat(64),baseValue:baseMatches?(physical?.storage_value??null):operation.baseValue};
        if(baseMatches){delete rewritten.patch;rewritten.value=nextValue;rewritten.deleted=operation.deleted;}
        const response=await applyBody(client,identity,{...requestBody,operations:requestBody.operations.map(row=>row===operation?rewritten:row)},true,requestBody.operations);
        const conflict=response.conflicts?.find(row=>row.operationId===operation.id);
        if(conflict){
          Object.assign(conflict,{remoteValue:projection.value,remoteDeleted:false,remoteHash:projection.contentHash,remoteRevision:projection.revision});
          await client.query(`UPDATE public.sync_conflicts SET remote_value=$1::jsonb,remote_deleted=false,remote_hash=$2,remote_revision=$3
            WHERE user_id=$4 AND operation_id=$5`,[json(projection.value),projection.contentHash,projection.revision,identity.sub,operation.id]);
        }
        const applied=response.applied?.find(row=>row.operationId===operation.id);
        if(applied&&baseMatches&&!operation.deleted){
          await replaceScheduleResources(client,identity.sub,nextValue,await projectionScopes()??[]);
          const head=await writeProjectionHead(client,identity.sub,Number(applied.revision),nextValue);
          if(head.contentHash!==applied.contentHash)fail(503,'SYNC_V5_PROJECTION_HASH_MISMATCH');
        }
        return response;
      };
      if (route === '/api/sync/v4') {
        const response=await handleSyncV4(client,identity,method,url,body,(c,i,b,large)=>applyCompatibleBody(b,large));
        if(method==='GET'&&Array.isArray(response.records))response.records=await Promise.all(response.records.map(shapeScheduleRecord));
        return response;
      }
      if (route === '/api/sync/backup-markers') {
        if (method === 'GET') {
          const markers = (await client.query('SELECT public.sync_backup_markers() AS markers')).rows[0]?.markers;
          if (!Array.isArray(markers) || markers.length > BACKUP_PAGES.size
            || markers.some(r=>!r || !BACKUP_PAGES.has(r.page) || !UUID.test(r.generation ?? '') || typeof r.due !== 'boolean')
            || new Set(markers.map(r=>r.page)).size !== markers.length) fail(503,'BACKUP_MARKERS_UNAVAILABLE');
          return { ok:true,markers };
        }
        if (method !== 'POST') fail(405,'METHOD_NOT_ALLOWED');
        const acknowledged = (await client.query('SELECT public.ack_sync_backup_marker($1,$2::uuid) AS acknowledged',[body.page,body.generation])).rows[0]?.acknowledged;
        if (typeof acknowledged !== 'boolean') fail(503,'BACKUP_ACK_UNAVAILABLE');
        return { ok:true,acknowledged };
      }
      if (route === '/api/legacy-sync') {
        if (method === 'GET') {
          const rows = (await client.query(`SELECT storage_key,storage_value,updated_at FROM public.legacy_sync_data
            WHERE user_id=$1 AND deleted_at IS NULL AND octet_length(storage_value::text)<=400000
            ORDER BY updated_at,id LIMIT 500`, [identity.sub])).rows;
          const data = Object.create(null), timestamps = Object.create(null);
          for (const row of rows) if (isSyncableStorageKey(row.storage_key)) {
            data[row.storage_key] = row.storage_value; timestamps[row.storage_key] = iso(row.updated_at);
          }
          if(Object.hasOwn(data,SCHEDULE_STORAGE_KEY))data[SCHEDULE_STORAGE_KEY]=(await shapeScheduleRecord({key:SCHEDULE_STORAGE_KEY,value:data[SCHEDULE_STORAGE_KEY],revision:0,contentHash:null,deleted:false,updatedAt:timestamps[SCHEDULE_STORAGE_KEY]})).value;
          return { ok: true, data, timestamps };
        }
        if (!['POST', 'PUT', 'DELETE'].includes(method)) fail(405, 'METHOD_NOT_ALLOWED');
        fail(426,'SYNC_UPGRADE_REQUIRED');
      }
      if (route === '/api/sync/export') {
        if (method !== 'GET') fail(405, 'METHOD_NOT_ALLOWED');
        const after = url.searchParams.get('after') ?? '';
        if (after.length > 120 || (after && !isSyncableStorageKey(after))) fail(400, 'INVALID_CURSOR');
        const visible = []; let position = after;
        // Fill one page with authorized sync keys without exposing blocked key
        // names in cursors. The database scan is bounded independently of output.
        for (let scanned=0;scanned<20000 && visible.length<21;scanned+=21) {
          const rows = (await client.query(`SELECT storage_key,revision,content_hash,deleted_at,updated_at,client_updated_at,
            CASE WHEN deleted_at IS NOT NULL OR octet_length(storage_value::text)>400000 THEN NULL ELSE storage_value END AS storage_value,
            deleted_at IS NULL AND octet_length(storage_value::text)>400000 AS large
            FROM public.legacy_sync_data WHERE user_id=$1 AND storage_key COLLATE "C">$2 COLLATE "C"
            ORDER BY storage_key COLLATE "C" LIMIT 21`,[identity.sub,position])).rows;
          for (const row of rows) if (isSyncableStorageKey(row.storage_key)) visible.push(row);
          if (rows.length<21 || visible.length>=21) break;
          const next = rows.at(-1).storage_key;
          if (Buffer.compare(Buffer.from(next),Buffer.from(position))<=0) fail(503,'EXPORT_CURSOR_INVALID');
          position=next;
          if (scanned+21>=20000) fail(413,'EXPORT_SCAN_LIMIT');
        }
        const page = visible.slice(0,20);
        const records=page.filter(row=>isSyncableStorageKey(row.storage_key)).map(row=>({
          key:row.storage_key,value:row.storage_value,revision:Number(row.revision),contentHash:row.content_hash,
          deleted:Boolean(row.deleted_at),large:Boolean(row.large),updatedAt:iso(row.updated_at),
        }));
        return {ok:true,records:await Promise.all(records.map(shapeScheduleRecord)),next:visible.length>20?page.at(-1).storage_key:null};
      }
      if (route === '/api/sync/v3') {
        if (method !== 'GET') fail(405,'METHOD_NOT_ALLOWED');
        const after = url.searchParams.get('after') ?? '';
        if (after && !isSyncableStorageKey(after)) fail(400,'INVALID_CURSOR');
        const visible=[];let position=after;
        for(let scanned=0;scanned<20000 && visible.length<101;scanned+=101){
          const rows=(await client.query(`SELECT storage_key,revision,content_hash,deleted_at,client_updated_at,updated_at
            FROM public.legacy_sync_data WHERE user_id=$1 AND storage_key COLLATE "C" > $2 COLLATE "C"
            ORDER BY storage_key COLLATE "C" LIMIT 101`,[identity.sub,position])).rows;
          for(const row of rows)if(isSyncableStorageKey(row.storage_key))visible.push(row);
          if(rows.length<101 || visible.length>=101)break;
          const next=rows.at(-1).storage_key;
          if(Buffer.compare(Buffer.from(next),Buffer.from(position))<=0)fail(503,'MANIFEST_CURSOR_INVALID');
          position=next;
          if(scanned+101>=20000)fail(413,'MANIFEST_SCAN_LIMIT');
        }
        const page=visible.slice(0,100);
        const records=page.map(row=>({key:row.storage_key,revision:Number(row.revision),contentHash:row.content_hash,
          deleted:Boolean(row.deleted_at),updatedAt:iso(row.updated_at)}));
        return {ok:true,syncProtocol:3,transferEncoding:'gzip',records:await Promise.all(records.map(shapeScheduleRecord)),next:visible.length>100?page.at(-1).storage_key:null};
      }
      if (route === '/api/sync/v2') {
        if (method === 'POST') return applyCompatibleBody(body);
        if (method !== 'GET') fail(405, 'METHOD_NOT_ALLOWED');
        const key = url.searchParams.get('key');
        if (key && !isSyncableStorageKey(key)) fail(400, 'INVALID_KEY');
        const rawCursor = url.searchParams.get('cursor');
        const cursor = rawCursor && Number.isFinite(Date.parse(rawCursor)) ? new Date(rawCursor).toISOString() : null;
        const rows = (await client.query('SELECT * FROM public.list_web_sync_records($1::timestamptz,$2::text)', [cursor, key])).rows;
        const records=rows.filter(row => isSyncableStorageKey(row.storage_key)).map(row => ({
          key: row.storage_key, value: row.deleted_at || !syncValueFits(row.storage_value) ? null : row.storage_value,
          revision: Number(row.revision), contentHash: row.content_hash, deleted: Boolean(row.deleted_at),
          large: !row.deleted_at && (row.large || !syncValueFits(row.storage_value)), updatedAt: iso(row.updated_at),
        }));
        return { ok: true, records:await Promise.all(records.map(shapeScheduleRecord)), cursor: rows.length ? iso(rows.at(-1).updated_at) : new Date().toISOString(), serverTime: new Date().toISOString() };
      }
      if (route === '/api/sync/v2/large') {
        if (method === 'GET') {
          const key = url.searchParams.get('key'), rawPart = url.searchParams.get('part'), rawRevision = url.searchParams.get('revision');
          const part = Number(rawPart), revision = Number(rawRevision);
          if (!key || !isSyncableStorageKey(key) || !rawPart || !rawRevision || !Number.isInteger(part) || part < 0 || !Number.isSafeInteger(revision) || revision < 1) fail(400, 'INVALID_BODY');
          if(key===SCHEDULE_STORAGE_KEY&&v5Scopes.length){
            const projection=await scheduleProjection();
            if(revision!==projection.revision)fail(409,'REVISION_CHANGED');
            const chunks=splitSyncBody(JSON.stringify(projection.value));
            if(part>=chunks.length)fail(400,'INVALID_PART');
            return {ok:true,revision,part,count:chunks.length,...compressSyncPart(chunks[part],url.searchParams.get('encoding')==='gzip')};
          }
          const chunk = (await client.query('SELECT public.get_web_sync_record_part($1,$2,$3) AS chunk', [key, revision, part])).rows[0].chunk;
          if (!chunk || chunk.error === 'REVISION_CHANGED') fail(409, 'REVISION_CHANGED');
          if (chunk.error === 'UNAUTHORIZED') fail(401, 'UNAUTHORIZED');
          if (chunk.error === 'PAYLOAD_TOO_LARGE') fail(413, 'PAYLOAD_TOO_LARGE');
          if (chunk.error) fail(400, 'INVALID_PART');
          return { ok: true, revision, part, count: chunk.count, ...compressSyncPart(chunk.data,url.searchParams.get('encoding')==='gzip') };
        }
        if (method !== 'POST') fail(405, 'METHOD_NOT_ALLOWED');
        if (!body || !UUID.test(body.uploadId ?? '') || json(body).length > 250_000) fail(400, 'INVALID_BODY');
        if (body.complete === true) {
          const rows = (await client.query('SELECT part_index,part_count,data FROM public.web_sync_upload_chunks WHERE user_id=$1 AND upload_id=$2 ORDER BY part_index LIMIT $3', [identity.sub, body.uploadId, MAX_SYNC_PARTS])).rows;
          const count = rows[0]?.part_count;
          if (!count || rows.length !== count || rows.some((row, index) => row.part_index !== index || row.part_count !== count)) fail(409, 'UPLOAD_INCOMPLETE');
          const byteCount = rows.reduce((sum, row) => sum + Buffer.byteLength(row.data, 'base64'), 0);
          if (byteCount > MAX_LARGE_SYNC_BYTES) fail(413, 'PAYLOAD_TOO_LARGE');
          let upload;
          try { upload = decodeSyncUpload(Buffer.concat(rows.map(row => Buffer.from(row.data, 'base64')))); }
          catch { fail(400, 'INVALID_BODY'); }
          if (!Array.isArray(upload?.operations) || upload.operations.length !== 1 || upload.operations[0]?.id !== body.uploadId) fail(400, 'INVALID_OPERATIONS');
          const result = await applyCompatibleBody(upload,true);
          await client.query('DELETE FROM public.web_sync_upload_chunks WHERE user_id=$1 AND upload_id=$2', [identity.sub, body.uploadId]);
          return result;
        }
        if (!Number.isInteger(body.index) || !Number.isInteger(body.count) || body.count < 1 || body.count > MAX_SYNC_PARTS
            || body.index < 0 || body.index >= body.count || typeof body.data !== 'string' || body.data.length < 1
            || body.data.length > 180_000 || !BASE64.test(body.data) || Buffer.byteLength(body.data, 'base64') > MAX_SYNC_UPLOAD_PART_BYTES) fail(400, 'INVALID_PART');
        if (body.index === 0) await client.query('DELETE FROM public.web_sync_upload_chunks WHERE user_id=$1 AND (upload_id=$2 OR created_at<now()-interval \'1 day\')', [identity.sub, body.uploadId]);
        await client.query(`INSERT INTO public.web_sync_upload_chunks(user_id,upload_id,part_index,part_count,data)
          VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,upload_id,part_index) DO UPDATE
          SET part_count=excluded.part_count,data=excluded.data`, [identity.sub, body.uploadId, body.index, body.count, body.data]);
        return { ok: true };
      }
      if (route === '/api/sync/devices') {
        if (method === 'GET') {
          const rows = (await client.query('SELECT id,name,platform,last_seen_at,revoked_at FROM public.web_sync_devices WHERE user_id=$1 ORDER BY last_seen_at DESC', [identity.sub])).rows;
          return { ok: true, devices: rows.map(row => ({ id: row.id, name: row.name, platform: row.platform, lastSeenAt: iso(row.last_seen_at), revokedAt: iso(row.revoked_at) })) };
        }
        if (!UUID.test(body?.id ?? '')) fail(400, 'INVALID_DEVICE');
        if (method === 'PATCH') {
          if (typeof body.name !== 'string' || !body.name.trim()) fail(400, 'INVALID_DEVICE');
          await client.query('UPDATE public.web_sync_devices SET name=$1,updated_at=now() WHERE id=$2 AND user_id=$3 AND revoked_at IS NULL', [body.name.trim().slice(0, 80), body.id, identity.sub]);
        } else if (method === 'DELETE') await client.query('UPDATE public.web_sync_devices SET revoked_at=now(),updated_at=now() WHERE id=$1 AND user_id=$2', [body.id, identity.sub]);
        else fail(405, 'METHOD_NOT_ALLOWED');
        return { ok: true };
      }
      if (route === '/api/sync/conflicts') {
        if (method === 'GET') {
          const rows = (await client.query('SELECT * FROM public.sync_conflicts WHERE user_id=$1 AND resolved_at IS NULL ORDER BY created_at DESC LIMIT 100', [identity.sub])).rows;
          return { ok: true, conflicts: rows.map(row => ({ id: row.id, operationId: row.operation_id, key: row.storage_key,
            baseRevision: Number(row.base_revision), baseValue: row.base_value, localValue: row.local_value,
            localDeleted: row.local_deleted, remoteValue: row.remote_value, remoteDeleted: row.remote_deleted,
            remoteHash: row.remote_hash, remoteRevision: Number(row.remote_revision), createdAt: iso(row.created_at) })) };
        }
        if (method !== 'POST') fail(405, 'METHOD_NOT_ALLOWED');
        if (!UUID.test(body?.conflictId ?? '') || !UUID.test(body?.deviceId ?? '')
            || (body.deleted !== true && !Object.hasOwn(body, 'value')) || !syncValueFits(body.value)) fail(400, 'INVALID_RESOLUTION');
        const conflict = (await client.query('SELECT * FROM public.sync_conflicts WHERE id=$1 AND user_id=$2 AND resolved_at IS NULL FOR UPDATE', [body.conflictId, identity.sub])).rows[0];
        if (!conflict) fail(404, 'NOT_FOUND');
        const op = { id: randomUUID(), key: conflict.storage_key, baseRevision: Number(conflict.remote_revision),
          baseHash: conflict.remote_hash, baseValue: conflict.remote_value, value: body.value,
          deleted: body.deleted === true, clientUpdatedAt: new Date().toISOString() };
        const response = await applyCompatibleBody({syncProtocol:3,deviceId:body.deviceId,operations:[op]});
        if (response.applied.length !== 1) fail(409, 'CONFLICT_CHANGED');
        await client.query('UPDATE public.sync_conflicts SET resolved_at=now() WHERE id=$1 AND user_id=$2', [conflict.id, identity.sub]);
        return { ok: true, operationId: op.id, revision: response.applied[0].revision };
      }
      fail(404, 'NOT_FOUND');
    }, { write,measureParameterBytes:route.startsWith('/api/sync/v5'),onMetrics:metrics=>Object.assign(context,metrics) });
  };
}
