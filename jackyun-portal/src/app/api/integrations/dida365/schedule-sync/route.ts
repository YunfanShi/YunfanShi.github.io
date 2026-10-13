import { createClient } from '@/lib/supabase/server';
import { decryptSecret } from '@/lib/secret-crypto';
import { didaRequest, DidaApiError, getDidaProjects } from '@/lib/integrations/dida365-server';
import { normalizeDidaTasks } from '@/lib/integrations/dida-schedule';

export const runtime = 'nodejs';
const remoteId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
async function accountContext(accountId: unknown) {
  if (typeof accountId !== 'string' || !/^[0-9a-f-]{36}$/i.test(accountId)) throw new DidaApiError('无效的账户。', 400);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new DidaApiError('请先登录。', 401);
  const { data: account, error } = await supabase.from('external_accounts').select('id,settings,status').eq('id', accountId).eq('user_id', user.id).eq('provider', 'dida365').maybeSingle();
  if (error) throw new DidaApiError('读取关联账户失败。', 500);
  if (!account || account.status !== 'active') throw new DidaApiError('关联账户不可用。', 404);
  const { data: secret, error: secretError } = await supabase.from('external_account_secrets').select('encrypted_access_token').eq('account_id', accountId).eq('user_id', user.id).maybeSingle();
  if (secretError || !secret) throw new DidaApiError('无法读取账户授权。', 500);
  const settings = account.settings && typeof account.settings === 'object' ? account.settings as Record<string, unknown> : {};
  const selected = Array.isArray(settings.syncProjectIds) ? settings.syncProjectIds.filter(remoteId).slice(0, 30) : [];
  return { supabase, user, account, settings, selected, token: decryptSecret(secret.encrypted_access_token) };
}
function failure(error: unknown) {
  return Response.json({ error: error instanceof DidaApiError ? error.message : '清单同步失败，请稍后重试。' }, { status: error instanceof DidaApiError ? error.status : 502, headers: { 'Cache-Control': 'private, no-store' } });
}
export async function GET(request: Request) {
  try {
    const context = await accountContext(new URL(request.url).searchParams.get('accountId'));
    const projects = await getDidaProjects(context.token);
    const selectedProjectIds = context.selected.filter(id => projects.some(project => project.id === id));
    const batches = await Promise.all(selectedProjectIds.map(async id => {
      const data = await didaRequest<{ tasks?: unknown }>(context.token, `/project/${encodeURIComponent(id)}/data`);
      return normalizeDidaTasks(data?.tasks, id);
    }));
    // Project data contains open tasks. Read recently completed tasks separately so
    // completion in the other app is visible and remains reversible after reload.
    let completedTasks = [] as ReturnType<typeof normalizeDidaTasks>;
    if (selectedProjectIds.length) {
      const completed = await didaRequest<unknown>(context.token, '/task/completed', { method: 'POST', body: JSON.stringify({ projectIds: selectedProjectIds, startDate: new Date(Date.now() - 30 * 86_400_000).toISOString(), endDate: new Date().toISOString() }) });
      if (!Array.isArray(completed)) throw new DidaApiError('无法读取已完成任务。');
      completedTasks = selectedProjectIds.flatMap(id => normalizeDidaTasks(completed, id));
    }
    const tasks = [...new Map([...batches.flat(), ...completedTasks].map(task => [`${task.projectId}:${task.id}`, task])).values()];
    return Response.json({ projects, selectedProjectIds, tasks, completedLimitReached: completedTasks.length >= 200, syncedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'private, no-store' } });
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
    if (!remoteId(body.projectId) || !remoteId(body.taskId) || typeof body.completed !== 'boolean') throw new DidaApiError('无效的任务操作。', 400);
    if (!context.selected.includes(body.projectId)) throw new DidaApiError('任务不在已选择的同步清单内。', 403);
    const projectId = encodeURIComponent(body.projectId), taskId = encodeURIComponent(body.taskId);
    const task = await didaRequest<Record<string, unknown>>(context.token, `/project/${projectId}/task/${taskId}`);
    if (task?.id !== body.taskId || task.projectId !== body.projectId) throw new DidaApiError('任务已移除或不属于该清单。', 404);
    if (body.completed) await didaRequest(context.token, `/project/${projectId}/task/${taskId}/complete`, { method: 'POST' });
    else {
      const result = await didaRequest<{ id2error?: Record<string, unknown> }>(context.token, '/task/batch', { method: 'POST', body: JSON.stringify({ update: [{ ...task, id: body.taskId, projectId: body.projectId, status: 0, completedTime: null }] }) });
      if (result?.id2error?.[body.taskId]) throw new DidaApiError('滴答未能取消完成，请刷新后重试。');
    }
    const verified = await didaRequest<Record<string, unknown>>(context.token, `/project/${projectId}/task/${taskId}`);
    if (verified?.status !== (body.completed ? 2 : 0)) throw new DidaApiError('滴答尚未确认状态变更，请刷新后重试。');
    return Response.json({ task: normalizeDidaTasks([verified], body.projectId)[0] });
  } catch (error) { return failure(error); }
}
