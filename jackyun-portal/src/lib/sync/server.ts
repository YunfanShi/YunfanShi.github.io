import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError } from '@/lib/api-response';
import { isSyncableStorageKey, syncValueFits } from '@/lib/local-workspace';
import { canonicalJson } from '@/lib/sync/hash';
import { SCHEDULE_STORAGE_KEY, unsafeScheduleReplacement } from '@/lib/sync/schedule-safety';
import { MAX_LARGE_SYNC_BYTES } from '@/lib/sync/transfer';
import type { SyncOperation, SyncRecord } from '@/types/sync';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const MAX_BODY_BYTES = 1_000_000;
export const MAX_LARGE_BODY_BYTES = MAX_LARGE_SYNC_BYTES;
const MAX_OPERATIONS = 100;
const DATABASE_CONCURRENCY = 8;

export type SyncRequestBody = {
  deviceId?: string;
  device?: { name?: string; platform?: string };
  operations?: unknown[];
} | null;

type SyncRpcError = { code?: string; message: string; details?: string | null; hint?: string | null };
type SyncRpcResult = { status?: string; revision?: number; contentHash?: string; updatedAt?: string; remoteValue?: unknown; remoteDeleted?: boolean; remoteHash?: string | null; remoteUpdatedAt?: string };
type SyncOutcome = { operation: SyncOperation; result: SyncRpcResult } | { operation: SyncOperation; error: SyncRpcError };

function logSyncFailure(requestId: string, userId: string, operation: SyncOperation, error: SyncRpcError) {
  console.error(JSON.stringify({
    ts: new Date().toISOString(),
    service: 'web-sync-v2',
    event: 'operation_failed',
    requestId,
    userId,
    operationId: operation.id,
    storageKey: operation.key,
    databaseCode: error.code ?? 'unknown',
    message: error.message,
    details: error.details ?? undefined,
    hint: error.hint ?? undefined,
  }));
}

async function mapWithConcurrency<T, R>(items: T[], worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(DATABASE_CONCURRENCY, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]);
    }
  }));
  return results;
}

function contentHash(value: unknown, deleted: boolean): string {
  return createHash('sha256').update(deleted ? '__deleted__' : canonicalJson(value)).digest('hex');
}

function validOperation(value: unknown, allowLarge: boolean): value is SyncOperation {
  if (!value || typeof value !== 'object') return false;
  const operation = value as Partial<SyncOperation>;
  if (!operation.id || !UUID.test(operation.id) || !operation.key || !isSyncableStorageKey(operation.key)) return false;
  if (!Number.isSafeInteger(operation.baseRevision) || Number(operation.baseRevision) < 0) return false;
  if (operation.baseHash !== null && (typeof operation.baseHash !== 'string' || !/^[0-9a-f]{64}$/i.test(operation.baseHash))) return false;
  if (typeof operation.deleted !== 'boolean' || typeof operation.clientUpdatedAt !== 'string') return false;
  if (!operation.deleted && !Object.prototype.hasOwnProperty.call(operation, 'value')) return false;
  if (operation.resolvesOperationId && !UUID.test(operation.resolvesOperationId)) return false;
  if (!Number.isFinite(Date.parse(operation.clientUpdatedAt))) return false;
  return allowLarge || (syncValueFits(operation.value) && syncValueFits(operation.baseValue));
}

export async function applySyncBody(
  body: SyncRequestBody, requestId: string,
  supabase: Awaited<ReturnType<typeof createClient>>, userId: string, allowLarge = false,
) {
  if (!body || JSON.stringify(body).length > (allowLarge ? MAX_LARGE_BODY_BYTES : MAX_BODY_BYTES) || !body.deviceId || !UUID.test(body.deviceId)) {
    return apiError(requestId, 'Invalid request body', 400, 'INVALID_BODY');
  }
  if (!Array.isArray(body.operations) || body.operations.length > MAX_OPERATIONS || !body.operations.every((operation) => validOperation(operation, allowLarge))) {
    return apiError(requestId, 'Invalid sync operations', 400, 'INVALID_OPERATIONS');
  }
  if (new Set(body.operations.map((raw) => (raw as SyncOperation).key)).size !== body.operations.length) {
    return apiError(requestId, 'Only one operation per storage key is allowed', 400, 'DUPLICATE_KEYS');
  }
  const scheduleOperation = body.operations.find((raw) => (raw as SyncOperation).key === SCHEDULE_STORAGE_KEY) as SyncOperation | undefined;
  if (scheduleOperation) {
    const { data: currentSchedule, error: scheduleError } = await supabase.from('legacy_sync_data')
      .select('storage_value, deleted_at').eq('user_id', userId).eq('storage_key', SCHEDULE_STORAGE_KEY).maybeSingle();
    if (scheduleError) return apiError(requestId, 'Unable to validate Schedule', 500, 'SCHEDULE_CHECK_FAILED');
    if (!currentSchedule?.deleted_at && unsafeScheduleReplacement(currentSchedule?.storage_value, scheduleOperation.deleted ? null : scheduleOperation.value)) {
      return apiError(requestId, 'Empty Schedule cannot replace existing data', 409, 'SCHEDULE_EMPTY_REPLACEMENT');
    }
  }

  const platform = ['web', 'pwa', 'mobile-web'].includes(body.device?.platform ?? '') ? body.device!.platform! : 'web';
  const name = String(body.device?.name || 'Web browser').trim().slice(0, 80) || 'Web browser';
  const existing = await supabase.from('web_sync_devices').select('revoked_at').eq('user_id', userId).eq('id', body.deviceId).maybeSingle();
  if (existing.error) return apiError(requestId, 'Unable to validate device', 500, 'DEVICE_CHECK_FAILED');
  if (existing.data?.revoked_at) return apiError(requestId, 'Device has been revoked', 403, 'DEVICE_REVOKED');
  const deviceResult = await supabase.from('web_sync_devices').upsert({
    id: body.deviceId,
    user_id: userId,
    name,
    platform,
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });
  if (deviceResult.error) return apiError(requestId, 'Unable to register device', 500, 'DEVICE_REGISTER_FAILED');

  const minuteAgo = new Date(Date.now() - 60_000).toISOString();
  const { count: recentOperations, error: rateError } = await supabase.from('sync_operations')
    .select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', minuteAgo);
  if (rateError) return apiError(requestId, 'Unable to validate sync rate', 500, 'RATE_CHECK_FAILED');
  if ((recentOperations ?? 0) + body.operations.length > 600) {
    return apiError(requestId, 'Too many sync operations', 429, 'RATE_LIMITED');
  }

  const applied: Array<{ operationId: string; key: string; revision: number; contentHash: string; updatedAt: string }> = [];
  const remote: SyncRecord[] = [];
  const conflicts: Array<Record<string, unknown>> = [];
  const outcomes: SyncOutcome[] = await mapWithConcurrency(body.operations, async (raw): Promise<SyncOutcome> => {
    const operation = raw as SyncOperation;
    const parameters = {
      p_operation_id: operation.id,
      p_device_id: body.deviceId,
      p_storage_key: operation.key,
      p_base_revision: operation.baseRevision,
      p_base_hash: operation.baseHash,
      p_base_value: operation.baseValue ?? null,
      p_value: operation.deleted ? null : operation.value,
      p_content_hash: contentHash(operation.value, operation.deleted),
      p_deleted: operation.deleted,
      p_client_updated_at: operation.clientUpdatedAt,
    };
    let { data, error } = await supabase.rpc('apply_web_sync_operation', parameters);
    // A deployment may briefly run against the previous 9-argument RPC while
    // the repair migration reaches PostgREST. Keep writes working during that
    // window instead of collapsing the entire batch into SYNC_WRITE_FAILED.
    if (error?.code === 'PGRST202') {
      const legacyParameters: Record<string, unknown> = { ...parameters };
      delete legacyParameters.p_client_updated_at;
      const legacy = await supabase.rpc('apply_web_sync_operation', legacyParameters);
      data = legacy.data;
      error = legacy.error;
    }
    if (error) {
      logSyncFailure(requestId, userId, operation, error);
      return { operation, error: error as SyncRpcError };
    }
    const result = data as SyncRpcResult;
    return { operation, result };
  });
  const firstFailure = outcomes.find((outcome) => 'error' in outcome);
  if (firstFailure && 'error' in firstFailure) {
    return apiError(requestId, `Unable to apply sync operation; reference ${requestId}`, 500, 'SYNC_WRITE_FAILED');
  }
  const resolvedOperationIds: string[] = [];
  for (const outcome of outcomes) {
    if (!('result' in outcome)) continue;
    const { operation, result } = outcome;
    if (result.status === 'applied') {
      applied.push({ operationId: operation.id, key: operation.key, revision: Number(result.revision), contentHash: String(result.contentHash), updatedAt: result.updatedAt ?? operation.clientUpdatedAt });
      if (operation.resolvesOperationId) resolvedOperationIds.push(operation.resolvesOperationId);
    } else if (result.status === 'remote') {
      if (operation.resolvesOperationId) resolvedOperationIds.push(operation.resolvesOperationId);
      const large = !result.remoteDeleted && !syncValueFits(result.remoteValue);
      remote.push({
        key: operation.key,
        value: large ? null : result.remoteValue,
        revision: Number(result.revision ?? 0),
        contentHash: result.remoteHash ?? null,
        deleted: Boolean(result.remoteDeleted),
        updatedAt: result.remoteUpdatedAt ?? new Date().toISOString(),
        large,
      });
    } else {
      const remoteLarge = !result.remoteDeleted && !syncValueFits(result.remoteValue);
      conflicts.push({
        operationId: operation.id,
        key: operation.key,
        baseRevision: operation.baseRevision,
        baseValue: operation.baseValue,
        localValue: operation.deleted ? null : operation.value,
        localDeleted: operation.deleted,
        remoteValue: remoteLarge ? null : result.remoteValue,
        remoteLarge,
        remoteDeleted: Boolean(result.remoteDeleted),
        remoteHash: result.remoteHash ?? null,
        remoteRevision: Number(result.revision ?? 0),
        remoteUpdatedAt: result.remoteUpdatedAt,
      });
    }
  }
  if (resolvedOperationIds.length) await supabase.from('sync_conflicts').update({ resolved_at: new Date().toISOString() })
    .eq('user_id', userId).in('operation_id', resolvedOperationIds);

  return NextResponse.json({ ok: true, applied, remote, conflicts, cursor: new Date().toISOString(), serverTime: new Date().toISOString(), requestId });
}
