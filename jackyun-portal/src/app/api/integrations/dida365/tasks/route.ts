import { decryptSecret } from '@/lib/secret-crypto';
import { createClient } from '@/lib/supabase/server';
import { buildDidaTask, didaSourceKey, isPushableLearningTask } from '@/lib/integrations/dida365';
import { DidaApiError, didaRequest } from '@/lib/integrations/dida365-server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const accountId = typeof body.accountId === 'string' ? body.accountId : '';
    if (!/^[0-9a-f-]{36}$/i.test(accountId) || !isPushableLearningTask(body.task)) return Response.json({ error: '任务数据无效。' }, { status: 400 });
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: '请先登录。' }, { status: 401 });
    const [{ data: account }, { data: secret }] = await Promise.all([
      supabase.from('external_accounts').select('id, settings, status').eq('id', accountId).eq('user_id', user.id).eq('provider', 'dida365').maybeSingle(),
      supabase.from('external_account_secrets').select('encrypted_access_token').eq('account_id', accountId).eq('user_id', user.id).maybeSingle(),
    ]);
    if (!account || !secret || account.status !== 'active') return Response.json({ error: '滴答清单账户未关联或已失效。' }, { status: 404 });
    const settings = account.settings && typeof account.settings === 'object' ? account.settings as Record<string, unknown> : {};
    const projectId = typeof settings.projectId === 'string' ? settings.projectId : '';
    const timeZone = typeof settings.timeZone === 'string' ? settings.timeZone : 'Asia/Shanghai';
    if (!projectId) return Response.json({ error: '该账户没有选择默认清单。' }, { status: 400 });
    const token = decryptSecret(secret.encrypted_access_token);
    const sourceKey = didaSourceKey(body.task);
    const payload = buildDidaTask(body.task, projectId, timeZone);
    const { data: link } = await supabase.from('external_task_links').select('id, external_task_id').eq('user_id', user.id).eq('account_id', accountId).eq('source_key', sourceKey).maybeSingle();
    if (link) {
      await didaRequest(token, `/task/${encodeURIComponent(link.external_task_id)}`, { method: 'POST', body: JSON.stringify({ ...payload, id: link.external_task_id }) });
      await supabase.from('external_task_links').update({ updated_at: new Date().toISOString() }).eq('id', link.id).eq('user_id', user.id);
      return Response.json({ created: false, taskId: link.external_task_id });
    }
    const created = await didaRequest<{ id?: string }>(token, '/task', { method: 'POST', body: JSON.stringify(payload) });
    if (!created?.id) throw new DidaApiError('滴答清单已接收请求，但没有返回任务编号，无法确认是否添加成功。');
    const { error: linkError } = await supabase.from('external_task_links').insert({ user_id: user.id, account_id: accountId, source_key: sourceKey, external_project_id: projectId, external_task_id: created.id });
    if (linkError) throw new DidaApiError('任务已添加到滴答清单，但 JackYun 未能保存关联记录。');
    return Response.json({ created: true, taskId: created.id }, { status: 201 });
  } catch (error) {
    const message = error instanceof DidaApiError ? error.message : '添加到滴答清单失败，请稍后重试。';
    return Response.json({ error: message }, { status: error instanceof DidaApiError ? error.status : 500 });
  }
}
