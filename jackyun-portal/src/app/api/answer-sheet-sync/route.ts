import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, requestIdFrom } from '@/lib/api-response';

const MAX_BODY_BYTES = 150_000;
const ID = /^[A-Za-z0-9._:-]{1,120}$/;

async function authenticated(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user, requestId: requestIdFrom(request) };
}

export async function POST(request: NextRequest) {
  const context = await authenticated(request);
  if (!context.user) return apiError(context.requestId, 'Unauthorized', 401, 'UNAUTHORIZED');
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_BODY_BYTES) return apiError(context.requestId, 'Request body too large', 413, 'PAYLOAD_TOO_LARGE');
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || JSON.stringify(body).length > MAX_BODY_BYTES) return apiError(context.requestId, 'Invalid request body', 400, 'INVALID_BODY');

  const sessionId = String(body.sessionId || '');
  const senderDeviceId = String(body.senderDeviceId || '');
  const targetTime = Number(body.targetTime);
  if (!ID.test(sessionId) || !ID.test(senderDeviceId) || !Number.isFinite(targetTime) || Math.abs(targetTime - Date.now()) > 300_000 || !body.payload || typeof body.payload !== 'object') {
    return apiError(context.requestId, 'Invalid broadcast', 400, 'INVALID_BROADCAST');
  }
  const minuteAgo = new Date(Date.now() - 60_000).toISOString();
  const { count, error: rateError } = await context.supabase.from('answer_sheet_broadcasts').select('id', { count: 'exact', head: true })
    .eq('user_id', context.user.id).gte('created_at', minuteAgo);
  if (rateError) return apiError(context.requestId, 'Unable to validate broadcast rate', 500, 'RATE_CHECK_FAILED');
  if ((count ?? 0) >= 60) return apiError(context.requestId, 'Too many broadcasts', 429, 'RATE_LIMITED');

  const broadcastId = crypto.randomUUID();
  const { error } = await context.supabase.from('answer_sheet_broadcasts').insert({
    user_id: context.user.id,
    session_id: sessionId,
    sender_device_id: senderDeviceId,
    target_time: targetTime,
    payload: body.payload,
    broadcast_id: broadcastId,
    expires_at: new Date(Date.now() + 15_000).toISOString(),
    consumed_by: [],
  });
  if (error) return apiError(context.requestId, 'Unable to create broadcast', 500, 'BROADCAST_WRITE_FAILED');
  return NextResponse.json({ ok: true, broadcastId, sessionId, targetTime, requestId: context.requestId });
}

export async function GET(request: NextRequest) {
  const context = await authenticated(request);
  if (!context.user) return apiError(context.requestId, 'Unauthorized', 401, 'UNAUTHORIZED');
  const deviceId = request.nextUrl.searchParams.get('self') || '';
  if (deviceId && !ID.test(deviceId)) return apiError(context.requestId, 'Invalid device', 400, 'INVALID_DEVICE');
  const sinceMs = Number(request.nextUrl.searchParams.get('since') || Date.now() - 5_000);
  const since = Number.isFinite(sinceMs) ? new Date(Math.max(sinceMs, Date.now() - 60_000)).toISOString() : new Date(Date.now() - 5_000).toISOString();
  const { data, error } = await context.supabase.from('answer_sheet_broadcasts')
    .select('id, broadcast_id, session_id, sender_device_id, target_time, payload, created_at')
    .eq('user_id', context.user.id).gte('expires_at', new Date().toISOString()).gte('created_at', since)
    .order('created_at', { ascending: false }).limit(20);
  if (error) return apiError(context.requestId, 'Unable to read broadcasts', 500, 'BROADCAST_READ_FAILED');
  const ids = (data ?? []).map((row) => row.id);
  const consumed = deviceId && ids.length
    ? await context.supabase.from('answer_sheet_consumptions').select('broadcast_id').eq('user_id', context.user.id).eq('device_id', deviceId).in('broadcast_id', ids)
    : { data: [] as Array<{ broadcast_id: number }>, error: null };
  if (consumed.error) return apiError(context.requestId, 'Unable to read consumption records', 500, 'CONSUMPTION_READ_FAILED');
  const consumedIds = new Set((consumed.data ?? []).map((row) => row.broadcast_id));
  const broadcasts = (data ?? []).filter((row) => row.sender_device_id !== deviceId && !consumedIds.has(row.id)).slice(0, 5).map((row) => ({
    rowId: row.id, broadcastId: row.broadcast_id, sessionId: row.session_id, senderDeviceId: row.sender_device_id,
    targetTime: row.target_time, payload: row.payload, createdAt: row.created_at,
  }));
  return NextResponse.json({ ok: true, broadcasts, requestId: context.requestId });
}

export async function PATCH(request: NextRequest) {
  const context = await authenticated(request);
  if (!context.user) return apiError(context.requestId, 'Unauthorized', 401, 'UNAUTHORIZED');
  const body = await request.json().catch(() => null) as { rowId?: number; deviceId?: string } | null;
  if (!Number.isSafeInteger(body?.rowId) || Number(body?.rowId) <= 0 || !body?.deviceId || !ID.test(body.deviceId)) {
    return apiError(context.requestId, 'Invalid consumption', 400, 'INVALID_CONSUMPTION');
  }
  const { data: broadcast } = await context.supabase.from('answer_sheet_broadcasts').select('id').eq('id', body.rowId!).eq('user_id', context.user.id).maybeSingle();
  if (!broadcast) return apiError(context.requestId, 'Broadcast not found', 404, 'NOT_FOUND');
  const { error } = await context.supabase.from('answer_sheet_consumptions').upsert({ broadcast_id: body.rowId, user_id: context.user.id, device_id: body.deviceId }, { onConflict: 'broadcast_id,device_id' });
  if (error) return apiError(context.requestId, 'Unable to record consumption', 500, 'CONSUMPTION_WRITE_FAILED');
  return NextResponse.json({ ok: true, requestId: context.requestId });
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
