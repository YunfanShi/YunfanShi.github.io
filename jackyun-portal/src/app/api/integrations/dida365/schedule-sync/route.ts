import { createClient } from '@/lib/supabase/server';
import { loadDidaAccount, readDidaSnapshot, remoteId, setDidaTaskCompletion } from '@/lib/integrations/dida-sync-service';
import { DidaApiError, getDidaProjects } from '@/lib/integrations/dida365-server';

export const runtime = 'nodejs';
async function accountContext(accountId: unknown) {
  if (typeof accountId !== 'string' || !/^[0-9a-f-]{36}$/i.test(accountId)) throw new DidaApiError('无效的账户。', 400);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new DidaApiError('请先登录。', 401);
  return loadDidaAccount(supabase, user.id, accountId);
}
function failure(error: unknown) {
  return Response.json({ error: error instanceof DidaApiError ? error.message : '清单同步失败，请稍后重试。' }, { status: error instanceof DidaApiError ? error.status : 502, headers: { 'Cache-Control': 'private, no-store' } });
}
export async function GET(request: Request) {
  try {
    const context = await accountContext(new URL(request.url).searchParams.get('accountId'));
    return Response.json(await readDidaSnapshot(context), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return failure(error); }
}
export async function PUT(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const context = await accountContext(body.accountId);
    if (!Array.isArray(body.projectIds) || body.projectIds.length > 30 || !body.projectIds.every(remoteId)) throw new DidaApiError('请选择有效的清单，最多 30 个。', 400);
    const projects = await getDidaProjects(context.token);
    const selected = [...new Set(body.projectIds as string[])];
    if (selected.some(id => !projects.some(project => project.id === id))) throw new DidaApiError('清单已失效，请刷新后重新选择。', 400);
    const { error } = await context.supabase.from('external_accounts').update({ settings: { ...context.settings, syncProjectIds: selected }, updated_at: new Date().toISOString() }).eq('id', context.account.id).eq('user_id', context.user.id).eq('provider', 'dida365');
    if (error) throw new DidaApiError('保存同步范围失败。', 500);
    return Response.json({ selectedProjectIds: selected });
  } catch (error) { return failure(error); }
}
export async function PATCH(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const context = await accountContext(body.accountId);
    return Response.json({ task: await setDidaTaskCompletion(context, body.projectId, body.taskId, body.completed, body.version) });
  } catch (error) { return failure(error); }
}
