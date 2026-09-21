'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DidaAccountView, DidaProject } from '@/lib/integrations/dida365';

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
  const load = useCallback(async () => {
    const data = await readJson(await fetch('/api/integrations/dida365/accounts', { cache: 'no-store' }));
    setAccounts(data.accounts ?? []);
  }, []);
  useEffect(() => { queueMicrotask(() => load().catch((error) => setMessage(error instanceof Error ? error.message : '读取关联账户失败。'))); }, [load]);

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
    if (!window.confirm(`解除“${account.displayName}”的关联吗？已添加到滴答清单的任务不会被删除。`)) return;
    setBusy(true); setMessage('');
    try { await readJson(await fetch(`/api/integrations/dida365/accounts/${account.id}`, { method: 'DELETE' })); await load(); setMessage('账户关联已解除。'); }
    catch (error) { setMessage(error instanceof Error ? error.message : '解除关联失败。'); }
    finally { setBusy(false); }
  };

  return <div className="space-y-5">
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
