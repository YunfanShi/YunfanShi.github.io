import { NextRequest, NextResponse } from 'next/server';
import { getBearerContext } from '@/lib/supabase/bearer';
import { getCompanionCategory, normalizeHostname } from '@/lib/companion';

function error(message: string, status: number) { return NextResponse.json({ ok: false, error: message }, { status }); }

export async function GET(request: NextRequest) {
  const context = await getBearerContext(request);
  if (!context) return error('Unauthorized', 401);
  const { data, error: queryError } = await context.supabase.from('companion_learning_queue').select('id, url, title, hostname, category, note, status, created_at, updated_at').eq('user_id', context.user.id).neq('status', 'archived').order('created_at', { ascending: false }).limit(200);
  return queryError ? error(queryError.message, 500) : NextResponse.json({ ok: true, items: data ?? [] });
}

export async function POST(request: NextRequest) {
  const context = await getBearerContext(request);
  if (!context) return error('Unauthorized', 401);
  const body = await request.json().catch(() => null) as { url?: string; title?: string; note?: string } | null;
  let url: URL;
  try { url = new URL(body?.url || ''); } catch { return error('Invalid URL', 400); }
  if (url.protocol !== 'https:') return error('Only HTTPS pages can be saved', 400);
  const hostname = normalizeHostname(url.hostname);
  const category = getCompanionCategory(hostname) ?? '其他学习';
  const title = body?.title?.trim().slice(0, 300);
  if (!title) return error('Missing title', 400);
  const { data, error: insertError } = await context.supabase.from('companion_learning_queue').insert({ user_id: context.user.id, url: url.toString().slice(0, 2048), title, hostname, category, note: String(body?.note || '').slice(0, 2000) }).select('id, url, title, hostname, category, note, status, created_at, updated_at').single();
  return insertError ? error(insertError.message, 500) : NextResponse.json({ ok: true, item: data }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const context = await getBearerContext(request);
  if (!context) return error('Unauthorized', 401);
  const body = await request.json().catch(() => null) as { id?: string; status?: string; note?: string } | null;
  if (!body?.id) return error('Missing item id', 400);
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.status && ['unread', 'in_progress', 'done', 'archived'].includes(body.status)) update.status = body.status;
  if (typeof body.note === 'string') update.note = body.note.slice(0, 2000);
  const { error: updateError } = await context.supabase.from('companion_learning_queue').update(update).eq('user_id', context.user.id).eq('id', body.id);
  return updateError ? error(updateError.message, 500) : NextResponse.json({ ok: true });
}
