'use client';

import { useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { allCueStudyDrafts, CUE_REVIEW_PRIORITY_LABELS, cueMatchesStatusFilter, dateKey, isCueMasteryPaused, isCueSkippedToday, type ScheduleControlState, type CueStudyDraft } from '@/lib/learning/schedule-control';
import { CUE_MINUTES, recommendCueBudget, type CueBudget } from '@/lib/learning/cue-budget';
import { todayCueQueue, uniqueCues } from '@/lib/learning/cue-dashboard';
import { questionMatchesFilter, reconcileStudyDraft, type QuestionBankState, type StudyItemRef } from '@/lib/learning/question-bank';

const buttonClass = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--card-border)] px-4 text-sm font-semibold disabled:opacity-50';

export default function CueEntryPreview({ state, bank, onStart, onResumeCue, onResumeMixed, onSchedule }: {
  state: ScheduleControlState; bank: QuestionBankState;
  onStart: (items: StudyItemRef[], subject: string, unit: string) => Promise<void>;
  onSchedule: (cueIds: string[]) => Promise<void>;
  onResumeCue: (draft: CueStudyDraft) => void; onResumeMixed: (id: string) => Promise<void>;
}) {
  const p = useSearchParams();
  const directEntry = p.get('view') === 'cue';
  const entry = {
    subject: directEntry ? p.get('subject') || '' : '',
    unit: directEntry ? p.get('unit') || '' : '',
    draft: directEntry ? p.get('draft') || '' : '',
    filter: directEntry && p.get('filter') === 'weak' ? 'weak' : 'due',
    mode: directEntry && p.get('mode') === 'mixed' ? 'mixed' : 'cue',
  };
  const [budget, setBudget] = useState<CueBudget>(30);
  const [added, setAdded] = useState<string[]>([]);
  const [excluded, setExcluded] = useState<string[]>([]);
  const actionLock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showOptions, setShowOptions] = useState(false);
  const [visibleOptions, setVisibleOptions] = useState(24);
  const today = dateKey(new Date());
  const { subject, unit, filter } = entry;
  const candidates = filter === 'weak'
    ? uniqueCues(state.cues).filter(cue => cueMatchesStatusFilter(cue, 'weak', today) && !isCueMasteryPaused(cue, today) && !isCueSkippedToday(cue, today) && (!cue.lastReviewedAt || dateKey(new Date(cue.lastReviewedAt)) < today || Date.parse(cue.updatedAt) > Date.parse(cue.lastReviewedAt)))
    : todayCueQueue(state, today);
  const scoped = candidates.filter(cue => (!subject || cue.subjectId === subject) && (!unit || cue.unit === unit));
  const budgeting = entry.mode === 'cue' && entry.filter === 'due';
  const recommendation = recommendCueBudget(scoped, state.cueReviews, budget);
  const chosen = new Set([...recommendation.selected.map(cue => cue.id), ...added]);
  for (const id of excluded) chosen.delete(id);
  const cues = budgeting ? recommendation.ordered.filter(cue => chosen.has(cue.id)) : recommendation.ordered;
  const questions = entry.mode === 'mixed' ? bank.questions.filter(question => (!entry.subject || question.subjectId === entry.subject) && (!entry.unit || question.unit === entry.unit) && questionMatchesFilter(question, bank, entry.filter === 'weak' ? 'weak' : 'due', today) && (!bank.reviews[question.id] || dateKey(new Date(bank.reviews[question.id].lastReviewedAt)) < today)) : [];
  const drafts = Object.values(allCueStudyDrafts(state));
  const exactDraft = drafts.find(draft => draft.id === entry.draft);
  const existing = exactDraft || (!entry.draft ? drafts.find(draft => draft.task.subjectId === entry.subject || (!entry.subject && draft.cueIds.some(id => state.cues.some(cue => cue.id === id)))) : undefined);
  const mixed = entry.draft ? bank.drafts[entry.draft] : !existing && entry.mode === 'mixed' ? Object.values(bank.drafts).find(draft => !entry.subject || draft.task.subjectId === entry.subject) : undefined;
  const liveMixed = mixed ? reconcileStudyDraft(mixed, state.cues, bank.questions) : null;
  const resumeCues = existing?.cueIds.filter(id => state.cues.some(cue => cue.id === id)) || [];
  const canResume = resumeCues.length > 0 || Boolean(liveMixed?.items.length);
  const name = state.learningCatalog.find(subject => subject.id === entry.subject)?.name || state.cues.find(cue => cue.subjectId === entry.subject)?.subjectName || '全部学科';
  async function start() {
    if (actionLock.current) return;
    actionLock.current = true; setBusy(true); setError('');
    try {
      if (existing && resumeCues.length) onResumeCue({ ...existing, cueIds: resumeCues, index: Math.min(existing.index, resumeCues.length - 1) });
      else if (liveMixed?.items.length) await onResumeMixed(liveMixed.id);
      else await onStart([...cues.map(cue => ({ kind: 'cue' as const, id: cue.id })), ...questions.map(question => ({ kind: 'question' as const, id: question.id }))], entry.subject, entry.unit);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '无法开始学习'); }
    finally { actionLock.current = false; setBusy(false); }
  }
  async function schedule() {
    if (actionLock.current) return;
    actionLock.current = true; setBusy(true); setError('');
    try { await onSchedule(cues.map(cue => cue.id)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '安排失败，请重试。'); }
    finally { actionLock.current = false; setBusy(false); }
  }
  return <section aria-label="CUE 学习预览" className="my-5 space-y-4 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm sm:p-5">
    <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h2 className="text-xl font-semibold tracking-tight">{entry.filter === 'weak' ? '薄弱练习' : '优先复习'}</h2>
      <span className="text-xs font-medium text-[var(--muted-foreground)]">{name}{entry.unit ? ` · ${entry.unit}` : ''}</span>
    </header>
    {(canResume || cues.length > 0 || questions.length > 0 || (budgeting && scoped.length > 0)) && <div className="flex flex-wrap gap-2">
      <button className={`${buttonClass} border-transparent bg-[var(--brand)] text-white dark:text-[#202124]`} disabled={busy || (!canResume && !cues.length && !questions.length)} onClick={() => void start()}>{busy ? '准备中…' : canResume ? '继续学习' : '开始学习'}</button>
    </div>}
    {canResume && <p>这个范围已有学习进度，将按原顺序继续。</p>}
    {!canResume && !budgeting && <p>本轮 {cues.length} 条 CUE{questions.length ? `、${questions.length} 题` : ''} · 预计 {cues.length * CUE_MINUTES + questions.length * 8} 分钟</p>}
    {entry.draft && !canResume && <p role="status">原进度已结束或对应内容已删除，可从当前待学范围重新开始。</p>}
    {!canResume && !cues.length && !questions.length && <p>当前范围没有可学内容。已学内容和熟练冷却中的内容会按复习规则重新出现。</p>}
    {budgeting && !canResume && scoped.length > 0 && <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
        <p className="font-semibold">本轮 {cues.length} 条</p>
        {scoped.length > cues.length && <p className="text-xs text-[var(--muted-foreground)]">还有 {scoped.length - cues.length} 条可在后续复习</p>}
      </div>
      <ol className="divide-y divide-[var(--card-border)]" aria-label="本轮优先顺序">
        {cues.slice(0, 7).map(cue => {
          const priority = recommendation.priorityById.get(cue.id)!;
          return <li key={cue.id} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1 py-2">
            <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${priority === 0 ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-black/5 dark:bg-white/10'}`}>{CUE_REVIEW_PRIORITY_LABELS[priority]}</span>
            <span className="min-w-0 break-words text-sm">{cue.prompt}<small className="block text-xs text-[var(--muted-foreground)]">{cue.subjectName} · {recommendation.reasonsById.get(cue.id)}</small></span>
          </li>;
        })}
      </ol>
      <details onToggle={event => setShowOptions(event.currentTarget.open)}>
        <summary className="min-h-10 cursor-pointer py-2 text-sm font-medium">调整题量与选择题目{cues.length > 7 ? ` · 另有 ${cues.length - 7} 条已选` : ''}</summary>
        {showOptions && <div className="mt-2 space-y-2">
          <label className="flex items-center gap-2 text-sm">本轮题量<select className="min-h-10 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-2" value={budget} onChange={event => { setBudget(Number(event.target.value) as CueBudget); setAdded([]); setExcluded([]); }}><option value="15">3 条</option><option value="30">7 条</option><option value="60">15 条</option></select></label>
          <div className="max-h-64 overflow-y-auto">{recommendation.ordered.slice(0, visibleOptions).map(cue => <label key={cue.id} className="flex min-h-10 items-center gap-2 py-1 text-sm">
            <input type="checkbox" aria-label={`选择 ${cue.prompt}`} checked={chosen.has(cue.id)} onChange={event => {
              if (event.target.checked) { setAdded(current => [...current, cue.id]); setExcluded(current => current.filter(id => id !== cue.id)); }
              else { setExcluded(current => [...current, cue.id]); setAdded(current => current.filter(id => id !== cue.id)); }
            }} />
            <span>{CUE_REVIEW_PRIORITY_LABELS[recommendation.priorityById.get(cue.id)!]} · {cue.prompt}</span>
          </label>)}
          {visibleOptions < recommendation.ordered.length && <button type="button" onClick={() => setVisibleOptions(count => count + 24)} className="min-h-10 text-sm text-[var(--brand)]">显示更多</button>}</div>
          <button className={buttonClass} disabled={busy || !cues.length} onClick={() => void schedule()}>确认加入今日日程</button>
        </div>}
      </details>
    </div>}
    {!canResume && !budgeting && <details><summary className="cursor-pointer">查看学习范围</summary><ul className="mt-2 max-h-64 overflow-y-auto">{cues.map(cue => <li key={cue.id} className="py-1">{cue.subjectName} · {cue.unit} · {cue.prompt}</li>)}{questions.map(question => <li key={question.id} className="py-1">题目 · {question.unit} · {question.prompt}</li>)}</ul></details>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
