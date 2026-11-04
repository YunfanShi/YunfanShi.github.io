'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { cueDashboard, cueEntryHref } from '@/lib/learning/cue-dashboard';
import { readScheduleState, SCHEDULE_STORAGE_KEY } from '@/lib/learning/workspace-reader';
import { QUESTION_BANK_KEY, readQuestionBank, reconcileStudyDraft } from '@/lib/learning/question-bank';
import { dateKey } from '@/lib/learning/schedule-control';
import { useRepositoryValue } from '@/hooks/use-repository-value';

const actionClass = 'inline-flex min-h-11 items-center text-sm font-semibold text-[#1a73e8] hover:underline';

export default function CueDashboard() {
  const scheduleRaw = useRepositoryValue(SCHEDULE_STORAGE_KEY);
  const questionBankRaw = useRepositoryValue(QUESTION_BANK_KEY);
  const [today, setToday] = useState(() => dateKey(new Date()));
  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = dateKey(new Date());
      setToday(current => current === next ? current : next);
    }, 60_000);
    return () => clearInterval(timer);
  }, []);
  const { summary, error } = useMemo(() => {
    try {
      const storage = { getItem: (key: string) => key === SCHEDULE_STORAGE_KEY ? scheduleRaw : key === QUESTION_BANK_KEY ? questionBankRaw : null };
      const state = readScheduleState(storage);
      const next = cueDashboard(state, today);
      if (questionBankRaw) {
        const bank = readQuestionBank(JSON.parse(questionBankRaw));
        const drafts = Object.values(bank.drafts).map(draft => reconcileStudyDraft(draft, state.cues, bank.questions)).filter(draft => draft.items.length);
        next.drafts.push(...drafts.map(draft => ({ id: draft.id, name: draft.task.subjectName || draft.task.title, count: draft.items.length, done: draft.items.filter(item => draft.assessments[`${item.kind}:${item.id}`]).length })));
      }
      return { summary: next, error: '' };
    } catch (cause) {
      return { summary: null, error: cause instanceof Error ? cause.message : '学习数据读取失败' };
    }
  }, [scheduleRaw, questionBankRaw, today]);
  return <section aria-label="今天的 CUE" className="border-b border-[var(--card-border)] px-5 py-4 sm:px-6">
    <div className="flex flex-wrap items-center justify-between gap-x-4"><h3 className="text-sm font-semibold">今天的 CUE</h3><Link className={actionClass} href={cueEntryHref()} prefetch={false}>查看全部与时间预算 →</Link></div>
    {error ? <p role="alert">{error} 请保留原数据，在同步中心检查后重试。</p> : !summary ? <p role="status">正在读取 CUE 状态…</p> : <>
      <div className="my-3 grid grid-cols-3 gap-3 sm:grid-cols-5">{[['今日待学', summary.due], ['今日已学', summary.learned], ['未学／已修改', summary.fresh], ['薄弱', summary.weak], ['熟练冷却中', summary.cooling]].map(([label, count]) => <div key={label}><p className="text-xs text-[var(--muted-foreground)]">{label}</p><strong className="mt-1 block text-lg font-semibold">{count}</strong></div>)}</div>
      <details className="mb-2 text-xs text-[var(--muted-foreground)]"><summary className="min-h-11 cursor-pointer py-3">统计说明 · 分类存在重叠</summary><p className="pb-3">按 CUE 去重，分类请勿相加。今日已学后修改的内容重新待学；熟练冷却中的内容到期后再出现。</p></details>
      {!summary.total && <p>还没有 CUE。<Link className="underline" href="/schedule?view=cue">前往添加或导入</Link></p>}
      {summary.drafts.length > 0 && <div className="mb-3"><h4 className="text-xs font-medium text-[var(--muted-foreground)]">继续未完成的学习</h4>{summary.drafts.map(draft => <div key={draft.id} className="flex items-center justify-between gap-4 py-1"><span className="min-w-0 text-sm"><span className="block break-words">{draft.name}</span><span className="text-xs text-[var(--muted-foreground)]">已评价 {draft.done}/{draft.count}</span></span><Link className={`${actionClass} shrink-0`} href={cueEntryHref('', 'due', draft.id)}>继续学习 →</Link></div>)}</div>}
      <div className="divide-y divide-[var(--card-border)]">{summary.subjects.map(subject => <div key={subject.id} className="flex items-center justify-between gap-4 py-3"><div className="min-w-0"><h4 className="text-sm font-semibold">{subject.name}</h4><p className="mt-1 text-xs text-[var(--muted-foreground)]">待学 {subject.due} · 新增／修改 {subject.fresh} · 薄弱 {subject.weak}</p></div><Link className={`${actionClass} shrink-0`} href={cueEntryHref(subject.id)}>开始学习 →</Link></div>)}</div>
    </>}
  </section>;
}
