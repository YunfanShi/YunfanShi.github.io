import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptSecret } from '@/lib/secret-crypto';
import { didaRequest, DidaApiError, getDidaProjects } from './dida365-server';
import { normalizeDidaTasks, type DidaScheduleTask } from './dida-schedule';
import { didaTaskVersion, isDidaVersion } from './dida-task-reference';

export const remoteId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
export async function loadDidaAccount(supabase: SupabaseClient, userId: string, accountId: unknown) {
  if (typeof accountId !== 'string' || !/^[0-9a-f-]{36}$/i.test(accountId)) throw new DidaApiError('无效的账户。', 400);
  const { data: account, error } = await supabase.from('external_accounts').select('id,settings,status,display_name').eq('id', accountId).eq('user_id', userId).eq('provider', 'dida365').maybeSingle();
  if (error) throw new DidaApiError('读取关联账户失败。', 500);
  if (!account || account.status !== 'active') throw new DidaApiError('关联账户不可用。', 404);
  const settings = account.settings && typeof account.settings === 'object' ? account.settings as Record<string, unknown> : {};
  const selected = Array.isArray(settings.syncProjectIds) ? settings.syncProjectIds.filter(remoteId).slice(0, 30) : [];
  const { data: secret, error: secretError } = await supabase.from('external_account_secrets').select('encrypted_access_token').eq('account_id', accountId).eq('user_id', userId).maybeSingle();
  if (secretError || !secret) throw new DidaApiError('无法读取账户授权。', 500);
  return { supabase, user: { id: userId }, account, settings, selected, token: decryptSecret(secret.encrypted_access_token) };
}
export type DidaContext = Awaited<ReturnType<typeof loadDidaAccount>>;
export async function readDidaSnapshot(context: DidaContext, now = new Date()) {
  const projects = await getDidaProjects(context.token);
  const selectedProjectIds = context.selected.filter(id => projects.some(project => project.id === id));
  const normalize = (rows: unknown, id: string): DidaScheduleTask[] => {
    const tasks = normalizeDidaTasks(rows, id);
    const raw = Array.isArray(rows) ? rows : [];
    return tasks.map(task => ({ ...task, version: didaTaskVersion(raw.find(row => row?.id === task.id && row?.projectId === id), id) }));
  };
  const [batches, completed] = await Promise.all([
    Promise.all(selectedProjectIds.map(async id => { const data = await didaRequest<{ tasks?: unknown }>(context.token, `/project/${encodeURIComponent(id)}/data`); return normalize(data?.tasks, id); })),
    selectedProjectIds.length ? didaRequest<unknown>(context.token, '/task/completed', { method: 'POST', body: JSON.stringify({ projectIds: selectedProjectIds, startDate: new Date(now.getTime() - 30 * 86_400_000).toISOString(), endDate: now.toISOString() }) }) : Promise.resolve([]),
  ]);
  if (!Array.isArray(completed)) throw new DidaApiError('无法读取已完成任务。');
  const completedTasks = selectedProjectIds.flatMap(id => normalize(completed, id));
  const tasks = [...new Map([...batches.flat(), ...completedTasks].map(task => [`${task.projectId}:${task.id}`, task])).values()];
  return { projects, selectedProjectIds, tasks, completedLimitReached: completedTasks.length >= 200, syncedAt: now.toISOString() };
}
export async function setDidaTaskCompletion(context: DidaContext, project: unknown, id: unknown, completed: unknown, version?: unknown) {
  if (!remoteId(project) || !remoteId(id) || typeof completed !== 'boolean' || (version !== undefined && !isDidaVersion(version))) throw new DidaApiError('无效的任务操作。', 400);
  if (!context.selected.includes(project)) throw new DidaApiError('任务不在已选择的同步清单内。', 403);
  const projectId = encodeURIComponent(project), taskId = encodeURIComponent(id);
  const task = await didaRequest<Record<string, unknown>>(context.token, `/project/${projectId}/task/${taskId}`);
  if (task?.id !== id || task.projectId !== project) throw new DidaApiError('任务已移除或不属于该清单。', 404);
  const desired = completed ? 2 : 0;
  // Retrying a confirmed desired state is safe, even after a lost response.
  if (task.status !== desired) {
    if (version !== undefined && didaTaskVersion(task, project) !== version) throw new DidaApiError('滴答任务已改变，请刷新后重新操作。', 409);
    if (completed) await didaRequest(context.token, `/project/${projectId}/task/${taskId}/complete`, { method: 'POST' });
    else { const result = await didaRequest<{ id2error?: Record<string, unknown> }>(context.token, '/task/batch', { method: 'POST', body: JSON.stringify({ update: [{ ...task, id, projectId: project, status: 0, completedTime: null }] }) }); if (result?.id2error?.[id]) throw new DidaApiError('滴答未能取消完成，请刷新后重试。'); }
  }
  const verified = task.status === desired ? task : await didaRequest<Record<string, unknown>>(context.token, `/project/${projectId}/task/${taskId}`);
  if (verified?.status !== desired || verified.id !== id || verified.projectId !== project) throw new DidaApiError('滴答尚未确认状态变更，请刷新后重试。');
  return { ...normalizeDidaTasks([verified], project)[0], version: didaTaskVersion(verified, project) };
}
