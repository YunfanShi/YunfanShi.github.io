import { randomUUID } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { isAdminIdentity } from '@/lib/admin-auth';

// Temporary cutover verification. Disabled unless the operator sets a short expiry.
const endpoint = 'https://jackyun-sync-9d26b2cc.azurewebsites.net';
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; form-action 'self'; frame-ancestors 'none'" };

async function authorize() {
  const expires = Number(process.env.AZURE_SYNC_CHECK_EXPIRES);
  if (!Number.isFinite(expires) || expires <= Date.now() || expires > Date.now() + 4 * 3600000) return null;
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: profile, error: profileError } = await supabase.from('profiles')
    .select('role, account_status, deleted_at').eq('id', user.id).maybeSingle();
  if (profileError || !profile || profile.account_status !== 'active' || profile.deleted_at
    || !isAdminIdentity(user, profile.role)) return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? session.access_token : null;
}

function page(report?: Record<string, unknown>, status = 200) {
  const content = report ? `<pre>${JSON.stringify(report, null, 2).replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</pre>` : '';
  return new Response(`<!doctype html><html lang="zh"><meta charset="utf-8"><title>Azure 同步验收</title>
    <h1>Azure 同步验收</h1><p>仅使用当前管理员账号，在 Azure 上创建一个独立测试条目，读回后标记删除，并验证测试设备撤销。</p>
    ${content}<form method="post"><button type="submit">执行真实登录读写验收</button></form></html>`,
  { status, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
}

export async function GET() {
  if (!await authorize()) return new Response('Unavailable', { status: 404, headers });
  return page();
}

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin
    || request.headers.get('sec-fetch-site') === 'cross-site') return new Response('Forbidden', { status: 403, headers });
  const token = await authorize();
  if (!token) return new Response('Unavailable', { status: 404, headers });
  const id = randomUUID(), deviceId = randomUUID(), key = `cutover-check-${id}`;
  const httpChecks: Array<{ path: string; status: number; code?: string }> = [];
  const report: Record<string, unknown> = { requestId: id, checkedAt: new Date().toISOString(), realLogin: true, httpChecks };
  const call = async (path: string, method = 'GET', body?: unknown, bearer = token) => {
    const response = await fetch(endpoint + path, { method, headers: {
      Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json',
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000) });
    const check = { path: path.split('?')[0], status: response.status, code: undefined as string | undefined };
    httpChecks.push(check);
    const data = await response.json();
    const knownCodes = new Set(['UNAUTHORIZED', 'ACCOUNT_DISABLED', 'AUTH_UNAVAILABLE', 'ACCOUNT_STATE_UNAVAILABLE',
      'SYNC_UNAVAILABLE', 'SYNC_FORBIDDEN', 'UNSAFE_DATABASE_LOGIN', 'DEVICE_REVOKED', 'RATE_LIMITED']);
    if (knownCodes.has(data.code)) check.code = data.code;
    return { status: response.status, data };
  };
  let revision = 0, contentHash: string | null = null;
  const mutation = (deleted: boolean) => ({ deviceId, device: { name: 'Cutover verification', platform: 'web' },
    operations: [{ id: randomUUID(), key, baseRevision: revision, baseHash: contentHash,
      baseValue: revision ? { check: id } : null, value: { check: id }, deleted, clientUpdatedAt: new Date().toISOString() }] });
  try {
    for (const path of ['/api/sync/v2', '/api/sync/devices', '/api/sync/conflicts', '/api/sync/backup-markers']) {
      const result = await call(path);
      if (result.status !== 200 || result.data.ok !== true) throw Error('AZURE_READ_FAILED');
    }
    report.azureRead = true;
    report.invalidTokenRejected = (await call('/api/sync/v2', 'GET', undefined, 'invalid')).status === 401;
    const write = await call('/api/sync/v2', 'POST', mutation(false));
    const applied = write.data.applied?.find((item: { key: string }) => item.key === key);
    if (write.status !== 200 || !applied) throw Error('AZURE_WRITE_FAILED');
    revision = applied.revision; contentHash = applied.contentHash;
    const read = await call(`/api/sync/v2?key=${encodeURIComponent(key)}`);
    report.azureWriteRead = read.status === 200 && read.data.records?.some(
      (item: { key: string; value?: { check?: string } }) => item.key === key && item.value?.check === id);
    if (!report.azureWriteRead) throw Error('AZURE_READBACK_FAILED');
    const removed = await call('/api/sync/v2', 'POST', mutation(true));
    report.testEntryTombstoned = removed.status === 200 && removed.data.applied?.some((item: { key: string }) => item.key === key);
    if (!report.testEntryTombstoned) throw Error('AZURE_CLEANUP_FAILED');
    const revoked = await call('/api/sync/devices', 'DELETE', { id: deviceId });
    const blocked = await call('/api/sync/v2', 'POST', { deviceId, operations: [] });
    report.deviceRevocation = revoked.status === 200 && blocked.status === 403;
    report.ok = report.invalidTokenRejected === true && report.deviceRevocation === true;
    return page(report, report.ok ? 200 : 502);
  } catch {
    // Report only bounded status flags, never tokens, upstream messages or user records.
    report.ok = false;
    report.failure = 'Azure verification incomplete';
    return page(report, 502);
  } finally {
    if (revision && !report.testEntryTombstoned) await call('/api/sync/v2', 'POST', mutation(true)).catch(() => {});
    await call('/api/sync/devices', 'DELETE', { id: deviceId }).catch(() => {});
  }
}
