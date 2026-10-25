import { encryptSecret } from '@/lib/secret-crypto';
import { createClient } from '@/lib/supabase/server';
import { safeSeiueSite, SEIUE_TOKEN_TTL_MS, type SeiueAccountView } from '@/lib/integrations/seiue';
import { SeiueApiError, verifySeiueToken, type SeiueCredentials } from '@/lib/integrations/seiue-server';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache', Vary: 'Cookie' };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
function sameOrigin(request: Request) { const origin = request.headers.get('origin'); if (!origin) return false; try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; } }
async function auth() { const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); return { supabase, user }; }
function errorResponse(error: unknown) {
  if (error instanceof SeiueApiError) return json({ error: error.message }, error.status);
  const message = error instanceof Error && error.message.includes('AI_CONFIG_ENCRYPTION_KEY') ? '服务器尚未配置账户令牌加密密钥，SEIUE 关联已拒绝。' : 'SEIUE 账户操作失败，请稍后重试。';
  return json({ error: message }, 500);
}
function credentials(body: Record<string, unknown>, expiresAt: string): SeiueCredentials | null {
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  const reflectionId = typeof body.reflectionId === 'string' ? body.reflectionId.trim() : '';
  const schoolId = typeof body.schoolId === 'string' ? body.schoolId.trim() : '';
  const schoolSite = safeSeiueSite(body.schoolSite);
  if (!token || !reflectionId || !schoolId || !schoolSite || body.role !== 'student') return null;
  return { token, reflectionId, schoolId, role: 'student', schoolSite, expiresAt };
}
function view(row: { id: string; display_name: string; status: 'active' | 'error'; settings: unknown; last_verified_at: string | null }): SeiueAccountView {
  const settings = row.settings && typeof row.settings === 'object' ? row.settings as Record<string, unknown> : {};
  return { id: row.id, provider: 'seiue', displayName: row.display_name, status: row.status, schoolSite: safeSeiueSite(settings.schoolSite) ?? 'https://chalk-c3.seiue.com/', tokenExpiresAt: String(settings.tokenExpiresAt ?? ''), lastVerifiedAt: row.last_verified_at ?? undefined };
}

export async function GET() {
  const { supabase, user } = await auth();
  if (!user) return json({ error: '请先登录。' }, 401);
  const { data, error } = await supabase.from('external_accounts').select('id,provider,display_name,status,settings,last_verified_at').eq('user_id', user.id).eq('provider', 'seiue').order('created_at');
  if (error) return json({ error: error.code === 'PGRST205' || error.code === '42P01' ? 'SEIUE 账户关联数据库尚未升级。' : '读取 SEIUE 关联失败。' }, 500);
  const expired = (data ?? []).filter(row => {
    const settings = row.settings && typeof row.settings === 'object' ? row.settings as Record<string, unknown> : {};
    return typeof settings.tokenExpiresAt !== 'string' || Date.parse(settings.tokenExpiresAt) <= Date.now();
  });
  for (const row of expired) {
    await supabase.from('external_account_secrets').delete().eq('account_id', row.id).eq('user_id', user.id);
    await supabase.from('external_accounts').update({ status: 'error', updated_at: new Date().toISOString() }).eq('id', row.id).eq('user_id', user.id).eq('provider', 'seiue');
  }
  return json({ accounts: (data ?? []).map(row => expired.some(item => item.id === row.id) ? { ...view(row), status: 'error' as const } : view(row)) });
}

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) return json({ error: '请求来源无效。' }, 403);
    const { supabase, user } = await auth();
    if (!user) return json({ error: '请先登录。' }, 401);
    const raw = await request.text();
    if (raw.length > 12_000) return json({ error: '请求内容过大。' }, 413);
    const body = JSON.parse(raw) as Record<string, unknown>;
    const expiresAt = new Date(Date.now() + SEIUE_TOKEN_TTL_MS).toISOString();
    const grant = credentials(body, expiresAt);
    if (!grant) return json({ error: '请填写 Token、Reflection ID、School ID、SEIUE 学校网址，并选择学生角色。' }, 400);
    // Fail closed before writing account metadata or credentials.
    const encrypted = encryptSecret(JSON.stringify(grant));
    await verifySeiueToken(grant);
    const now = new Date().toISOString();
    const name = typeof body.displayName === 'string' ? body.displayName.trim().slice(0, 80) : '';
    const { data: account, error: accountError } = await supabase.from('external_accounts').insert({
      user_id: user.id, provider: 'seiue', display_name: name || '我的 SEIUE', status: 'active',
      settings: { role: 'student', reflectionId: grant.reflectionId, schoolId: grant.schoolId, schoolSite: grant.schoolSite, tokenExpiresAt: expiresAt },
      last_verified_at: now, updated_at: now,
    }).select('id').single();
    if (accountError || !account) return json({ error: 'SEIUE 关联数据库不可用，未保存 Token。' }, 503);
    const { error: secretError } = await supabase.from('external_account_secrets').insert({ account_id: account.id, user_id: user.id, encrypted_access_token: encrypted, updated_at: now });
    if (secretError) {
      await supabase.from('external_accounts').delete().eq('id', account.id).eq('user_id', user.id).eq('provider', 'seiue');
      return json({ error: '无法安全保存 SEIUE Token，关联已撤销。' }, 500);
    }
    return json({ accountId: account.id }, 201);
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    if (!sameOrigin(request)) return json({ error: '请求来源无效。' }, 403);
    const { supabase, user } = await auth();
    if (!user) return json({ error: '请先登录。' }, 401);
    const raw = await request.text(); if (raw.length > 12_000) return json({ error: '请求内容过大。' }, 413);
    const body = JSON.parse(raw) as Record<string, unknown>, accountId = typeof body.accountId === 'string' ? body.accountId : '';
    if (!/^[0-9a-f-]{36}$/i.test(accountId)) return json({ error: '账户 ID 无效。' }, 400);
    const { data: row, error } = await supabase.from('external_accounts').select('id,settings').eq('id', accountId).eq('user_id', user.id).eq('provider', 'seiue').maybeSingle();
    if (error || !row) return json({ error: '找不到此 SEIUE 账户。' }, 404);
    const current = row.settings && typeof row.settings === 'object' ? row.settings as Record<string, unknown> : {};
    const merged = { ...body, reflectionId: body.reflectionId ?? current.reflectionId, schoolId: body.schoolId ?? current.schoolId, schoolSite: body.schoolSite ?? current.schoolSite, role: body.role ?? current.role };
    const expiresAt = new Date(Date.now() + SEIUE_TOKEN_TTL_MS).toISOString(), grant = credentials(merged, expiresAt);
    if (!grant) return json({ error: '请提供有效 Token；账户只支持学生角色。' }, 400);
    const encrypted = encryptSecret(JSON.stringify(grant));
    await verifySeiueToken(grant);
    const now = new Date().toISOString();
    const { error: secretError } = await supabase.from('external_account_secrets').upsert({ account_id: accountId, user_id: user.id, encrypted_access_token: encrypted, updated_at: now }, { onConflict: 'account_id' });
    if (secretError) return json({ error: '无法安全更新 SEIUE Token。' }, 500);
    const { error: updateError } = await supabase.from('external_accounts').update({ status: 'active', settings: { role: 'student', reflectionId: grant.reflectionId, schoolId: grant.schoolId, schoolSite: grant.schoolSite, tokenExpiresAt: expiresAt }, last_verified_at: now, updated_at: now }).eq('id', accountId).eq('user_id', user.id).eq('provider', 'seiue');
    if (updateError) return json({ error: '已验证 Token，但账户状态更新失败，请重新检查账户。' }, 500);
    return json({ accountId, tokenExpiresAt: expiresAt });
  } catch (error) { return errorResponse(error); }
}
