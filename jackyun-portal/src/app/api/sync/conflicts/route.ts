import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { apiError, requestIdFrom } from '@/lib/api-response';
import { canonicalJson } from '@/lib/sync/hash';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const requestId = requestIdFrom(request);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError(requestId, 'Unauthorized', 401, 'UNAUTHORIZED');
  const { data, error } = await supabase.from('sync_conflicts')
    .select('id, operation_id, storage_key, base_revision, base_value, local_value, local_deleted, remote_value, remote_deleted, remote_hash, remote_revision, created_at')
    .eq('user_id', user.id).is('resolved_at', null).order('created_at', { ascending: false }).limit(100);
  if (error) return apiError(requestId, 'Unable to list conflicts', 500, 'CONFLICT_LIST_FAILED');
  return NextResponse.json({ ok: true, conflicts: (data ?? []).map((row) => ({
    id: row.id, operationId: row.operation_id, key: row.storage_key, baseRevision: row.base_revision,
    baseValue: row.base_value, localValue: row.local_value, localDeleted: row.local_deleted,
    remoteValue: row.remote_value, remoteDeleted: row.remote_deleted, remoteHash: row.remote_hash,
    remoteRevision: row.remote_revision, createdAt: row.created_at,
  })), requestId });
}

export async function POST(request: NextRequest) {
  const requestId = requestIdFrom(request);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError(requestId, 'Unauthorized', 401, 'UNAUTHORIZED');
  const body = await request.json().catch(() => null) as { conflictId?: string; deviceId?: string; value?: unknown; deleted?: boolean } | null;
  if (!body?.conflictId || !UUID.test(body.conflictId) || !body.deviceId || !UUID.test(body.deviceId)
      || (body.deleted !== true && !Object.prototype.hasOwnProperty.call(body, 'value'))
      || (JSON.stringify(body.value) ?? 'null').length > 100_000) {
    return apiError(requestId, 'Invalid conflict resolution', 400, 'INVALID_RESOLUTION');
  }
  const { data: conflict, error: readError } = await supabase.from('sync_conflicts').select('*')
    .eq('id', body.conflictId).eq('user_id', user.id).is('resolved_at', null).maybeSingle();
  if (readError || !conflict) return apiError(requestId, 'Conflict not found', 404, 'NOT_FOUND');
  const operationId = crypto.randomUUID();
  const deleted = body.deleted === true;
  const hash = createHash('sha256').update(deleted ? '__deleted__' : canonicalJson(body.value)).digest('hex');
  const { data, error } = await supabase.rpc('apply_web_sync_operation', {
    p_operation_id: operationId,
    p_device_id: body.deviceId,
    p_storage_key: conflict.storage_key,
    p_base_revision: conflict.remote_revision,
    p_base_hash: conflict.remote_hash,
    p_base_value: conflict.remote_value,
    p_value: deleted ? null : body.value,
    p_content_hash: hash,
    p_deleted: deleted,
  });
  if (error) return apiError(requestId, 'Unable to resolve conflict', 500, 'RESOLUTION_FAILED');
  const result = data as { status?: string; revision?: number };
  if (result.status !== 'applied') return apiError(requestId, 'The record changed again; refresh and retry', 409, 'CONFLICT_CHANGED');
  await supabase.from('sync_conflicts').update({ resolved_at: new Date().toISOString() }).eq('id', conflict.id).eq('user_id', user.id);
  return NextResponse.json({ ok: true, operationId, revision: result.revision, requestId });
}
