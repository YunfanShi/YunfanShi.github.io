import { createHash, randomUUID } from 'node:crypto';
import { isSyncableStorageKey, syncValueFits } from '../../src/lib/local-workspace.ts';
import { canonicalJson } from '../../src/lib/sync/hash.ts';
import { SCHEDULE_STORAGE_KEY, unsafeScheduleReplacement } from '../../src/lib/sync/schedule-safety.ts';
import { MAX_LARGE_SYNC_BYTES, MAX_SYNC_PARTS, MAX_SYNC_UPLOAD_PART_BYTES } from '../../src/lib/sync/transfer.ts';
import { ApiError } from './errors.mjs';

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
  && typeof op.deleted === 'boolean' && (op.deleted || Object.hasOwn(op, 'value'))
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

async function applyBody(client, identity, body, large = false) {
  if (!body || !UUID.test(body.deviceId ?? '') || json(body).length > (large ? MAX_LARGE_SYNC_BYTES : 1_000_000)) fail(400, 'INVALID_BODY');
  if (!Array.isArray(body.operations) || body.operations.length > 100 || !body.operations.every(op => validOperation(op, large))) fail(400, 'INVALID_OPERATIONS');
  if (new Set(body.operations.map(op => op.key)).size !== body.operations.length) fail(400, 'DUPLICATE_KEYS');
  if (new Set(body.operations.map(op => op.id)).size !== body.operations.length) fail(400, 'DUPLICATE_OPERATION_IDS');
  if (Object.hasOwn(body, 'requireCurrentVersion') && typeof body.requireCurrentVersion !== 'boolean') fail(400, 'INVALID_BODY');
  // Restores must not use last-write-wins across a newer change. This check runs
  // in the same transaction and user write lock as the following mutation,
  // including when the request has been reassembled from large-value chunks.
  if (body.requireCurrentVersion) {
    for (const op of body.operations) {
      const current = (await client.query('SELECT revision,content_hash FROM public.legacy_sync_data WHERE user_id=$1 AND storage_key=$2 FOR UPDATE', [identity.sub, op.key])).rows[0];
      if (Number(current?.revision ?? 0) !== op.baseRevision || (current?.content_hash ?? null) !== op.baseHash) fail(409, 'RESTORE_VERSION_CHANGED');
    }
  }
  const schedule = body.operations.find(op => op.key === SCHEDULE_STORAGE_KEY);
  if (schedule) {
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
  for (const op of body.operations) {
    let result = await applyOperation(client, op, body.deviceId);
    if (result.status === 'remote' || result.status === 'conflict') {
      const row = (await client.query('SELECT * FROM public.list_web_sync_records(NULL,$1)',[op.key])).rows[0];
      if (!row || row.storage_key !== op.key) fail(503,'SYNC_REMOTE_UNAVAILABLE');
      result = { ...result,revision:Number(row.revision),remoteValue:row.storage_value,
        remoteLarge:Boolean(row.large),remoteDeleted:Boolean(row.deleted_at),
        remoteHash:row.content_hash,remoteUpdatedAt:iso(row.client_updated_at ?? row.updated_at) };
    }
    if (result.status === 'applied') applied.push({ operationId: op.id, key: op.key, revision: Number(result.revision), contentHash: result.contentHash, updatedAt: result.updatedAt ?? op.clientUpdatedAt });
    else if (result.status === 'remote') {
      const large = !result.remoteDeleted && (Boolean(result.remoteLarge) || !syncValueFits(result.remoteValue));
      remote.push({ key: op.key, value: large ? null : result.remoteValue, revision: Number(result.revision ?? 0),
        contentHash: result.remoteHash ?? null, deleted: Boolean(result.remoteDeleted), updatedAt: result.remoteUpdatedAt, large });
    } else {
      const remoteLarge = !result.remoteDeleted && (Boolean(result.remoteLarge) || !syncValueFits(result.remoteValue));
      conflicts.push({ operationId: op.id, key: op.key, baseRevision: op.baseRevision, baseValue: op.baseValue,
        localValue: op.deleted ? null : op.value, localDeleted: op.deleted, remoteValue: remoteLarge ? null : result.remoteValue,
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
  return async function handle(method, url, body, identity, token) {
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
          return { ok: true, data, timestamps };
        }
        if (!['POST', 'PUT', 'DELETE'].includes(method)) fail(405, 'METHOD_NOT_ALLOWED');
        const entries = method === 'DELETE' ? [{ key: body?.key, value: null }]
          : Array.isArray(body?.entries) ? body.entries : [{ key: body?.key, value: body?.value }];
        if (!entries.length || entries.length > 200 || new Set(entries.map(e => e?.key)).size !== entries.length) fail(400, 'INVALID_ENTRIES');
        const operations = [];
        for (const entry of entries) {
          if (typeof entry?.key !== 'string' || !isSyncableStorageKey(entry.key)) fail(400, 'INVALID_KEY');
          let value = entry.value;
          if (typeof value === 'string') { try { value = JSON.parse(value); } catch { /* Plain legacy strings are valid. */ } }
          if (json(value).length > 100_000) fail(413, 'PAYLOAD_TOO_LARGE');
          const current = (await client.query('SELECT revision,content_hash,storage_value FROM public.legacy_sync_data WHERE user_id=$1 AND storage_key=$2', [identity.sub, entry.key])).rows[0];
          operations.push({ id: randomUUID(), key: entry.key, value, deleted: method === 'DELETE',
            baseRevision: Number(current?.revision ?? 0), baseHash: current?.content_hash ?? null,
            baseValue: current?.storage_value ?? null, clientUpdatedAt: new Date().toISOString() });
        }
        for (let start = 0; start < operations.length; start += 100) {
          await applyBody(client, identity, { deviceId: identity.session_id,
            device: { name: 'Legacy compatibility', platform: 'web' }, operations: operations.slice(start, start + 100) });
        }
        return { ok: true, count: operations.length, timestamp: new Date().toISOString() };
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
        return { ok:true,records:page.filter(row=>isSyncableStorageKey(row.storage_key)).map(row=>({
          key:row.storage_key,value:row.storage_value,revision:Number(row.revision),contentHash:row.content_hash,
          deleted:Boolean(row.deleted_at),large:Boolean(row.large),updatedAt:iso(row.client_updated_at ?? row.updated_at),
        })),next:visible.length>20?page.at(-1).storage_key:null };
      }
      if (route === '/api/sync/v2') {
        if (method === 'POST') return applyBody(client, identity, body);
        if (method !== 'GET') fail(405, 'METHOD_NOT_ALLOWED');
        const key = url.searchParams.get('key');
        if (key && !isSyncableStorageKey(key)) fail(400, 'INVALID_KEY');
        const rawCursor = url.searchParams.get('cursor');
        const cursor = rawCursor && Number.isFinite(Date.parse(rawCursor)) ? new Date(rawCursor).toISOString() : null;
        const rows = (await client.query('SELECT * FROM public.list_web_sync_records($1::timestamptz,$2::text)', [cursor, key])).rows;
        return { ok: true, records: rows.filter(row => isSyncableStorageKey(row.storage_key)).map(row => ({
          key: row.storage_key, value: row.deleted_at || !syncValueFits(row.storage_value) ? null : row.storage_value,
          revision: Number(row.revision), contentHash: row.content_hash, deleted: Boolean(row.deleted_at),
          large: !row.deleted_at && (row.large || !syncValueFits(row.storage_value)), updatedAt: iso(row.client_updated_at ?? row.updated_at),
        })), cursor: rows.length ? iso(rows.at(-1).updated_at) : new Date().toISOString(), serverTime: new Date().toISOString() };
      }
      if (route === '/api/sync/v2/large') {
        if (method === 'GET') {
          const key = url.searchParams.get('key'), rawPart = url.searchParams.get('part'), rawRevision = url.searchParams.get('revision');
          const part = Number(rawPart), revision = Number(rawRevision);
          if (!key || !isSyncableStorageKey(key) || !rawPart || !rawRevision || !Number.isInteger(part) || part < 0 || !Number.isSafeInteger(revision) || revision < 1) fail(400, 'INVALID_BODY');
          const chunk = (await client.query('SELECT public.get_web_sync_record_part($1,$2,$3) AS chunk', [key, revision, part])).rows[0].chunk;
          if (!chunk || chunk.error === 'REVISION_CHANGED') fail(409, 'REVISION_CHANGED');
          if (chunk.error === 'UNAUTHORIZED') fail(401, 'UNAUTHORIZED');
          if (chunk.error === 'PAYLOAD_TOO_LARGE') fail(413, 'PAYLOAD_TOO_LARGE');
          if (chunk.error) fail(400, 'INVALID_PART');
          return { ok: true, revision, part, count: chunk.count, data: chunk.data };
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
          try { upload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(rows.map(row => Buffer.from(row.data, 'base64'))))); }
          catch { fail(400, 'INVALID_BODY'); }
          if (!Array.isArray(upload?.operations) || upload.operations.length !== 1 || upload.operations[0]?.id !== body.uploadId) fail(400, 'INVALID_OPERATIONS');
          const result = await applyBody(client, identity, upload, true);
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
        const result = await applyOperation(client, op, body.deviceId);
        if (result.status !== 'applied') fail(409, 'CONFLICT_CHANGED');
        await client.query('UPDATE public.sync_conflicts SET resolved_at=now() WHERE id=$1 AND user_id=$2', [conflict.id, identity.sub]);
        return { ok: true, operationId: op.id, revision: Number(result.revision) };
      }
      fail(404, 'NOT_FOUND');
    }, { write });
  };
}
