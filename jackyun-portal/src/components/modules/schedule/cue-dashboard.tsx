'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { cueDashboard, cueEntryHref } from '@/lib/learning/cue-dashboard';
import { readScheduleState, SCHEDULE_STORAGE_KEY } from '@/lib/learning/workspace-reader';
import { QUESTION_BANK_KEY, readQuestionBank, reconcileStudyDraft } from '@/lib/learning/question-bank';
import { dateKey } from '@/lib/learning/schedule-control';
import { CLOUD_STATE_APPLIED_EVENT } from '@/lib/local-workspace';

const actionClass = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--card-border)] px-4 text-sm font-semibold hover:bg-[var(--background)]';

export default function CueDashboard() {
  const [summary, setSummary] = useState<ReturnType<typeof cueDashboard> | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    function refresh() {
      try {
        const state = readScheduleState(localStorage);
        const next = cueDashboard(state, dateKey(new Date()));
        const raw = localStorage.getItem(QUESTION_BANK_KEY);
        if (raw) {
          const bank = readQuestionBank(JSON.parse(raw));
          const drafts = Object.values(bank.drafts).map(draft => reconcileStudyDraft(draft, state.cues, bank.questions)).filter(draft => draft.items.length);
          next.drafts.push(...drafts.map(draft => ({ id: draft.id, name: draft.task.subjectName || draft.task.title, count: draft.items.length, done: draft.items.filter(item => draft.assessments[`${item.kind}:${item.id}`]).length })));
        }
        setSummary(next); setError('');
      }
      catch (cause) { setError(cause instanceof Error ? cause.message : '学习数据读取失败'); }
    }
    const storage = (event: StorageEvent) => { if (!event.key || event.key === SCHEDULE_STORAGE_KEY || event.key === QUESTION_BANK_KEY) refresh(); };
    queueMicrotask(refresh);
    window.addEventListener('storage', storage);
    window.addEventListener(CLOUD_STATE_APPLIED_EVENT, refresh);
    window.addEventListener('jackyun-sync-edit', refresh);
    window.addEventListener('focus', refresh);
    const timer = window.setInterval(refresh, 60_000);
    return () => { clearInterval(timer); window.removeEventListener('storage', storage); window.removeEventListener(CLOUD_STATE_APPLIED_EVENT, refresh); window.removeEventListener('jackyun-sync-edit', refresh); window.removeEventListener('focus', refresh); };
  }, []);
  return <section aria-label="今天的 CUE" className="mb-8 space-y-4 rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5 sm:p-7">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-semibold">今天的 CUE</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">先看今天要学什么，再继续你的学习。</p></div><Link className={actionClass} href={cueEntryHref()} prefetch={false}>查看今日待学</Link></div>
    {error ? <p role="alert">{error} 请保留原数据，在同步中心检查后重试。</p> : !summary ? <p role="status">正在读取 CUE 状态…</p> : <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{[['今日待学', summary.due], ['今日已学', summary.learned], ['未学／已修改', summary.fresh], ['薄弱', summary.weak], ['熟练冷却中', summary.cooling]].map(([label, count]) => <div key={label} className="rounded-2xl bg-[var(--background)] p-4"><p className="text-xs text-[var(--muted-foreground)]">{label}</p><strong className="mt-2 block text-3xl">{count}</strong></div>)}</div>
      <p className="text-xs text-[var(--muted-foreground)]">按 CUE 去重；分类存在重叠，请勿相加。今日已学后修改的内容重新待学；熟练冷却中的内容到期后再出现。</p>
      {!summary.total && <p>还没有 CUE。<Link className="underline" href="/schedule?view=cue">前往添加或导入</Link></p>}
      {summary.drafts.length > 0 && <div className="space-y-2"><h3 className="font-semibold">继续未完成的学习</h3>{summary.drafts.map(draft => <div key={draft.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--background)] p-3"><span>{draft.name} · 已评价 {draft.done}/{draft.count}</span><Link className={actionClass} href={cueEntryHref('', 'due', draft.id)}>继续学习</Link></div>)}</div>}
      <div className="space-y-2">{summary.subjects.map(subject => <div key={subject.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--card-border)] pt-3"><div><h3 className="font-semibold">{subject.name}</h3><p className="text-sm text-[var(--muted-foreground)]">待学 {subject.due} · 新增／修改 {subject.fresh} · 薄弱 {subject.weak}</p></div><div className="flex flex-wrap gap-2"><Link className={actionClass} href={cueEntryHref(subject.id)}>查看待学</Link><Link className={actionClass} href={cueEntryHref(subject.id)}>开始学习</Link></div></div>)}</div>
    </>}
  </section>;
}
