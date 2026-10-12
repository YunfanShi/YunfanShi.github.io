'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { allCueStudyDrafts, cueMatchesStatusFilter, dateKey, isCueMasteryPaused, type ScheduleControlState, type CueStudyDraft } from '@/lib/learning/schedule-control';
import { todayCueQueue, uniqueCues } from '@/lib/learning/cue-dashboard';
import { questionMatchesFilter, reconcileStudyDraft, type QuestionBankState, type StudyItemRef } from '@/lib/learning/question-bank';

const buttonClass = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--card-border)] px-4 text-sm font-semibold disabled:opacity-50';

export default function CueEntryPreview({ state, bank, onStart, onResumeCue, onResumeMixed }: {
  state: ScheduleControlState; bank: QuestionBankState;
  onStart: (items: StudyItemRef[], subject: string, unit: string) => Promise<void>;
  onResumeCue: (draft: CueStudyDraft) => void; onResumeMixed: (id: string) => Promise<void>;
}) {
  const p = useSearchParams();
  const entry = p.get('view') === 'cue' ? { subject: p.get('subject') || '', unit: p.get('unit') || '', filter: p.get('filter') === 'weak' ? 'weak' : 'due', draft: p.get('draft') || '', mode: p.get('mode') === 'mixed' ? 'mixed' : 'cue' } : null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!entry) return null;
  const today = dateKey(new Date());
  const candidates = entry.filter === 'weak' ? uniqueCues(state.cues).filter(cue => cueMatchesStatusFilter(cue, 'weak', today) && !isCueMasteryPaused(cue, today) && (!cue.lastReviewedAt || dateKey(new Date(cue.lastReviewedAt)) < today || Date.parse(cue.updatedAt) > Date.parse(cue.lastReviewedAt))) : todayCueQueue(state, today);
  const cues = candidates.filter(cue => (!entry.subject || cue.subjectId === entry.subject) && (!entry.unit || cue.unit === entry.unit));
  const questions = entry.mode === 'mixed' ? bank.questions.filter(question => (!entry.subject || question.subjectId === entry.subject) && (!entry.unit || question.unit === entry.unit) && questionMatchesFilter(question, bank, entry.filter === 'weak' ? 'weak' : 'due', today) && (!bank.reviews[question.id] || dateKey(new Date(bank.reviews[question.id].lastReviewedAt)) < today)) : [];
  const drafts = Object.values(allCueStudyDrafts(state));
  const exactDraft = drafts.find(draft => draft.id === entry.draft);
  const existing = exactDraft || (!entry.draft ? drafts.find(draft => draft.task.subjectId === entry.subject || (!entry.subject && draft.cueIds.some(id => cues.some(cue => cue.id === id)))) : undefined);
  const mixed = entry.draft && bank.drafts[entry.draft];
  const liveMixed = mixed ? reconcileStudyDraft(mixed, state.cues, bank.questions) : null;
  const resumeCues = existing?.cueIds.filter(id => state.cues.some(cue => cue.id === id)) || [];
  const canResume = resumeCues.length > 0 || Boolean(liveMixed?.items.length);
  const name = state.learningCatalog.find(subject => subject.id === entry.subject)?.name || state.cues.find(cue => cue.subjectId === entry.subject)?.subjectName || '全部学科';
  async function start() {
    setBusy(true); setError('');
    try {
      if (existing && resumeCues.length) onResumeCue({ ...existing, cueIds: resumeCues, index: Math.min(existing.index, resumeCues.length - 1) });
      else if (liveMixed?.items.length) await onResumeMixed(liveMixed.id);
      else await onStart([...cues.map(cue => ({ kind: 'cue' as const, id: cue.id })), ...questions.map(question => ({ kind: 'question' as const, id: question.id }))], entry!.subject, entry!.unit);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '无法开始学习'); }
    finally { setBusy(false); }
  }
  return <section aria-label="CUE 学习预览" className="my-5 space-y-3 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5">
    <h2 className="text-xl font-semibold">{name}{entry.unit ? ` · ${entry.unit}` : ''} · {entry.filter === 'weak' ? '薄弱练习' : '今日待学'}</h2>
    <p>{canResume ? '这个范围已有学习进度，将优先恢复原顺序和作答。' : `当前范围 ${cues.length} 条 CUE${questions.length ? `、${questions.length} 题` : ''} · 预计 ${cues.length * 4 + questions.length * 8} 分钟。`}</p>
    {entry.draft && !canResume && <p role="status">原进度已结束或对应内容已删除，可从当前待学范围重新开始。</p>}
    {!canResume && !cues.length && !questions.length && <p>当前范围没有可学内容。已学内容和熟练冷却中的内容会按复习规则重新出现。</p>}
    <details><summary className="cursor-pointer">查看学习范围</summary><ul className="mt-2 max-h-64 overflow-y-auto">{cues.map(cue => <li key={cue.id} className="py-1">{cue.subjectName} · {cue.unit} · {cue.prompt}</li>)}{questions.map(question => <li key={question.id} className="py-1">题目 · {question.unit} · {question.prompt}</li>)}</ul></details>
    <button className={buttonClass} disabled={busy || (!canResume && !cues.length && !questions.length)} onClick={() => void start()}>{busy ? '准备中…' : canResume ? '继续学习' : '开始学习'}</button>
    {error && <p role="alert">{error}</p>}
  </section>;
}
