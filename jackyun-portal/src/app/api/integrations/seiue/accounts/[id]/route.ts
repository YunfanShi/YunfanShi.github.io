import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const headers = { 'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache' };
  if (!user) return Response.json({ error: '请先登录。' }, { status: 401, headers });
  const origin = _request.headers.get('origin');
  if (!origin || (() => { try { return new URL(origin).origin !== new URL(_request.url).origin; } catch { return true; } })()) return Response.json({ error: '请求来源无效。' }, { status: 403, headers });
  const { id } = await params;
  const { data: deleted, error } = await supabase.from('external_accounts').delete().eq('id', id).eq('user_id', user.id).eq('provider', 'seiue').select('id').maybeSingle();
  if (error) return Response.json({ error: '解除 SEIUE 关联失败。' }, { status: 500, headers });
  if (!deleted) return Response.json({ error: '找不到此 SEIUE 账户。' }, { status: 404, headers });
  return Response.json({ ok: true }, { headers });
}
