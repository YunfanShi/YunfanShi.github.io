'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LearningTask } from '@/lib/learning/schedule-control';
import type { SeiueAccountView, SeiueSnapshot } from '@/lib/integrations/seiue';
import { parseSeiueHelperBundle, seiueCourseReviewKey } from '@/lib/integrations/seiue';
import { getSeiueSnapshot, withSeiueSnapshot, type SeiueSnapshotCache } from '@/lib/integrations/seiue-snapshot-cache';

const EMPTY: SeiueSnapshot = { lessons: [], todos: [], calendar: [], syncedAt: '' };
const PREF = 'jackyun:seiue-course-review:v1';
function courseKey(subject: string) { return subject.trim().toLocaleLowerCase().replace(/\s+/g, ' ').slice(0, 200); }
function readPrefs(accountId: string): Record<string, boolean> {
  try { const value = JSON.parse(localStorage.getItem(`${PREF}:${accountId}`) ?? '{}'); return value && typeof value === 'object' ? value : {}; } catch { return {}; }
}
export default function SeiueScheduleSync({ selectedDate, onReviewTasks, onSnapshot }: { selectedDate: string; onReviewTasks: (tasks: LearningTask[]) => void; onSnapshot: (snapshot: SeiueSnapshot, account: SeiueAccountView | null) => void }) {
  const [accounts, setAccounts] = useState<SeiueAccountView[]>([]);
  const [accountId, setAccountId] = useState('');
  const [snapshots, setSnapshots] = useState<SeiueSnapshotCache>({});
  const [prefsByAccount, setPrefsByAccount] = useState<Record<string, Record<string, boolean>>>({});
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const [renewalPromptOpen, setRenewalPromptOpen] = useState(false);
  const [renewalStarted, setRenewalStarted] = useState(false);
  const ownerRef = useRef('');
  const lastAutomaticRefresh = useRef({ scope: '', at: 0 });
  const week = useMemo(() => { const date = new Date(`${selectedDate}T12:00:00`); date.setDate(date.getDate() - ((date.getDay() + 6) % 7)); return date.toLocaleDateString('en-CA'); }, [selectedDate]);
  const weekEnd = useMemo(() => { const date = new Date(`${week}T12:00:00`); date.setDate(date.getDate() + 6); return date.toLocaleDateString('en-CA'); }, [week]);
  const prefs = useMemo(() => accountId ? prefsByAccount[accountId] ?? readPrefs(accountId) : {}, [accountId, prefsByAccount]);
  const activeSnapshot = getSeiueSnapshot(snapshots, accountId, week) ?? EMPTY;
  const activeAccount = accounts.find(item => item.id === accountId) ?? null;
  const localDay = new Date().toLocaleDateString('en-CA');
  const enabledLessons = useMemo(() => activeSnapshot.lessons.filter(lesson => prefs[courseKey(lesson.subject)]), [activeSnapshot.lessons, prefs]);
  const nextReviewBoundary = enabledLessons.reduce((next, lesson) => {
    const end = Date.parse(`${lesson.date}T${lesson.end}:00+08:00`);
    return Number.isFinite(end) && end > clock ? Math.min(next, end) : next;
  }, Number.POSITIVE_INFINITY);
  const loadAccounts = useCallback(async () => {
    const response = await fetch('/api/integrations/seiue/accounts', { cache: 'no-store' });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || '无法读取 SEIUE 关联。');
    const next = (data.accounts ?? []) as SeiueAccountView[]; setAccounts(next); setAccountId(current => next.some(item => item.id === current) ? current : next[0]?.id ?? '');
  }, []);
  const refresh = useCallback(async (force = false) => {
    if (!accountId) return;
    const now = Date.now();
    const scope = `${accountId}:${week}`;
    if (!force && lastAutomaticRefresh.current.scope === scope && now - lastAutomaticRefresh.current.at < 5000) return;
    lastAutomaticRefresh.current = { scope, at: now };
    setBusy(true); setNotice('');
    try {
      const response = await fetch(`/api/integrations/seiue/snapshot?accountId=${encodeURIComponent(accountId)}&week=${encodeURIComponent(week)}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'SEIUE 同步失败。');
      setSnapshots(current => withSeiueSnapshot(current, accountId, week, data as SeiueSnapshot));
    } catch (error) { setNotice(error instanceof Error ? error.message : 'SEIUE 同步失败；该账户和所选周的上次成功数据仍会保留（若有）。'); }
    finally { setBusy(false); }
  }, [accountId, week, selectedDate]);
  useEffect(() => { let cancelled = false; queueMicrotask(() => { if (!cancelled) void loadAccounts().catch(() => {}); }); return () => { cancelled = true; }; }, [loadAccounts]);
  useEffect(() => {
    const changed = ownerRef.current !== accountId; ownerRef.current = accountId;
    queueMicrotask(() => { if (changed && !accountId) onReviewTasks([]); });
    if (accountId) queueMicrotask(() => { void refresh(); });
  }, [accountId, refresh, onReviewTasks]);
  useEffect(() => {
    if (!accountId) return;
    const refreshWhenVisible = () => { if (!document.hidden) void refresh(); };
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => { window.removeEventListener('focus', refreshWhenVisible); document.removeEventListener('visibilitychange', refreshWhenVisible); };
  }, [accountId, refresh]);
  useEffect(() => {
    const tasks: LearningTask[] = enabledLessons.filter(lesson => Date.parse(`${lesson.date}T${lesson.end}:00+08:00`) <= clock).map(lesson => ({
      key: seiueCourseReviewKey(lesson), title: `复习 SEIUE 课程 · ${lesson.subject}`, detail: `回忆本节课程要点，补全笔记并整理需要复习的内容。${lesson.description ? `\n\n课堂备注：${lesson.description}` : ''}`,
      type: 'course-review', date: lesson.date, start: lesson.end, durationMinutes: 20, subjectName: lesson.subject, manual: false,
    }));
    onReviewTasks(tasks);
  }, [enabledLessons, onReviewTasks, clock]);
  useEffect(() => { onSnapshot(activeAccount ? activeSnapshot : EMPTY, activeAccount); }, [activeAccount, activeSnapshot, onSnapshot]);
  useEffect(() => {
    if (!activeAccount || localStorage.getItem('jackyun:seiue-daily-renewal:v1') !== 'true') return;
    const key = `jackyun:seiue-daily-renewal-prompted:${activeAccount.id}`;
    if (localStorage.getItem(key) !== localDay) setRenewalPromptOpen(true);
  }, [activeAccount, localDay]);
  useEffect(() => {
    if (!Number.isFinite(nextReviewBoundary)) return;
    const timer = window.setTimeout(() => setClock(Date.now()), Math.max(0, nextReviewBoundary - clock));
    return () => window.clearTimeout(timer);
  }, [clock, nextReviewBoundary]);
  function toggleReview(subject: string, enabled: boolean) {
    const next = { ...prefs, [courseKey(subject)]: enabled };
    if (accountId) {
      setPrefsByAccount(current => ({ ...current, [accountId]: next }));
      localStorage.setItem(`${PREF}:${accountId}`, JSON.stringify(next));
    }
  }
  function markRenewalPrompted() {
    if (activeAccount) localStorage.setItem(`jackyun:seiue-daily-renewal-prompted:${activeAccount.id}`, localDay);
  }
  function openRenewalSite() {
    if (!activeAccount) return;
    try {
      const url = new URL(activeAccount.schoolSite);
      if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'chalk-c3.seiue.com') throw new Error();
      url.searchParams.set('jackyun_connect', '1');
      window.open(url.toString(), '_blank', 'noopener,noreferrer');
      setRenewalStarted(true); markRenewalPrompted();
      setNotice('SEIUE 已在新标签页打开。助手自动复制后，返回此处在弹窗中粘贴即可续期。');
    } catch { setNotice('自动助手仅支持 https://chalk-c3.seiue.com/；请在连接设置中更新学校网址。'); }
  }
  async function pasteRenewalBundle(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    event.preventDefault();
    const bundle = parseSeiueHelperBundle(event.clipboardData.getData('text/plain'));
    void navigator.clipboard?.writeText('').catch(() => {});
    if (!bundle || !activeAccount) { setNotice('连接包无效。请从 chalk-c3.seiue.com 的助手重新获取；不要粘贴密码或 Cookie。'); return; }
    setBusy(true); setNotice('正在验证新的短期授权…');
    try {
      const response = await fetch('/api/integrations/seiue/accounts', { method: 'PATCH', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId: activeAccount.id, token: bundle.token }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '续期失败。');
      await loadAccounts(); await refresh(true);
      setRenewalStarted(false); setRenewalPromptOpen(false); setNotice('SEIUE 已续期，当前课程和待办已刷新。');
    } catch (error) { setNotice(error instanceof Error ? error.message : '续期失败；已保留原有日程数据。'); }
    finally { setBusy(false); }
  }
  const subjects = [...new Set(activeSnapshot.lessons.map(item => item.subject))];
  if (!accounts.length) return <p className="text-xs text-[var(--muted-foreground)]"><a href="/settings?section=connections" className="font-semibold text-[var(--brand)]">连接 SEIUE</a> 后，课程、待办和校历会出现在同一张 JackYun 日程中。</p>;
  return <><div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-xs" aria-label="日程来源：SEIUE">
    <span className="inline-flex items-center gap-1.5 font-semibold"><span className="h-2 w-2 rounded-full bg-emerald-500" />SEIUE 已连接</span>
    {accounts.length > 1 && <select aria-label="SEIUE 日程账户" value={accountId} onChange={event => setAccountId(event.target.value)} className="min-h-8 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-2">{accounts.map(account => <option key={account.id} value={account.id}>{account.displayName}</option>)}</select>}
    <span className="text-[var(--muted-foreground)]">成功同步后，本周课程以 SEIUE 实际课次为准；待办和校历并入显示 · 只读</span>
    <button type="button" disabled={busy} onClick={() => void refresh(true)} className="min-h-8 rounded-full border border-[var(--card-border)] px-3 font-medium disabled:opacity-40">{busy ? '刷新中…' : '刷新来源'}</button>
    <a href="/settings?section=connections" className="font-medium text-[var(--brand)]">连接设置</a>
    <span className="text-[var(--muted-foreground)]">{activeSnapshot.syncedAt ? `更新于 ${new Date(activeSnapshot.syncedAt).toLocaleString('zh-CN')}` : '正在读取当前周'}</span>
    {notice && <span role="status" className="basis-full text-amber-700 dark:text-amber-200">{notice}；保留上次成功数据。</span>}
    {subjects.length > 0 && <details className="basis-full"><summary className="min-h-8 cursor-pointer font-medium">课后复习 · 默认关闭</summary><div className="flex flex-wrap gap-x-4 gap-y-1 py-2">{subjects.map(subject => <label key={subject} className="inline-flex min-h-8 items-center gap-2"><input type="checkbox" checked={Boolean(prefs[courseKey(subject)])} onChange={event => toggleReview(subject, event.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />{subject}</label>)}</div><p className="text-[var(--muted-foreground)]">开启后，课程结束时按单次课程 ID 创建一项 JackYun 学习任务。设置仅保存在本浏览器，不含 Token。</p></details>}
  </div>{renewalPromptOpen && activeAccount && <div className="fixed inset-0 z-[90] grid place-items-center bg-black/40 p-4"><section role="dialog" aria-modal="true" aria-labelledby="seiue-renewal-title" className="w-full max-w-md rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-xl"><div className="flex items-start gap-3"><span className="material-icons-round text-2xl text-[var(--brand)]">sync</span><div><h2 id="seiue-renewal-title" className="text-lg font-semibold">获取今日 SEIUE 连接信息</h2><p className="mt-1 text-sm leading-5 text-[var(--muted-foreground)]">Token 最长 24 小时。打开已登录的学校页，助手会自动复制新连接包；回到这里粘贴后立即验证续期。</p></div></div>{renewalStarted && <label className="mt-4 block text-sm font-medium">粘贴连接包<textarea value="" onChange={event => { event.currentTarget.value = ''; }} onPaste={event => void pasteRenewalBundle(event)} rows={2} autoComplete="off" spellCheck={false} placeholder="在此处粘贴；不会显示或保存到浏览器" className="mt-1.5 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-xs" /></label>}<div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => { markRenewalPrompted(); setRenewalPromptOpen(false); setRenewalStarted(false); }} className="min-h-10 rounded-full border border-[var(--card-border)] px-4 text-sm">今天稍后</button><button type="button" disabled={busy} onClick={openRenewalSite} className="min-h-10 rounded-full bg-[var(--brand)] px-4 text-sm font-semibold text-white disabled:opacity-40 dark:text-[#202124]">{renewalStarted ? (busy ? '验证中…' : '重新打开 SEIUE') : '现在获取 / 续期'}</button></div></section></div>}</>;
}
