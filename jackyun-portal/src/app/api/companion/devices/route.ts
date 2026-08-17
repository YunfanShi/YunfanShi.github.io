import { NextRequest, NextResponse } from 'next/server';
import { getBearerContext } from '@/lib/supabase/bearer';

function error(message: string, status: number) { return NextResponse.json({ ok: false, error: message }, { status }); }

export async function GET(request: NextRequest) {
  const context = await getBearerContext(request);
  if (!context) return error('Unauthorized', 401);
  const { data, error: queryError } = await context.supabase.from('companion_devices').select('id, name, platform, browser_version, extension_version, last_seen_at, revoked_at, created_at').eq('user_id', context.user.id).order('last_seen_at', { ascending: false });
  return queryError ? error(queryError.message, 500) : NextResponse.json({ ok: true, devices: data ?? [] });
}

export async function PATCH(request: NextRequest) {
  const context = await getBearerContext(request);
  if (!context) return error('Unauthorized', 401);
  const body = await request.json().catch(() => null) as { id?: string; name?: string } | null;
  if (!body?.id || !body.name?.trim()) return error('Invalid device update', 400);
  const { error: updateError } = await context.supabase.from('companion_devices').update({ name: body.name.trim().slice(0, 80), updated_at: new Date().toISOString() }).eq('user_id', context.user.id).eq('id', body.id).is('revoked_at', null);
  return updateError ? error(updateError.message, 500) : NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const context = await getBearerContext(request);
  if (!context) return error('Unauthorized', 401);
  const body = await request.json().catch(() => null) as { id?: string } | null;
  if (!body?.id) return error('Missing device id', 400);
  const { error: updateError } = await context.supabase.from('companion_devices').update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('user_id', context.user.id).eq('id', body.id);
  return updateError ? error(updateError.message, 500) : NextResponse.json({ ok: true });
}
