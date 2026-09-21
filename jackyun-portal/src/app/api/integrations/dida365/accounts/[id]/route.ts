import { createClient } from '@/lib/supabase/server';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: '无效的账户。' }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: '请先登录。' }, { status: 401 });
  const { error } = await supabase.from('external_accounts').delete().eq('id', id).eq('user_id', user.id).eq('provider', 'dida365');
  if (error) return Response.json({ error: '解除关联失败。' }, { status: 500 });
  return Response.json({ ok: true });
}
