import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, requestIdFrom } from '@/lib/api-response';
import { isSyncableStorageKey } from '@/lib/local-workspace';
import { applySyncBody, UUID, type SyncRequestBody } from '@/lib/sync/server';
import { MAX_LARGE_SYNC_BYTES, SYNC_PART_BYTES } from '@/lib/sync/transfer';

const MAX_PARTS = 200;
const MAX_PART_BODY_BYTES = 250_000;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export async function POST(request: NextRequest) {
  const requestId = requestIdFrom(request);
  if (Number(request.headers.get('content-length') ?? 0) > MAX_PART_BODY_BYTES) {
    return apiError(requestId, 'Upload part too large', 413, 'PAYLOAD_TOO_LARGE');
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError(requestId, 'Unauthorized', 401, 'UNAUTHORIZED');
  const input = await request.json().catch(() => null) as {
    uploadId?: string; index?: number; count?: number; data?: string; complete?: boolean;
  } | null;
  if (!input || JSON.stringify(input).length > MAX_PART_BODY_BYTES || !input.uploadId || !UUID.test(input.uploadId)) {
    return apiError(requestId, 'Invalid upload request', 400, 'INVALID_BODY');
  }

  if (input.complete === true) {
    const { data: rows, error } = await supabase.from('web_sync_upload_chunks')
      .select('part_index, part_count, data').eq('user_id', user.id).eq('upload_id', input.uploadId)
      .order('part_index').limit(MAX_PARTS);
    if (error) return apiError(requestId, 'Unable to read upload', 500, 'UPLOAD_READ_FAILED');
    const count = rows?.[0]?.part_count;
    if (!count || rows.length !== count || rows.some((row, index) => row.part_index !== index || row.part_count !== count)) {
      return apiError(requestId, 'Upload is incomplete', 409, 'UPLOAD_INCOMPLETE');
    }
    const bytes = Buffer.concat(rows.map((row) => Buffer.from(row.data, 'base64')));
    if (bytes.length > MAX_LARGE_SYNC_BYTES) return apiError(requestId, 'Upload too large', 413, 'PAYLOAD_TOO_LARGE');
    let body: SyncRequestBody;
    try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as SyncRequestBody; }
    catch { return apiError(requestId, 'Invalid uploaded JSON', 400, 'INVALID_BODY'); }
    if (!body || !Array.isArray(body.operations) || body.operations.length !== 1
        || (body.operations[0] as { id?: string } | null)?.id !== input.uploadId) {
      return apiError(requestId, 'Invalid uploaded operation', 400, 'INVALID_OPERATIONS');
    }
    const result = await applySyncBody(body, requestId, supabase, user.id, true);
    if (result.ok) {
      const cleanup = await supabase.from('web_sync_upload_chunks').delete()
        .eq('user_id', user.id).eq('upload_id', input.uploadId);
      if (cleanup.error) console.error('[Sync] Unable to remove completed upload', { requestId, code: cleanup.error.code });
    }
    return result;
  }

  if (!Number.isInteger(input.index) || !Number.isInteger(input.count)
      || input.count! < 1 || input.count! > MAX_PARTS || input.index! < 0 || input.index! >= input.count!
      || typeof input.data !== 'string' || input.data.length < 1 || input.data.length > 180_000
      || !BASE64.test(input.data) || Buffer.from(input.data, 'base64').length > SYNC_PART_BYTES) {
    return apiError(requestId, 'Invalid upload part', 400, 'INVALID_PART');
  }
  if (input.index === 0) {
    const cleared = await supabase.from('web_sync_upload_chunks').delete()
      .eq('user_id', user.id).eq('upload_id', input.uploadId);
    if (cleared.error) return apiError(requestId, 'Unable to reset upload', 500, 'UPLOAD_RESET_FAILED');
    await supabase.from('web_sync_upload_chunks').delete().eq('user_id', user.id)
      .lt('created_at', new Date(Date.now() - 86_400_000).toISOString());
  }
  const { error } = await supabase.from('web_sync_upload_chunks').upsert({
    user_id: user.id,
    upload_id: input.uploadId,
    part_index: input.index,
    part_count: input.count,
    data: input.data,
  }, { onConflict: 'user_id,upload_id,part_index' });
  if (error) return apiError(requestId, 'Unable to store upload part', 500, 'UPLOAD_WRITE_FAILED');
  return NextResponse.json({ ok: true, requestId });
}

export async function GET(request: NextRequest) {
  const requestId = requestIdFrom(request);
  const key = request.nextUrl.searchParams.get('key');
  const part = Number(request.nextUrl.searchParams.get('part'));
  const revision = Number(request.nextUrl.searchParams.get('revision'));
  if (!key || !isSyncableStorageKey(key) || !Number.isInteger(part) || part < 0
      || !Number.isSafeInteger(revision) || revision < 1) {
    return apiError(requestId, 'Invalid download request', 400, 'INVALID_BODY');
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError(requestId, 'Unauthorized', 401, 'UNAUTHORIZED');
  const { data: row, error } = await supabase.from('legacy_sync_data')
    .select('storage_value, revision, deleted_at').eq('user_id', user.id).eq('storage_key', key).maybeSingle();
  if (error) return apiError(requestId, 'Unable to read sync record', 500, 'SYNC_READ_FAILED');
  if (!row || Number(row.revision) !== revision) return apiError(requestId, 'Sync record changed', 409, 'REVISION_CHANGED');
  const bytes = Buffer.from(JSON.stringify(row.deleted_at ? null : row.storage_value));
  if (bytes.length > MAX_LARGE_SYNC_BYTES) return apiError(requestId, 'Sync record too large', 413, 'PAYLOAD_TOO_LARGE');
  const count = Math.ceil(bytes.length / SYNC_PART_BYTES);
  if (part >= count) return apiError(requestId, 'Invalid download part', 400, 'INVALID_PART');
  return NextResponse.json({
    ok: true, revision, part, count,
    data: bytes.subarray(part * SYNC_PART_BYTES, (part + 1) * SYNC_PART_BYTES).toString('base64'),
    requestId,
  });
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
