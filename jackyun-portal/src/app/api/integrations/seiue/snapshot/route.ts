import { decryptSecret } from '@/lib/secret-crypto';
import { createClient } from '@/lib/supabase/server';
import { fetchSeiueSnapshot, SeiueApiError, type SeiueCredentials } from '@/lib/integrations/seiue-server';
import { safeSeiueSite } from '@/lib/integrations/seiue';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache', Vary: 'Cookie' };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: '请先登录。' }, 401);
  const url = new URL(request.url), accountId = url.searchParams.get('accountId') ?? '', week = url.searchParams.get('week') ?? new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
  if (!/^[0-9a-f-]{36}$/i.test(accountId) || !/^\d{4}-\d{2}-\d{2}$/.test(week)) return json({ error: '账户或周日期无效。' }, 400);
  const { data: account, error: accountError } = await supabase.from('external_accounts').select('id,settings,status').eq('id', accountId).eq('user_id', user.id).eq('provider', 'seiue').maybeSingle();
  if (accountError || !account) return json({ error: '找不到此 SEIUE 账户。' }, 404);
  const settings = account.settings && typeof account.settings === 'object' ? account.settings as Record<string, unknown> : {};
  const expiresAt = typeof settings.tokenExpiresAt === 'string' ? settings.tokenExpiresAt : '';
  if (!expiresAt || Date.parse(expiresAt) <= Date.now()) {
    await supabase.from('external_account_secrets').delete().eq('account_id', accountId).eq('user_id', user.id);
    await supabase.from('external_accounts').update({ status: 'error', updated_at: new Date().toISOString() }).eq('id', accountId).eq('user_id', user.id).eq('provider', 'seiue');
    return json({ error: 'SEIUE Token 已过期，请在账户关联设置中重新粘贴。', needsRenewal: true }, 401);
  }
  const { data: secret, error: secretError } = await supabase.from('external_account_secrets').select('encrypted_access_token').eq('account_id', accountId).eq('user_id', user.id).maybeSingle();
  if (secretError || !secret?.encrypted_access_token) return json({ error: 'SEIUE 授权密文不可用，请重新关联。', needsRenewal: true }, 401);
  try {
    let credentials: SeiueCredentials;
    try { credentials = JSON.parse(decryptSecret(secret.encrypted_access_token)) as SeiueCredentials; }
    catch { return json({ error: 'SEIUE 授权密文无法解密，请重新关联。', needsRenewal: true }, 401); }
    if (credentials.role !== 'student' || credentials.expiresAt !== expiresAt || !safeSeiueSite(credentials.schoolSite)) return json({ error: 'SEIUE 授权信息无效，请重新关联。', needsRenewal: true }, 401);
    const snapshot = await fetchSeiueSnapshot(credentials, week);
    return json({ ...snapshot, syncedAt: new Date().toISOString(), tokenExpiresAt: expiresAt });
  } catch (error) {
    if (error instanceof SeiueApiError && (error.status === 401 || error.status === 403)) {
      if (error.status === 401) await supabase.from('external_account_secrets').delete().eq('account_id', accountId).eq('user_id', user.id);
      await supabase.from('external_accounts').update({ status: 'error', updated_at: new Date().toISOString() }).eq('id', accountId).eq('user_id', user.id).eq('provider', 'seiue');
    }
    const status = error instanceof SeiueApiError ? error.status : 502;
    return json({ error: error instanceof SeiueApiError ? error.message : 'SEIUE 同步失败，请保留上次成功的数据后重试。', ...(status === 401 ? { needsRenewal: true } : {}) }, status);
  }
}
