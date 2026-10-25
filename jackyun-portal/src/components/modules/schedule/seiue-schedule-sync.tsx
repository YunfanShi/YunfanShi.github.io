'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LearningTask } from '@/lib/learning/schedule-control';
import type { SeiueAccountView, SeiueSnapshot } from '@/lib/integrations/seiue';
import { isSeiueCalendarEventInWeek, seiueCourseReviewKey } from '@/lib/integrations/seiue';
import { getSeiueSnapshot, withSeiueSnapshot, type SeiueSnapshotCache } from '@/lib/integrations/seiue-snapshot-cache';

const EMPTY: SeiueSnapshot = { lessons: [], todos: [], calendar: [], syncedAt: '' };
const PREF = 'jackyun:seiue-course-review:v1';
function courseKey(subject: string) { return subject.trim().toLocaleLowerCase().replace(/\s+/g, ' ').slice(0, 200); }
function readPrefs(accountId: string): Record<string, boolean> {
  try { const value = JSON.parse(localStorage.getItem(`${PREF}:${accountId}`) ?? '{}'); return value && typeof value === 'object' ? value : {}; } catch { return {}; }
}
function todoDetails(todo: SeiueSnapshot['todos'][number]) {
  return [todo.kind === 'assignment' ? (todo.assignmentType ?? '作业/资料') : '选课截止', todo.courseName, todo.creatorName ? `布置人：${todo.creatorName}` : '', todo.createdAt ? `布置时间：${todo.createdAt.slice(0, 16)}` : ''].filter(Boolean).join(' · ');
}

export default function SeiueScheduleSync({ selectedDate, onReviewTasks }: { selectedDate: string; onReviewTasks: (tasks: LearningTask[]) => void }) {
  const [accounts, setAccounts] = useState<SeiueAccountView[]>([]);
  const [accountId, setAccountId] = useState('');
  const [snapshots, setSnapshots] = useState<SeiueSnapshotCache>({});
  const [prefsByAccount, setPrefsByAccount] = useState<Record<string, Record<string, boolean>>>({});
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const ownerRef = useRef('');
  const week = useMemo(() => { const date = new Date(`${selectedDate}T12:00:00`); date.setDate(date.getDate() - ((date.getDay() + 6) % 7)); return date.toLocaleDateString('en-CA'); }, [selectedDate]);
  const weekEnd = useMemo(() => { const date = new Date(`${week}T12:00:00`); date.setDate(date.getDate() + 6); return date.toLocaleDateString('en-CA'); }, [week]);
  const prefs = useMemo(() => accountId ? prefsByAccount[accountId] ?? readPrefs(accountId) : {}, [accountId, prefsByAccount]);
  const activeSnapshot = getSeiueSnapshot(snapshots, accountId, week) ?? EMPTY;
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
  const refresh = useCallback(async () => {
    if (!accountId) return;
    setBusy(true); setNotice('');
    try {
      const response = await fetch(`/api/integrations/seiue/snapshot?accountId=${encodeURIComponent(accountId)}&week=${encodeURIComponent(week)}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'SEIUE 同步失败。');
      setSnapshots(current => withSeiueSnapshot(current, accountId, week, data as SeiueSnapshot));
    } catch (error) { setNotice(error instanceof Error ? error.message : 'SEIUE 同步失败；该账户和所选周的上次成功数据仍会保留（若有）。'); }
    finally { setBusy(false); }
  }, [accountId, week]);
  useEffect(() => { let cancelled = false; queueMicrotask(() => { if (!cancelled) void loadAccounts().catch(() => {}); }); return () => { cancelled = true; }; }, [loadAccounts]);
  useEffect(() => {
    const changed = ownerRef.current !== accountId; ownerRef.current = accountId;
    queueMicrotask(() => { if (changed && !accountId) onReviewTasks([]); });
    if (accountId) queueMicrotask(() => { void refresh(); });
  }, [accountId, refresh, onReviewTasks]);
  useEffect(() => {
    const tasks: LearningTask[] = enabledLessons.filter(lesson => Date.parse(`${lesson.date}T${lesson.end}:00+08:00`) <= clock).map(lesson => ({
      key: seiueCourseReviewKey(lesson), title: `复习 SEIUE 课程 · ${lesson.subject}`, detail: `回忆本节课程要点，补全笔记并整理需要复习的内容。${lesson.description ? `\n\n课堂备注：${lesson.description}` : ''}`,
      type: 'course-review', date: lesson.date, start: lesson.end, durationMinutes: 20, subjectName: lesson.subject, manual: false,
    }));
    onReviewTasks(tasks);
  }, [enabledLessons, onReviewTasks, clock]);
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
  if (!accounts.length) return null;
  const lessons = activeSnapshot.lessons;
  const todos = activeSnapshot.todos.filter(todo => {
    if (todo.status !== 'pending') return false;
    const deadline = todo.deadline?.slice(0, 10);
    if (!deadline) return true;
    return deadline <= weekEnd;
  });
  const calendar = activeSnapshot.calendar.filter(event => isSeiueCalendarEventInWeek(event, week, weekEnd));
  const subjects = [...new Set(activeSnapshot.lessons.map(item => item.subject))];
  return <section aria-label="SEIUE 同步" className="mb-4 rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold text-[var(--muted-foreground)]">SEIUE · 只读同步</p><h2 className="mt-1 text-lg font-semibold">课程、待办与校历</h2></div><div className="flex items-center gap-2"><select aria-label="SEIUE 账户" value={accountId} onChange={event => setAccountId(event.target.value)} className="min-h-10 rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-2 text-xs">{accounts.map(account => <option key={account.id} value={account.id}>{account.displayName}</option>)}</select><button type="button" disabled={busy} onClick={() => void refresh()} className="min-h-10 rounded-full border border-[var(--card-border)] px-3 text-xs disabled:opacity-40">{busy ? '同步中…' : '刷新'}</button></div></div>
    {notice && <p role="status" className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">{notice}。已缓存的成功快照未被覆盖。</p>}
    {subjects.length > 0 && <details className="mt-3 rounded-2xl bg-[var(--background)] p-3"><summary className="min-h-9 cursor-pointer text-sm font-medium">课后复习设置（默认关闭）</summary><div className="mt-2 space-y-2">{subjects.map(subject => <label key={subject} className="flex min-h-10 items-center gap-3 text-sm"><input type="checkbox" checked={Boolean(prefs[courseKey(subject)])} onChange={event => toggleReview(subject, event.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />课后复习 · {subject}</label>)}</div><p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">开启后，课程结束时会按单次课程 ID 创建一项 JackYun 学习任务；设置仅保存在本浏览器，不包含 Token。</p></details>}
    <div className="mt-4 grid gap-4 lg:grid-cols-3"><div><h3 className="text-sm font-semibold">所选周课程</h3>{lessons.length ? <ul className="mt-2 divide-y divide-[var(--card-border)]">{lessons.map(lesson => <li key={lesson.id} className={`py-2 text-sm ${lesson.date === selectedDate ? 'rounded-lg bg-[var(--background)] px-2' : ''}`}><strong>{lesson.date} · {lesson.subject}</strong><p className="mt-1 text-xs text-[var(--muted-foreground)]">{lesson.start}–{lesson.end}{lesson.location ? ` · ${lesson.location}` : ''}{lesson.teacher ? ` · ${lesson.teacher}` : ''}{lesson.adjustment ? ` · 调课：${lesson.adjustment}` : ''}</p>{lesson.description && <details className="mt-1 text-xs"><summary>课堂备注</summary><p className="mt-1 whitespace-pre-wrap">{lesson.description}</p></details>}</li>)}</ul> : <p className="mt-2 text-xs text-[var(--muted-foreground)]">所选周没有课程。</p>}</div>
      <div><h3 className="text-sm font-semibold">未完成作业 / 资料与选课截止</h3>{todos.length ? <ul className="mt-2 space-y-2">{todos.map(todo => <li key={todo.id} className="rounded-xl bg-[var(--background)] p-3"><p className="text-sm font-medium">{todo.title}</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">{todoDetails(todo)} · 截止：{todo.deadline ?? '未提供截止时间'} · SEIUE 状态：待完成</p>{todo.description && <details className="mt-1 text-xs"><summary>任务说明</summary><p className="mt-1 whitespace-pre-wrap">{todo.description}</p></details>}<a href={accounts.find(item => item.id === accountId)?.schoolSite ?? 'https://www.seiue.com/'} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-9 items-center rounded-full border border-[var(--card-border)] px-3 text-xs font-semibold">前往 SEIUE 查看 / 提交</a></li>)}</ul> : <p className="mt-2 text-xs text-[var(--muted-foreground)]">所选周没有未完成事项。</p>}</div>
      <div><h3 className="text-sm font-semibold">校历事件</h3>{calendar.length ? <ul className="mt-2 space-y-2">{calendar.map(event => <li key={event.id} className="rounded-xl bg-[var(--background)] p-3"><p className="text-sm font-medium">{event.title}</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">{event.date}{event.endDate ? ` 至 ${event.endDate}` : ''}</p>{event.description && <p className="mt-1 whitespace-pre-wrap text-xs">{event.description}</p>}</li>)}</ul> : <p className="mt-2 text-xs text-[var(--muted-foreground)]">所选日期没有校历事件。</p>}</div></div>
    <p className="mt-4 text-xs text-[var(--muted-foreground)]">{activeSnapshot.syncedAt ? `最近成功同步 ${new Date(activeSnapshot.syncedAt).toLocaleString('zh-CN')}` : '尚未成功同步'} · 不代提交，不更改源端完成状态。</p>
  </section>;
}
