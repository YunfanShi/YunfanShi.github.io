'use client';

import { siteConfirm } from '@/lib/site-dialog';
import { useCallback, useEffect, useState } from 'react';
import type { DidaAccountView, DidaProject } from '@/lib/integrations/dida365';
import type { SeiueAccountView } from '@/lib/integrations/seiue';

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({})) as { error?: string; accounts?: DidaAccountView[]; projects?: DidaProject[] };
  if (!response.ok) throw new Error(data.error || '请求失败。');
  return data;
}

export default function AccountConnectionsPanel() {
  const [accounts, setAccounts] = useState<DidaAccountView[]>([]);
  const [displayName, setDisplayName] = useState('我的滴答清单');
  const [token, setToken] = useState('');
  const [projects, setProjects] = useState<DidaProject[]>([]);
  const [projectId, setProjectId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [seiueAccounts, setSeiueAccounts] = useState<SeiueAccountView[]>([]);
  const [seiueToken, setSeiueToken] = useState('');
  const [seiueReflectionId, setSeiueReflectionId] = useState('');
  const [seiueSchoolId, setSeiueSchoolId] = useState('');
  const [seiueSite, setSeiueSite] = useState('https://chalk-c3.seiue.com/');
  const [seiueName, setSeiueName] = useState('我的 SEIUE');
  const load = useCallback(async () => {
    const data = await readJson(await fetch('/api/integrations/dida365/accounts', { cache: 'no-store' }));
    setAccounts(data.accounts ?? []);
  }, []);
  useEffect(() => { queueMicrotask(() => load().catch((error) => setMessage(error instanceof Error ? error.message : '读取关联账户失败。'))); }, [load]);
  const loadSeiue = useCallback(async () => {
    const data = await readJson(await fetch('/api/integrations/seiue/accounts', { cache: 'no-store' })) as { accounts?: SeiueAccountView[] };
    setSeiueAccounts(data.accounts ?? []);
  }, []);
  useEffect(() => { queueMicrotask(() => loadSeiue().catch(() => {})); }, [loadSeiue]);

  const connectSeiue = async () => {
    setBusy(true); setMessage('');
    try {
      await readJson(await fetch('/api/integrations/seiue/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'connect', token: seiueToken, reflectionId: seiueReflectionId, schoolId: seiueSchoolId, schoolSite: seiueSite, role: 'student', displayName: seiueName }) }));
      setSeiueToken(''); await loadSeiue(); setMessage('SEIUE 已关联。Token 最长保存 24 小时。');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'SEIUE 关联失败。'); }
    finally { setBusy(false); }
  };
  const renewSeiue = async (account: SeiueAccountView) => {
    if (seiueToken.trim().length < 16) { setMessage('请先粘贴新的 SEIUE Token。'); return; }
    setBusy(true); setMessage('');
    try {
      await readJson(await fetch('/api/integrations/seiue/accounts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId: account.id, token: seiueToken }) }));
      setSeiueToken(''); await loadSeiue(); setMessage('SEIUE Token 已验证并更新，有效期最多 24 小时。');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'SEIUE Token 更新失败。'); }
    finally { setBusy(false); }
  };
  const disconnectSeiue = async (account: SeiueAccountView) => {
    if (!(await siteConfirm(`解除“${account.displayName}”的 SEIUE 关联吗？JackYun 将删除加密授权信息。`))) return;
    setBusy(true); setMessage('');
    try { await readJson(await fetch(`/api/integrations/seiue/accounts/${account.id}`, { method: 'DELETE' })); await loadSeiue(); setMessage('SEIUE 关联已解除，授权密文已删除。'); }
    catch (error) { setMessage(error instanceof Error ? error.message : '解除关联失败。'); }
    finally { setBusy(false); }
  };

  const probe = async () => {
    setBusy(true); setMessage('');
    try {
      const data = await readJson(await fetch('/api/integrations/dida365/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'probe', token }) }));
      const next = data.projects ?? [];
      setProjects(next); setProjectId(next[0]?.id ?? '');
      setMessage(next.length ? '连接成功，请选择 Schedule 任务要加入的默认清单。' : '连接成功，但这个账户没有可用清单。');
    } catch (error) { setMessage(error instanceof Error ? error.message : '检查连接失败。'); }
    finally { setBusy(false); }
  };
  const connect = async () => {
    setBusy(true); setMessage('');
    try {
      await readJson(await fetch('/api/integrations/dida365/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'connect', token, projectId, displayName }) }));
      setToken(''); setProjects([]); setProjectId(''); setDisplayName('我的滴答清单');
      await load(); setMessage('滴答清单账户已关联。');
    } catch (error) { setMessage(error instanceof Error ? error.message : '关联失败。'); }
    finally { setBusy(false); }
  };
  const disconnect = async (account: DidaAccountView) => {
    if (!(await siteConfirm(`解除“${account.displayName}”的关联吗？已添加到滴答清单的任务不会被删除。`))) return;
    setBusy(true); setMessage('');
    try { await readJson(await fetch(`/api/integrations/dida365/accounts/${account.id}`, { method: 'DELETE' })); await load(); setMessage('账户关联已解除。'); }
    catch (error) { setMessage(error instanceof Error ? error.message : '解除关联失败。'); }
    finally { setBusy(false); }
  };

  return <div className="space-y-5">
    <section className="space-y-4 rounded-2xl border border-[var(--card-border)] p-4" aria-label="SEIUE 账户关联">
      <div className="flex items-start gap-3"><span aria-hidden="true" className="material-icons-round mt-0.5 text-[var(--brand)]">school</span><div><h3 className="font-semibold">关联 SEIUE 学生账户</h3><p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">读取课程、作业/资料待办、选课截止和校历。只读同步，不会代提交或修改 SEIUE 数据。</p></div></div>
      <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">安全说明：你粘贴的 Token 会发送到 JackYun 服务端，并使用 AES-256-GCM 加密保存，最长 24 小时；到期、SEIUE 返回 401 或解除关联时会删除。未配置加密密钥时服务端拒绝关联。不要粘贴学校密码或 Cookie。</p>
      {seiueAccounts.map(account => <div key={account.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-black/[.035] p-3 dark:bg-white/[.05]"><div className="min-w-0 flex-1"><strong className="block truncate text-sm">{account.displayName}</strong><p className="mt-1 text-xs text-[var(--muted-foreground)]">学生账户 · Token 到期 {account.tokenExpiresAt ? new Date(account.tokenExpiresAt).toLocaleString('zh-CN') : '待续期'} · {account.schoolSite}</p><span className="text-xs">{account.status === 'active' ? '已连接' : '需要重新验证'}</span></div><button type="button" disabled={busy || seiueToken.trim().length < 16} onClick={() => void renewSeiue(account)} className="min-h-10 rounded-full border border-[var(--card-border)] px-3 text-xs disabled:opacity-40">粘贴新 Token 并续期</button><button type="button" disabled={busy} onClick={() => void disconnectSeiue(account)} className="min-h-10 rounded-full border border-[var(--card-border)] px-3 text-xs text-rose-600 disabled:opacity-40">解除关联</button></div>)}
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">账户备注<input value={seiueName} maxLength={80} onChange={event => setSeiueName(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5" /></label><label className="text-sm font-medium">SEIUE 学校前端网址<input type="url" value={seiueSite} onChange={event => setSeiueSite(event.target.value)} placeholder="https://school.seiue.com/" className="mt-1.5 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5" /></label><label className="text-sm font-medium">Reflection ID<input value={seiueReflectionId} onChange={event => setSeiueReflectionId(event.target.value)} autoComplete="off" className="mt-1.5 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5" /></label><label className="text-sm font-medium">School ID<input value={seiueSchoolId} onChange={event => setSeiueSchoolId(event.target.value)} autoComplete="off" className="mt-1.5 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5" /></label><label className="text-sm font-medium sm:col-span-2">学生 Token<input type="password" value={seiueToken} onChange={event => setSeiueToken(event.target.value)} autoComplete="new-password" placeholder="仅粘贴短期 Bearer Token；不要提供密码或 Cookie" className="mt-1.5 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5" /></label></div>
      <p className="text-xs leading-5 text-[var(--muted-foreground)]">学校网址仅接受 HTTPS 的 `*.seiue.com`。Token 由 JackYun 服务端固定请求 `api.seiue.com` 的只读接口。请从 SEIUE 官方界面获取 Token；JackYun 不会收集学校密码、Cookie 或 refresh token。</p>
      <button type="button" disabled={busy || seiueToken.trim().length < 16 || !seiueReflectionId || !seiueSchoolId} onClick={() => void connectSeiue()} className="min-h-11 rounded-full bg-[var(--brand)] px-4 text-sm font-semibold text-white disabled:opacity-40">{busy ? '验证中…' : '验证并关联 SEIUE'}</button>
    </section>
    {accounts.length > 0 && <div className="space-y-3">{accounts.map((account) => <div key={account.id} className="flex flex-col gap-3 rounded-2xl border border-[var(--card-border)] bg-[var(--background)] p-4 sm:flex-row sm:items-center"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#1a73e8] dark:bg-blue-950/40"><span className="material-icons-round">checklist</span></span><div className="min-w-0 flex-1"><strong className="block truncate text-sm">{account.displayName}</strong><p className="mt-1 text-xs text-[var(--muted-foreground)]">滴答清单 · 默认清单：{account.projectName}</p></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">已关联</span><button type="button" disabled={busy} onClick={() => disconnect(account)} className="rounded-full border border-[var(--card-border)] px-3 py-1.5 text-xs font-semibold text-rose-600 disabled:opacity-50">解除关联</button></div>)}</div>}
    <div className="rounded-2xl border border-[var(--card-border)] p-4">
      <div className="flex items-start gap-3"><span className="material-icons-round mt-0.5 text-[#1a73e8]">add_link</span><div><h3 className="font-semibold">关联新的滴答清单账户</h3><p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">支持关联多个账户。第一版使用个人 API Token；Token 仅加密保存在服务端。</p></div></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">账户备注名<input value={displayName} maxLength={80} onChange={(event) => setDisplayName(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 outline-none focus:border-[var(--brand)]" /></label><label className="text-sm font-medium">API Token<input type="password" value={token} autoComplete="off" onChange={(event) => { setToken(event.target.value); setProjects([]); setProjectId(''); }} placeholder="粘贴滴答清单个人 Token" className="mt-1.5 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 outline-none focus:border-[var(--brand)]" /></label></div>
      <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">在滴答清单网页版的“设置 → 账户 → API Token”中生成。请勿分享给他人。</p>
      {projects.length > 0 && <label className="mt-4 block text-sm font-medium">Schedule 默认添加到<select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5">{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>}
      <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busy || token.trim().length < 8} onClick={probe} className="rounded-full border border-[var(--card-border)] px-4 py-2 text-sm font-semibold disabled:opacity-40">{busy ? '检查中…' : '检查连接'}</button>{projects.length > 0 && <button type="button" disabled={busy || !projectId} onClick={connect} className="rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 dark:text-[#202124]">确认关联</button>}</div>
    </div>
    {message && <p role="status" className="rounded-xl bg-black/5 px-4 py-3 text-sm dark:bg-white/10">{message}</p>}
  </div>;
}
