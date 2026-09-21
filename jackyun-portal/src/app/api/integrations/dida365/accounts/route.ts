import { encryptSecret } from '@/lib/secret-crypto';
import { createClient } from '@/lib/supabase/server';
import { DidaApiError, getDidaProjects } from '@/lib/integrations/dida365-server';

export const runtime = 'nodejs';

function errorResponse(error: unknown) {
  const message = error instanceof DidaApiError ? error.message : '账户关联失败，请稍后重试。';
  const status = error instanceof DidaApiError ? error.status : 500;
  return Response.json({ error: message }, { status });
}

async function currentUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET() {
  const { supabase, user } = await currentUser();
  if (!user) return Response.json({ error: '请先登录。' }, { status: 401 });
  const { data, error } = await supabase.from('external_accounts').select('id, provider, display_name, status, settings, last_verified_at').eq('user_id', user.id).eq('provider', 'dida365').order('created_at');
  if (error) return Response.json({ error: '读取关联账户失败。' }, { status: 500 });
  return Response.json({ accounts: (data ?? []).map((row) => {
    const settings = row.settings && typeof row.settings === 'object' ? row.settings as Record<string, unknown> : {};
    return { id: row.id, provider: 'dida365', displayName: row.display_name, status: row.status, projectId: String(settings.projectId ?? ''), projectName: String(settings.projectName ?? ''), lastVerifiedAt: row.last_verified_at ?? undefined };
  }) });
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await currentUser();
    if (!user) return Response.json({ error: '请先登录。' }, { status: 401 });
    const body = await request.json() as Record<string, unknown>;
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    if (token.length < 8 || token.length > 4000) return Response.json({ error: '请输入有效的滴答清单 API Token。' }, { status: 400 });
    const projects = await getDidaProjects(token);
    if (body.action === 'probe') return Response.json({ projects });
    if (body.action !== 'connect') return Response.json({ error: '未知操作。' }, { status: 400 });

    const projectId = typeof body.projectId === 'string' ? body.projectId : '';
    const project = projects.find((item) => item.id === projectId);
    if (!project) return Response.json({ error: '请选择一个有效的滴答清单。' }, { status: 400 });
    const displayName = (typeof body.displayName === 'string' ? body.displayName.trim() : '') || '我的滴答清单';
    if (displayName.length > 80) return Response.json({ error: '账户名称不能超过 80 个字符。' }, { status: 400 });
    const now = new Date().toISOString();
    const { data: account, error: accountError } = await supabase.from('external_accounts').insert({
      user_id: user.id, provider: 'dida365', display_name: displayName, status: 'active',
      settings: { projectId: project.id, projectName: project.name, timeZone: 'Asia/Shanghai' }, last_verified_at: now, updated_at: now,
    }).select('id').single();
    if (accountError || !account) throw new Error('account insert failed');
    const { error: secretError } = await supabase.from('external_account_secrets').insert({ account_id: account.id, user_id: user.id, encrypted_access_token: encryptSecret(token), updated_at: now });
    if (secretError) {
      await supabase.from('external_accounts').delete().eq('id', account.id).eq('user_id', user.id);
      throw new Error('secret insert failed');
    }
    return Response.json({ accountId: account.id }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
