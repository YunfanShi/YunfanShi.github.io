'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Details {
  authorization_id: string;
  redirect_uri: string;
  client: { name: string; uri: string; logo_uri: string };
  user: { email: string };
  scope: string;
}

export default function OAuthConsentPage() {
  const [details, setDetails] = useState<Details | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const authorizationId = new URLSearchParams(window.location.search).get('authorization_id');
    if (!authorizationId) { queueMicrotask(() => setError('授权请求无效。')); return; }
    const supabase = createClient();
    supabase.auth.oauth.getAuthorizationDetails(authorizationId).then(({ data, error: authError }) => {
      if (authError || !data) { setError(authError?.message ?? '无法读取授权请求。'); return; }
      if ('redirect_url' in data) { window.location.assign(data.redirect_url); return; }
      setDetails(data as Details);
    });
  }, []);

  async function decide(action: 'approve' | 'deny') {
    if (!details) return;
    setBusy(true);
    const supabase = createClient();
    const response = action === 'approve'
      ? await supabase.auth.oauth.approveAuthorization(details.authorization_id, { skipBrowserRedirect: true })
      : await supabase.auth.oauth.denyAuthorization(details.authorization_id, { skipBrowserRedirect: true });
    if (response.error || !response.data?.redirect_url) {
      setError(response.error?.message ?? '授权操作失败。');
      setBusy(false);
      return;
    }
    window.location.assign(response.data.redirect_url);
  }

  const scopeLabels: Record<string, string> = { openid: '确认你的身份', email: '读取账号邮箱', profile: '读取公开个人资料' };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-5 py-10">
      <section className="w-full max-w-md rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-7 shadow-xl">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e8f0fe] text-lg font-bold text-[#1967d2]">JY</div>
        <h1 className="mt-5 text-2xl font-bold tracking-tight text-[var(--foreground)]">连接 JackYun Companion</h1>
        {error ? <p className="mt-4 rounded-xl bg-[#fce8e6] p-3 text-sm text-[#b3261e]">{error}</p> : !details ? <p className="mt-4 text-sm text-[var(--muted-foreground)]">正在验证授权请求…</p> : <>
          <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]"><strong className="text-[var(--foreground)]">{details.client.name}</strong> 希望连接账号 {details.user.email}。</p>
          <div className="mt-5 rounded-2xl border border-[var(--card-border)] p-4"><p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">允许的权限</p><ul className="mt-3 space-y-2 text-sm text-[var(--foreground)]">{details.scope.split(' ').filter(Boolean).map((scope) => <li key={scope} className="flex items-center gap-2"><span className="material-icons-round text-lg text-[#34a853]">check_circle</span>{scopeLabels[scope] ?? scope}</li>)}</ul></div>
          <p className="mt-4 text-xs leading-5 text-[var(--muted-foreground)]">扩展只能访问你自己的 Companion 数据。你可以随时在设置中撤销设备和授权。</p>
          <div className="mt-6 grid grid-cols-2 gap-3"><button type="button" disabled={busy} onClick={() => decide('deny')} className="min-h-11 rounded-xl border border-[var(--card-border)] font-semibold text-[var(--foreground)] disabled:opacity-50">拒绝</button><button type="button" disabled={busy} onClick={() => decide('approve')} className="min-h-11 rounded-xl bg-[var(--brand)] font-semibold text-white disabled:opacity-50 dark:text-[#202124]">{busy ? '处理中…' : '允许连接'}</button></div>
        </>}
      </section>
    </main>
  );
}
