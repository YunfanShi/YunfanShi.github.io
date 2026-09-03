import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, requestIdFrom } from '@/lib/api-response';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const requestId = requestIdFrom(request);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError(requestId, 'Unauthorized', 401, 'UNAUTHORIZED');
  const { data, error } = await supabase.from('web_sync_devices')
    .select('id, name, platform, last_seen_at, revoked_at').eq('user_id', user.id).order('last_seen_at', { ascending: false });
  if (error) return apiError(requestId, 'Unable to list devices', 500, 'DEVICE_LIST_FAILED');
  return NextResponse.json({ ok: true, devices: (data ?? []).map((row) => ({ id: row.id, name: row.name, platform: row.platform, lastSeenAt: row.last_seen_at, revokedAt: row.revoked_at })), requestId });
}

export async function PATCH(request: NextRequest) {
  const requestId = requestIdFrom(request);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError(requestId, 'Unauthorized', 401, 'UNAUTHORIZED');
  const body = await request.json().catch(() => null) as { id?: string; name?: string } | null;
  if (!body?.id || !UUID.test(body.id) || !body.name?.trim()) return apiError(requestId, 'Invalid device', 400, 'INVALID_DEVICE');
  const { error } = await supabase.from('web_sync_devices').update({ name: body.name.trim().slice(0, 80), updated_at: new Date().toISOString() })
    .eq('user_id', user.id).eq('id', body.id).is('revoked_at', null);
  if (error) return apiError(requestId, 'Unable to rename device', 500, 'DEVICE_UPDATE_FAILED');
  return NextResponse.json({ ok: true, requestId });
}

export async function DELETE(request: NextRequest) {
  const requestId = requestIdFrom(request);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError(requestId, 'Unauthorized', 401, 'UNAUTHORIZED');
  const body = await request.json().catch(() => null) as { id?: string } | null;
  if (!body?.id || !UUID.test(body.id)) return apiError(requestId, 'Invalid device', 400, 'INVALID_DEVICE');
  const { error } = await supabase.from('web_sync_devices').update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('user_id', user.id).eq('id', body.id);
  if (error) return apiError(requestId, 'Unable to revoke device', 500, 'DEVICE_REVOKE_FAILED');
  return NextResponse.json({ ok: true, requestId });
}
