import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, requestIdFrom } from '@/lib/api-response';
import { isSyncableStorageKey } from '@/lib/local-workspace';
import { canonicalJson } from '@/lib/sync/hash';
import type { SyncOperation } from '@/types/sync';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 1_000_000;
const MAX_OPERATIONS = 100;

function contentHash(value: unknown, deleted: boolean): string {
  return createHash('sha256').update(deleted ? '__deleted__' : canonicalJson(value)).digest('hex');
}

function validOperation(value: unknown): value is SyncOperation {
  if (!value || typeof value !== 'object') return false;
  const operation = value as Partial<SyncOperation>;
  if (!operation.id || !UUID.test(operation.id) || !operation.key || !isSyncableStorageKey(operation.key)) return false;
  if (!Number.isSafeInteger(operation.baseRevision) || Number(operation.baseRevision) < 0) return false;
  if (operation.baseHash !== null && (typeof operation.baseHash !== 'string' || !/^[0-9a-f]{64}$/i.test(operation.baseHash))) return false;
  if (typeof operation.deleted !== 'boolean' || typeof operation.clientUpdatedAt !== 'string') return false;
  if (!operation.deleted && !Object.prototype.hasOwnProperty.call(operation, 'value')) return false;
  if (operation.resolvesOperationId && !UUID.test(operation.resolvesOperationId)) return false;
  if (!Number.isFinite(Date.parse(operation.clientUpdatedAt))) return false;
  return (JSON.stringify(operation.value) ?? 'null').length <= 100_000 && (JSON.stringify(operation.baseValue) ?? 'null').length <= 100_000;
}

export async function GET(request: NextRequest) {
  const requestId = requestIdFrom(request);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError(requestId, 'Unauthorized', 401, 'UNAUTHORIZED');

  const rawCursor = request.nextUrl.searchParams.get('cursor');
  const cursor = rawCursor && Number.isFinite(Date.parse(rawCursor)) ? new Date(rawCursor).toISOString() : null;
  let query = supabase
    .from('legacy_sync_data')
    .select('storage_key, storage_value, revision, content_hash, deleted_at, updated_at')
    .eq('user_id', user.id)
    .order('updated_at')
    .order('id')
    .limit(500);
  if (cursor) query = query.gt('updated_at', cursor);
  const { data, error } = await query;
  if (error) return apiError(requestId, 'Unable to read sync records', 500, 'SYNC_READ_FAILED');

  const nextCursor = data?.length ? data[data.length - 1].updated_at : new Date().toISOString();
  return NextResponse.json({
    ok: true,
    records: (data ?? []).map((row) => ({
      key: row.storage_key,
      value: row.deleted_at ? null : row.storage_value,
      revision: Number(row.revision),
      contentHash: row.content_hash,
      deleted: Boolean(row.deleted_at),
      updatedAt: row.updated_at,
    })),
    cursor: nextCursor,
    serverTime: new Date().toISOString(),
    requestId,
  });
}

export async function POST(request: NextRequest) {
  const requestId = requestIdFrom(request);
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_BODY_BYTES) return apiError(requestId, 'Request body too large', 413, 'PAYLOAD_TOO_LARGE');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError(requestId, 'Unauthorized', 401, 'UNAUTHORIZED');
  const body = await request.json().catch(() => null) as {
    deviceId?: string;
    device?: { name?: string; platform?: string };
    operations?: unknown[];
  } | null;
  if (!body || JSON.stringify(body).length > MAX_BODY_BYTES || !body.deviceId || !UUID.test(body.deviceId)) {
    return apiError(requestId, 'Invalid request body', 400, 'INVALID_BODY');
  }
  if (!Array.isArray(body.operations) || body.operations.length > MAX_OPERATIONS || !body.operations.every(validOperation)) {
    return apiError(requestId, 'Invalid sync operations', 400, 'INVALID_OPERATIONS');
  }

  const platform = ['web', 'pwa', 'mobile-web'].includes(body.device?.platform ?? '') ? body.device!.platform! : 'web';
  const name = String(body.device?.name || 'Web browser').trim().slice(0, 80) || 'Web browser';
  const existing = await supabase.from('web_sync_devices').select('revoked_at').eq('user_id', user.id).eq('id', body.deviceId).maybeSingle();
  if (existing.error) return apiError(requestId, 'Unable to validate device', 500, 'DEVICE_CHECK_FAILED');
  if (existing.data?.revoked_at) return apiError(requestId, 'Device has been revoked', 403, 'DEVICE_REVOKED');
  const deviceResult = await supabase.from('web_sync_devices').upsert({
    id: body.deviceId,
    user_id: user.id,
    name,
    platform,
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });
  if (deviceResult.error) return apiError(requestId, 'Unable to register device', 500, 'DEVICE_REGISTER_FAILED');

  const minuteAgo = new Date(Date.now() - 60_000).toISOString();
  const { count: recentOperations, error: rateError } = await supabase.from('sync_operations')
    .select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', minuteAgo);
  if (rateError) return apiError(requestId, 'Unable to validate sync rate', 500, 'RATE_CHECK_FAILED');
  if ((recentOperations ?? 0) + body.operations.length > 600) {
    return apiError(requestId, 'Too many sync operations', 429, 'RATE_LIMITED');
  }

  const applied: Array<{ operationId: string; key: string; revision: number; contentHash: string }> = [];
  const conflicts: Array<Record<string, unknown>> = [];
  for (const raw of body.operations) {
    const operation = raw as SyncOperation;
    const { data, error } = await supabase.rpc('apply_web_sync_operation', {
      p_operation_id: operation.id,
      p_device_id: body.deviceId,
      p_storage_key: operation.key,
      p_base_revision: operation.baseRevision,
      p_base_hash: operation.baseHash,
      p_base_value: operation.baseValue ?? null,
      p_value: operation.deleted ? null : operation.value,
      p_content_hash: contentHash(operation.value, operation.deleted),
      p_deleted: operation.deleted,
    });
    if (error) return apiError(requestId, 'Unable to apply sync operation', 500, 'SYNC_WRITE_FAILED');
    const result = data as { status?: string; revision?: number; contentHash?: string; remoteValue?: unknown; remoteDeleted?: boolean; remoteHash?: string | null };
    if (result.status === 'applied') {
      applied.push({ operationId: operation.id, key: operation.key, revision: Number(result.revision), contentHash: String(result.contentHash) });
      if (operation.resolvesOperationId) {
        await supabase.from('sync_conflicts').update({ resolved_at: new Date().toISOString() })
          .eq('user_id', user.id).eq('operation_id', operation.resolvesOperationId);
      }
    } else {
      conflicts.push({
        operationId: operation.id,
        key: operation.key,
        baseRevision: operation.baseRevision,
        baseValue: operation.baseValue,
        localValue: operation.deleted ? null : operation.value,
        localDeleted: operation.deleted,
        remoteValue: result.remoteValue,
        remoteDeleted: Boolean(result.remoteDeleted),
        remoteHash: result.remoteHash ?? null,
        remoteRevision: Number(result.revision ?? 0),
      });
    }
  }

  return NextResponse.json({ ok: true, applied, conflicts, cursor: new Date().toISOString(), serverTime: new Date().toISOString(), requestId });
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
