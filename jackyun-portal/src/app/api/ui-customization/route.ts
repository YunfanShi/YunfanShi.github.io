import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function sanitize(value: unknown) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    theme: raw.theme === 'gray' || raw.theme === 'dark' ? raw.theme : 'light',
    density: raw.density === 'compact' ? 'compact' : 'comfortable',
    reducedMotion: raw.reducedMotion === true,
    accent: ['green', 'purple', 'orange'].includes(String(raw.accent)) ? raw.accent : 'blue',
    cornerStyle: raw.cornerStyle === 'soft' ? 'soft' : 'rounded',
  };
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: beta } = await supabase.from('beta_enrollments').select('status').eq('user_id', user.id).maybeSingle();
  if (beta?.status !== 'accepted') return NextResponse.json({ error: 'BETA access required' }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const before = sanitize(body.before);
  const after = sanitize(body.after);
  const summary = typeof body.summary === 'string' ? body.summary.trim().slice(0, 500) : 'AI 界面微调';
  const source = body.source === 'restore' ? 'restore' : body.source === 'user' ? 'user' : 'ai';
  const [{ error: settingError }, { error: backupError }] = await Promise.all([
    supabase.from('user_settings').upsert({ user_id: user.id, key: 'interface_customization', value: after, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' }),
    supabase.from('ui_customization_backups').insert({ user_id: user.id, source, before_config: before, after_config: after, summary }),
  ]);
  const error = settingError || backupError;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data: oldRows } = await supabase.from('ui_customization_backups').select('id').eq('user_id', user.id).order('created_at', { ascending: false }).range(10, 100);
  if (oldRows?.length) await supabase.from('ui_customization_backups').delete().eq('user_id', user.id).in('id', oldRows.map((row) => row.id));
  return NextResponse.json({ ok: true });
}
