import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadDidaAccount, readDidaSnapshot, setDidaTaskCompletion } from '@/lib/integrations/dida-sync-service';
import { didaTarget, parseDidaTarget } from '@/lib/integrations/dida-task-reference';
import { DidaApiError } from '@/lib/integrations/dida365-server';
import { digest } from './policy';

export async function watchDidaSnapshot(supabase: SupabaseClient, userId: string, today: string) {
  const { data, error } = await supabase.from('external_accounts').select('id,settings').eq('user_id', userId).eq('provider', 'dida365').eq('status', 'active').limit(30);
  if (error) throw new DidaApiError('滴答账户读取失败。');
  const accounts = (data ?? []).filter(account => Array.isArray(account.settings?.syncProjectIds) && account.settings.syncProjectIds.length);
  const results = await Promise.allSettled(accounts.map(async account => {
    const context = await loadDidaAccount(supabase, userId, account.id);
    const snapshot = await readDidaSnapshot(context);
    return snapshot.tasks.map(task => ({
      id: didaTarget(account.id, task.projectId, task.id), title: `滴答 · ${task.title}`, completed: task.completed, version: task.version!, source: 'dida365',
      date: task.date ?? today, start: task.start ?? '', dueLabel: `${snapshot.projects.find(project => project.id === task.projectId)?.name ?? '滴答清单'} · ${task.date ?? '无截止时间'}${task.start ? ' ' + task.start : ''}`, dueAt: 0, priority: '普通', minutes: 0,
      subject: '滴答清单', detail: `${task.content}\n可在手表待办中完成或取消完成。`,
    }));
  }));
  const tasks = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  return { tasks: tasks.slice(0, 500), hasMore: tasks.length > 500, failed: results.some(result => result.status === 'rejected') };
}

/** Desired-state writes and durable receipts make offline retries safe. */
export async function applyWatchDidaOperation(supabase: SupabaseClient, userId: string, value: Record<string, unknown>, details: Record<string, unknown>) {
  const target = parseDidaTarget(value.targetId);
  if (!target) throw new DidaApiError('无效的滴答任务。', 422);
  const hash = digest(JSON.stringify({ kind: value.kind, targetId: value.targetId, version: value.version, details }));
  const readReceipt = async () => {
    const { data, error } = await supabase.from('watch_operation_receipts').select('payload_hash,result').eq('user_id', userId).eq('operation_id', value.operationId).maybeSingle();
    if (error) throw new DidaApiError('手表操作记录暂不可用。', 503);
    if (data && data.payload_hash !== hash) throw new DidaApiError('操作编号已被其他内容使用。', 409);
    return data;
  };
  let receipt = await readReceipt();
  if (receipt?.result?.ok === true) return receipt.result;
  if (!receipt) {
    const { error } = await supabase.from('watch_operation_receipts').insert({ user_id: userId, operation_id: value.operationId, payload_hash: hash, result: {} });
    if (error && error.code !== '23505') throw new DidaApiError('操作暂未保存，请稍后重试。', 503);
    receipt = await readReceipt();
    if (receipt?.result?.ok === true) return receipt.result;
  }
  const context = await loadDidaAccount(supabase, userId, target.accountId);
  const task = await setDidaTaskCompletion(context, target.projectId, target.taskId, details.completed, value.version);
  const result = { ok: true, completed: task.completed, version: task.version };
  const { error } = await supabase.from('watch_operation_receipts').update({ result }).eq('user_id', userId).eq('operation_id', value.operationId).eq('payload_hash', hash);
  if (error) throw new DidaApiError('滴答已确认，手表回执暂未保存；请重试以确认。', 503);
  return result;
}
