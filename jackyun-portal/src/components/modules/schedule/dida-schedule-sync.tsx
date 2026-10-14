'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DidaAccountView, DidaProject } from '@/lib/integrations/dida365';
import { didaTasksForDate, type DidaScheduleTask } from '@/lib/integrations/dida-schedule';

type Snapshot = { projects: DidaProject[]; selectedProjectIds: string[]; tasks: DidaScheduleTask[]; syncedAt: string; completedLimitReached?: boolean };
const empty: Snapshot = { projects: [], selectedProjectIds: [], tasks: [], syncedAt: '' };
const api = '/api/integrations/dida365/schedule-sync';

export default function DidaScheduleSync({ accounts, selectedDate, onTaskCount }: { accounts: DidaAccountView[]; selectedDate: string; onTaskCount?: (count: number) => void }) {
  const [selectedAccount, setSelectedAccount] = useState('');
  const accountId = accounts.some(account => account.id === selectedAccount) ? selectedAccount : accounts[0]?.id ?? '';
  const [snapshot, setSnapshot] = useState<Snapshot>(empty);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState('');
  const [notice, setNotice] = useState('');
  const generation = useRef(0);
  const accountRef = useRef(accountId);
  const pausedRef = useRef(false);
  useEffect(() => { pausedRef.current = busy || Boolean(pending) || settingsOpen; }, [busy, pending, settingsOpen]);
  useEffect(() => { accountRef.current = accountId; }, [accountId]);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!accountId) return;
    const sequence = ++generation.current;
    try {
      const response = await fetch(`${api}?accountId=${encodeURIComponent(accountId)}`, { cache: 'no-store', signal });
      const data = await response.json();
      if (sequence !== generation.current || signal?.aborted || accountRef.current !== accountId) return;
      if (!response.ok) throw new Error(data.error || '读取清单失败。');
      setSnapshot(data as Snapshot); if (!pausedRef.current) setProjectIds(data.selectedProjectIds); setNotice('');
    } catch (error) {
      if (!signal?.aborted && sequence === generation.current && accountRef.current === accountId) setNotice(error instanceof Error ? error.message : '同步失败，请重试。');
    }
  }, [accountId]);
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) { setSnapshot(empty); setProjectIds([]); setNotice(''); setSettingsOpen(false); void refresh(controller.signal); } });
    const update = () => { if (!document.hidden && !pausedRef.current) void refresh(controller.signal); };
    const timer = setInterval(update, 60_000);
    window.addEventListener('focus', update);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener('focus', update); };
    // Account changes reset the view; polling must not erase edited list selection.
  }, [refresh]);
  async function saveProjects() {
    if (busy) return;
    setBusy(true); generation.current++; const owner = accountId;
    try {
      const response = await fetch(api, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId, projectIds }) });
      const data = await response.json();
      if (accountRef.current !== owner) return;
      if (!response.ok) throw new Error(data.error || '保存失败。');
      setSettingsOpen(false); await refresh();
    } catch (error) { if (accountRef.current === owner) setNotice(error instanceof Error ? error.message : '保存失败。'); }
    finally { setBusy(false); }
  }
  async function toggle(task: DidaScheduleTask) {
    if (pending || busy) return;
    const key = `${task.projectId}:${task.id}`; const owner = accountId;
    setPending(key); setNotice(''); generation.current++;
    try {
      const response = await fetch(api, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId, projectId: task.projectId, taskId: task.id, completed: !task.completed, version: task.version }) });
      const data = await response.json();
      if (accountRef.current !== owner) return;
      if (!response.ok || !data.task) throw new Error(data.error || '状态未同步，请刷新后重试。');
      setSnapshot(value => ({ ...value, tasks: value.tasks.map(item => item.id === task.id && item.projectId === task.projectId ? data.task : item), syncedAt: new Date().toISOString() }));
      setNotice(task.completed ? '已同步取消完成。' : '已同步完成。');
    } catch (error) { if (accountRef.current === owner) setNotice(error instanceof Error ? error.message : '同步失败。'); }
    finally { setPending(''); }
  }
  const tasks = didaTasksForDate(snapshot.tasks, selectedDate);
  const pendingCount = accountId ? tasks.filter(task => !task.completed).length : 0;
  useEffect(() => { onTaskCount?.(pendingCount); }, [onTaskCount, pendingCount]);
  if (!accountId) return null;
  return <section aria-label="滴答任务时间线" className="mb-4 rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5">
    <div className="flex items-center justify-between gap-2"><div><p className="text-xs font-semibold text-[var(--muted-foreground)]">Dida · Schedule</p><h2 className="mt-1 text-lg font-semibold">滴答待办 · {pendingCount} 项待完成</h2></div><button type="button" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(value => !value)} disabled={Boolean(pending) || busy} className="min-h-11 rounded-full border border-[var(--card-border)] px-3 text-xs">同步范围</button></div>
    {accounts.length > 1 && <label className="mt-3 block text-xs">同步账户<select aria-label="同步账户" disabled={busy || Boolean(pending)} value={accountId} onChange={event => setSelectedAccount(event.target.value)} className="ml-2 rounded-lg border border-[var(--card-border)] bg-[var(--background)] p-2">{accounts.map(account => <option key={account.id} value={account.id}>{account.displayName}</option>)}</select></label>}
    {settingsOpen && <div className="mt-3 rounded-2xl bg-[var(--background)] p-3"><p className="mb-2 text-xs leading-5">选择要显示的清单。网站与滴答同步完成状态；取消全部勾选即可关闭同步。</p><div className="max-h-64 space-y-2 overflow-y-auto">{snapshot.projects.map(project => <label key={project.id} className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={projectIds.includes(project.id)} disabled={busy} onChange={event => setProjectIds(ids => event.target.checked ? [...ids, project.id] : ids.filter(id => id !== project.id))} className="h-4 w-4 accent-[var(--brand)]" />{project.name}</label>)}</div><button type="button" onClick={() => void saveProjects()} disabled={busy || !snapshot.syncedAt} className="mt-3 min-h-10 rounded-full bg-[var(--brand)] px-4 text-sm text-white disabled:opacity-50">{busy ? '保存中…' : '保存同步范围'}</button></div>}
    {notice && <p role="status" className="mt-3 text-xs leading-5">{notice}</p>}
    {snapshot.completedLimitReached && <p className="mt-2 text-xs text-[var(--muted-foreground)]">近 30 天的已完成任务最多显示 200 项；更多历史请在滴答清单查看。</p>}
    {!snapshot.selectedProjectIds.length ? <p className="mt-4 text-sm text-[var(--muted-foreground)]">点击同步范围，选择要同步的滴答清单。</p> : tasks.length ? <ol className="mt-3 divide-y divide-[var(--card-border)]">{tasks.map(task => <li key={`${task.projectId}:${task.id}`} className="flex items-start gap-3 py-3"><button type="button" aria-label={`${task.completed ? '取消完成' : '完成'} ${task.title}`} aria-pressed={task.completed} disabled={Boolean(pending) || busy} onClick={() => void toggle(task)} className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border disabled:opacity-50 ${task.completed ? 'border-emerald-400 text-emerald-600' : 'border-[var(--card-border)]'}`}><span aria-hidden="true" className="material-icons-round">{pending === `${task.projectId}:${task.id}` ? 'sync' : task.completed ? 'check_circle' : 'radio_button_unchecked'}</span></button><div className="min-w-0 flex-1"><p className={`break-words text-sm ${task.completed ? 'line-through opacity-60' : ''}`}>{task.title}</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">{task.date && task.date < selectedDate ? `逾期 ${task.date}` : task.start ?? '全天 / 未定时间'} · {snapshot.projects.find(project => project.id === task.projectId)?.name}</p>{task.content && <details className="mt-1 text-xs"><summary className="cursor-pointer text-[var(--muted-foreground)]">任务信息</summary><p className="mt-2 whitespace-pre-wrap break-words">{task.content}</p></details>}</div></li>)}</ol> : <p className="mt-4 text-sm text-[var(--muted-foreground)]">当天没有清单任务。</p>}
    <div className="mt-3 flex items-center justify-between gap-2 text-xs text-[var(--muted-foreground)]"><span>{snapshot.syncedAt ? `已同步 ${new Date(snapshot.syncedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` : '等待同步'} · 每分钟刷新</span><button type="button" disabled={busy || Boolean(pending) || settingsOpen} onClick={() => void refresh()} className="min-h-10 px-2 disabled:opacity-40">刷新</button></div>
  </section>;
}
