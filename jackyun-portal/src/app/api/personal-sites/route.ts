import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validatePersonalSite } from '@/lib/personal-site';

async function context() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: beta } = await supabase.from('beta_enrollments').select('status').eq('user_id', user.id).maybeSingle();
  return beta?.status === 'accepted' ? { supabase, user } : null;
}

export async function GET() {
  const ctx = await context(); if (!ctx) return NextResponse.json({ error: 'BETA access required' }, { status: 403 });
  const { data, error } = await ctx.supabase.from('personal_sites').select('id, name, definition, updated_at').eq('user_id', ctx.user.id).order('updated_at', { ascending: false });
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ sites: data ?? [] });
}

export async function POST(request: NextRequest) {
  const ctx = await context(); if (!ctx) return NextResponse.json({ error: 'BETA access required' }, { status: 403 });
  let raw: unknown; try { raw = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (JSON.stringify(raw).length > 50000) return NextResponse.json({ error: '网站配置过大' }, { status: 413 });
  const site = validatePersonalSite(raw);
  const { error } = await ctx.supabase.from('personal_sites').upsert({ id: site.id, user_id: ctx.user.id, name: site.name, schema_version: 1, definition: site, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true, site });
}

export async function DELETE(request: NextRequest) {
  const ctx = await context(); if (!ctx) return NextResponse.json({ error: 'BETA access required' }, { status: 403 });
  const id = request.nextUrl.searchParams.get('id') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const { error } = await ctx.supabase.from('personal_sites').delete().eq('user_id', ctx.user.id).eq('id', id);
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
}

