import { SYNC_DATABASE_TIMEOUT_MS } from '@/lib/request-timeout';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, requestIdFrom } from '@/lib/api-response';
import { isSyncableStorageKey, syncValueFits } from '@/lib/local-workspace';
import { applySyncBody, MAX_BODY_BYTES, type SyncRequestBody } from '@/lib/sync/server';
import { syncAuthError } from '@/lib/sync/auth-error';

export async function GET(request: NextRequest) {
  const requestId = requestIdFrom(request);
  const supabase = await createClient(undefined, SYNC_DATABASE_TIMEOUT_MS);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) return syncAuthError(requestId, authError);

  const rawCursor = request.nextUrl.searchParams.get('cursor');
  const exactKey = request.nextUrl.searchParams.get('key');
  if (exactKey && !isSyncableStorageKey(exactKey)) return apiError(requestId, 'Invalid storage key', 400, 'INVALID_KEY');
  const cursor = rawCursor && Number.isFinite(Date.parse(rawCursor)) ? new Date(rawCursor).toISOString() : null;
  let query = supabase
    .from('legacy_sync_data')
    .select('storage_key, storage_value, revision, content_hash, deleted_at, updated_at, client_updated_at')
    .eq('user_id', user.id)
    .order('updated_at')
    .order('id')
    .limit(500);
  if (exactKey) query = query.eq('storage_key', exactKey);
  else if (cursor) query = query.gt('updated_at', cursor);
  const { data, error } = await query;
  if (error) return apiError(requestId, 'Unable to read sync records', 500, 'SYNC_READ_FAILED');

  const nextCursor = data?.length ? data[data.length - 1].updated_at : new Date().toISOString();
  return NextResponse.json({
    ok: true,
    records: (data ?? []).filter((row) => isSyncableStorageKey(row.storage_key)).map((row) => ({
      key: row.storage_key,
      value: row.deleted_at || !syncValueFits(row.storage_value) ? null : row.storage_value,
      revision: Number(row.revision),
      contentHash: row.content_hash,
      deleted: Boolean(row.deleted_at),
      large: !row.deleted_at && !syncValueFits(row.storage_value),
      updatedAt: row.client_updated_at ?? row.updated_at,
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
  const supabase = await createClient(undefined, SYNC_DATABASE_TIMEOUT_MS);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) return syncAuthError(requestId, authError);
  const body = await request.json().catch(() => null) as SyncRequestBody;
  return applySyncBody(body, requestId, supabase, user.id);
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const maxDuration = 60;
