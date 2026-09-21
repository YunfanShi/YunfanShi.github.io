'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthMode } from '@/components/auth/auth-mode-provider';
import LearningRecordsView from '@/components/modules/schedule/learning-records-view';
import LatexRenderer from '@/components/modules/latex-renderer';
import { parseAiJson, readAiResponseContent } from '@/lib/ai-json';
import { CLOUD_STATE_APPLIED_EVENT } from '@/lib/local-workspace';
import type { DidaAccountView } from '@/lib/integrations/dida365';
import {
  applyCueEnrichments,
  applyCueUnitMappings,
  completeLearningSession,
  cuesForLearningTask,
  createEmptyScheduleState,
  createIeltsWeekTasks,
  addCalendarDays,
  dateFromKey,
  dateKey,
  deriveLearningStatus,
  cueBatchImportTemplate,
  learningCatalogImportTemplate,
  LEARNING_MATERIALS,
  LEARNING_TASK_PRESETS,
  mergeLearningCatalog,
  migrateIeltsWeekTaskDates,
  parseLearningCatalogImport,
  parseLearningUnitOutline,
  parseCueBatchImport,
  parseCueEnrichments,
  parseTimetableImport,
  postponeLearningTask,
  reconcileScheduleSubjects,
  rollOverManualTasks,
  sessionsForDate,
  tasksForDate,
  timetableImportTemplate,
  updateSubjectMaterialProgress,
  weekDates,
  withReviewCourseSelection,
  type LearningStatus,
  type CueAssessment,
  type CueBatchImportItem,
  type CueDisplayPreset,
  type CueEnrichmentItem,
  type CueType,
  type CueReview,
  type CueStudyDraft,
  type LearningTask,
  type LearningSessionEvidence,
  type LearningRecord,
  type LearningCatalogSubject,
  type ManualLearningTask,
  type ReviewDetails,
  type ScheduleControlState,
  type TimetableImport,
  type StudyCue,
} from '@/lib/learning/schedule-control';

const STORAGE_KEY = 'jackyun_schedule_control_v1';
const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
const REVIEW_TYPES = new Set<LearningTask['type']>(['course-review', 'interval-review', 'weekly-review', 'cue-review', 'unit-review', 'cumulative-review']);
const TYPE_META: Record<LearningTask['type'], { label: string; icon: string; tone: string }> = {
  'course-review': { label: '今日复习', icon: 'history_edu', tone: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-200' },
  'interval-review': { label: '间隔复习', icon: 'event_repeat', tone: 'bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-200' },
  'weekly-review': { label: '周末集中', icon: 'view_week', tone: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-200' },
  'cue-review': { label: 'Cue 复习', icon: 'quiz', tone: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-200' },
  'completeness-audit': { label: '完整性检查', icon: 'fact_check', tone: 'bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-200' },
  'unit-review': { label: '单元复习', icon: 'account_tree', tone: 'bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-200' },
  'cumulative-review': { label: '总复习', icon: 'all_inclusive', tone: 'bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-950/50 dark:text-fuchsia-200' },
  study: { label: '学习', icon: 'menu_book', tone: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-200' },
  'self-study': { label: '自学', icon: 'school', tone: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-200' },
  practice: { label: '练习', icon: 'edit_note', tone: 'bg-lime-50 text-lime-800 dark:bg-lime-950/50 dark:text-lime-200' },
  repair: { label: '修复', icon: 'build', tone: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-200' },
  preview: { label: '预习', icon: 'preview', tone: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-200' },
  special: { label: '专项学习', icon: 'target', tone: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-200' },
  exam: { label: '考试', icon: 'assignment', tone: 'bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-200' },
  custom: { label: '待办', icon: 'check_circle', tone: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200' },
};
const CUE_TYPE_OPTIONS: ReadonlyArray<{ value: CueType; label: string }> = [
  { value: 'general', label: '通用检索' }, { value: 'definition', label: '定义' }, { value: 'state', label: '陈述要点' },
  { value: 'explain', label: '解释原因' }, { value: 'calculate', label: '计算' }, { value: 'formula', label: '公式' },
  { value: 'derivation', label: '推导' }, { value: 'proof', label: '证明' }, { value: 'compare', label: '比较' },
  { value: 'process', label: '过程 / 步骤' }, { value: 'application', label: '情境应用' }, { value: 'diagram', label: '图像 / 示意图' },
  { value: 'multiple-choice', label: '类型选择题' },
];
const CUE_DISPLAY_OPTIONS: ReadonlyArray<{ value: CueDisplayPreset; label: string; hint: string }> = [
  { value: 'standard', label: '标准卡片', hint: '普通问答' }, { value: 'headline', label: '大标题', hint: '标题突出，下方小字说明' },
  { value: 'formula', label: '公式重点', hint: '适合数学式与关系式' }, { value: 'steps', label: '步骤', hint: '适合过程、算法与推导' },
  { value: 'comparison', label: '对比', hint: '适合异同与条件比较' }, { value: 'scenario', label: '情境题', hint: '适合案例和应用背景' },
  { value: 'definition-card', label: 'Definition 翻卡', hint: '正面术语，背面定义' }, { value: 'multiple-choice', label: '类型选择', hint: '选项式自动核对' },
];

function loadState(now = new Date()): ScheduleControlState {
  const empty = createEmptyScheduleState();
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as Partial<ScheduleControlState> | null;
    if (!parsed || parsed.schemaVersion !== 1) return empty;
    const storedSettings = parsed.settings as Partial<ScheduleControlState['settings']> | undefined;
    const previewPreferenceSet = storedSettings?.previewPreferenceSet === true;
    const loaded: ScheduleControlState = {
      ...empty,
      ...parsed,
      settings: {
        ...empty.settings,
        ...storedSettings,
        previewEnabled: previewPreferenceSet && storedSettings?.previewEnabled === true,
        previewPreferenceSet,
      },
      manualTasks: Array.isArray(parsed.manualTasks) ? migrateIeltsWeekTaskDates(parsed.manualTasks) : [],
      completions: parsed.completions && typeof parsed.completions === 'object' ? parsed.completions : {},
      cancellations: parsed.cancellations && typeof parsed.cancellations === 'object' ? parsed.cancellations : {},
      reviewProgress: parsed.reviewProgress && typeof parsed.reviewProgress === 'object' ? parsed.reviewProgress : {},
      cues: Array.isArray(parsed.cues) ? parsed.cues : [],
      cueReviews: Array.isArray(parsed.cueReviews) ? parsed.cueReviews : [],
      learningRecords: Array.isArray(parsed.learningRecords) ? parsed.learningRecords : [],
      learningCatalog: Array.isArray(parsed.learningCatalog) ? parsed.learningCatalog : [],
      learningReminders: Array.isArray(parsed.learningReminders) ? parsed.learningReminders : [],
      cueStudyDraft: parsed.cueStudyDraft && Array.isArray(parsed.cueStudyDraft.cueIds) && parsed.cueStudyDraft.task ? parsed.cueStudyDraft : undefined,
      timetable: parsed.timetable ? parseTimetableImport(parsed.timetable) : null,
    };
    return reconcileScheduleSubjects(rollOverManualTasks(loaded, dateKey(now), now.toISOString()));
  } catch {
    return empty;
  }
}

function formatLongDate(date: Date): string {
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(date);
}

function formatShortDate(date: Date): string {
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(date);
}

function formatReviewTimestamp(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function statusMark(status: LearningStatus): string {
  return status === 'stable' ? '√' : status === 'partial' ? '△' : '○';
}

function minutes(time: string): number {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

function taskId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `task-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function subjectIdFromName(subjectName: string): string {
  return subjectName.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/gu, '') || taskId();
}

function groupCues(cues: StudyCue[]): Array<{ subject: string; units: Array<{ unit: string; subsections: Array<{ subsection: string; cues: StudyCue[] }> }> }> {
  const subjects = new Map<string, Map<string, Map<string, StudyCue[]>>>();
  for (const cue of cues) {
    const units = subjects.get(cue.subjectName) ?? new Map<string, Map<string, StudyCue[]>>();
    const subsections = units.get(cue.unit) ?? new Map<string, StudyCue[]>();
    // New UI is intentionally subject → unit only. Legacy subsection values remain on records,
    // but are flattened here so users do not have to maintain a third classification level.
    subsections.set('', [...(subsections.get('') ?? []), cue]);
    units.set(cue.unit, subsections);
    subjects.set(cue.subjectName, units);
  }
  return [...subjects].map(([subject, units]) => ({
    subject,
    units: [...units].map(([unit, subsections]) => ({
      unit,
      subsections: [...subsections].map(([subsection, grouped]) => ({ subsection, cues: grouped })),
    })),
  }));
}

function Notice({ message }: { message: string }) {
  if (!message) return null;
  return <div role="status" className="fixed bottom-5 left-1/2 z-[80] -translate-x-1/2 rounded-full bg-[#202124] px-4 py-2.5 text-sm font-medium text-white shadow-xl">{message}</div>;
}

function EmptyState({ onImport }: { onImport: () => void }) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-3xl border border-dashed border-[var(--card-border)] bg-[var(--card)] px-6 text-center">
      <span className="material-icons-round text-4xl text-[var(--brand)]">calendar_month</span>
      <h3 className="mt-3 text-base font-semibold">先导入一份课表</h3>
      <p className="mt-1 max-w-md text-sm leading-6 text-[var(--muted-foreground)]">支持规则 JSON 和 AI 文本识别。课表不会被写进网站代码；普通 JSON 在本机解析，登录后学习状态会随账号同步。</p>
      <button type="button" onClick={onImport} className="mt-5 rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white dark:text-[#202124]">导入课表</button>
    </div>
  );
}

function CueEvidence({ cue }: { cue: StudyCue }) {
  return <><p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--brand)]">Evidence</p>{cue.answer && <div className="mt-3 text-base leading-7"><LatexRenderer content={cue.answer} /></div>}{cue.markingPoints.length > 0 && <ul className="mt-4 space-y-2 text-sm leading-6 text-[var(--muted-foreground)]">{cue.markingPoints.map((point) => <li key={point} className="flex gap-2"><span className="text-[var(--brand)]">•</span><LatexRenderer content={point} /></li>)}</ul>}{!cue.answer && !cue.markingPoints.length && <p className="mt-3 text-sm text-[var(--muted-foreground)]">这条 Cue 暂无参考答案或 marking points，请按自己的笔记核对。</p>}</>;
}

function CuePromptContent({ cue, revealed, selectedChoice, onReveal, onChoice }: { cue: StudyCue; revealed: boolean; selectedChoice?: number; onReveal: () => void; onChoice: (index: number) => void }) {
  const definitionCard = cue.type === 'definition' || cue.display === 'definition-card';
  const multipleChoice = cue.type === 'multiple-choice' || cue.display === 'multiple-choice';
  if (definitionCard) {
    const faceClass = 'absolute inset-0 flex min-h-[390px] w-full flex-col items-center justify-center overflow-y-auto rounded-[32px] border border-[var(--card-border)] bg-[var(--card)] p-8 text-center shadow-xl [backface-visibility:hidden]';
    return <section className="my-auto py-8"><button type="button" onClick={onReveal} aria-label={revealed ? '翻到题目面' : '翻到定义面'} aria-pressed={revealed} className="mx-auto block min-h-[390px] w-full max-w-4xl [perspective:1200px]"><span className={`relative block min-h-[390px] w-full transition-transform duration-500 [transform-style:preserve-3d] motion-reduce:transition-none ${revealed ? '[transform:rotateY(180deg)]' : ''}`}><span aria-hidden={revealed} className={faceClass}><span className="text-xs font-bold uppercase tracking-[.16em] text-[var(--muted-foreground)]">Definition · 正面</span><span className="mt-8 text-3xl font-bold leading-tight sm:text-5xl"><LatexRenderer content={cue.prompt} /></span>{cue.subtitle && <span className="mt-4 text-sm font-normal leading-6 text-[var(--muted-foreground)]"><LatexRenderer content={cue.subtitle} /></span>}<span className="mt-auto pt-8 text-xs text-[var(--muted-foreground)]">空格 / Enter 或点击翻面</span></span><span aria-hidden={!revealed} className={`${faceClass} [transform:rotateY(180deg)]`}><span className="w-full text-left"><CueEvidence cue={cue} /></span></span></span></button></section>;
  }
  if (multipleChoice) {
    return <section className="my-auto py-8"><article className="mx-auto max-w-4xl rounded-[32px] border border-[var(--card-border)] bg-[var(--card)] p-7 shadow-lg"><p className="text-xs font-bold uppercase tracking-[.14em] text-[var(--brand)]">类型选择 · 按 1–{cue.choices?.length ?? 0}</p><div className="my-7 text-center text-2xl font-bold leading-relaxed sm:text-4xl"><LatexRenderer content={cue.prompt} /></div>{cue.subtitle && <div className="mb-6 text-center text-sm leading-6 text-[var(--muted-foreground)]"><LatexRenderer content={cue.subtitle} /></div>}<div className="space-y-3">{(cue.choices ?? []).map((choice, choiceIndex) => { const correct = choiceIndex === cue.correctChoice; const chosen = choiceIndex === selectedChoice; return <button key={`${choiceIndex}-${choice}`} type="button" disabled={revealed} onClick={() => onChoice(choiceIndex)} className={`w-full rounded-2xl border-2 p-4 text-left text-sm ${revealed && correct ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200' : revealed && chosen ? 'border-rose-500 bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200' : 'border-[var(--card-border)] hover:border-[var(--brand)]'}`}><kbd className="mr-3 rounded bg-[var(--background)] px-2 py-1 text-xs">{choiceIndex + 1}</kbd><LatexRenderer content={choice} /></button>; })}</div>{revealed && <div className="mt-5 rounded-2xl bg-black/[.035] p-4 text-left dark:bg-white/[.06]"><p className={`font-semibold ${selectedChoice === cue.correctChoice ? 'text-emerald-700 dark:text-emerald-200' : 'text-rose-700 dark:text-rose-200'}`}>{selectedChoice === cue.correctChoice ? '选择正确' : '选择错误；正确选项已标出。'}</p>{cue.markingPoints.length > 0 && <div className="mt-2"><CueEvidence cue={{ ...cue, answer: undefined }} /></div>}</div>}</article></section>;
  }
  return <section className="my-auto py-10 text-center"><p className="text-xs font-semibold uppercase tracking-[.14em] text-[var(--muted-foreground)]">Recall prompt</p><div className={`mx-auto mt-5 max-w-4xl font-semibold leading-relaxed ${(cue.display ?? 'standard') === 'headline' || (cue.display ?? 'standard') === 'formula' ? 'text-3xl sm:text-5xl' : 'text-2xl sm:text-4xl'}`}><LatexRenderer content={cue.prompt} /></div>{cue.subtitle && <div className="mx-auto mt-4 max-w-3xl text-sm font-normal leading-6 text-[var(--muted-foreground)] sm:text-base"><LatexRenderer content={cue.subtitle} /></div>}{revealed ? <div className="mx-auto mt-10 max-w-3xl rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6 text-left shadow-sm"><CueEvidence cue={cue} /></div> : <button type="button" onClick={onReveal} className="mt-10 rounded-full bg-[var(--brand)] px-6 py-3 text-sm font-semibold text-white shadow-sm dark:text-[#202124]">显示答案与判分依据</button>}</section>;
}

function CueStudyPage({ task, cues, draft, onProgress, onClose, onComplete }: { task: LearningTask; cues: StudyCue[]; draft: CueStudyDraft; onProgress: (draft: CueStudyDraft) => void; onClose: () => void; onComplete: (details: ReviewDetails, evidence: LearningSessionEvidence) => void }) {
  const [index, setIndex] = useState(() => Math.min(Math.max(0, draft.index), Math.max(0, cues.length - 1)));
  const [revealed, setRevealed] = useState(draft.revealed);
  const [selectedChoice, setSelectedChoice] = useState<number | undefined>(draft.selectedChoice);
  const [assessments, setAssessments] = useState<Record<string, LearningStatus>>(draft.assessments);
  const current = cues[index];
  const assessedCount = Object.keys(assessments).length;
  const submit = useCallback((nextAssessments: Record<string, LearningStatus>) => onComplete(
    { studiedContent: '', issue: '', note: '' },
    {
      subjectName: task.subjectName,
      scope: { ...(task.scope?.unit ? { unit: task.scope.unit } : {}), cueIds: cues.map((cue) => cue.id) },
      materials: task.materials ?? [],
      cueIds: cues.map((cue) => cue.id),
      newCues: [],
      assessments: cues.map((cue) => ({ cueId: cue.id, status: nextAssessments[cue.id] })),
    },
  ), [cues, onComplete, task]);
  const rate = useCallback((status: LearningStatus) => {
    if (!current) return;
    const next = { ...assessments, [current.id]: status };
    setAssessments(next);
    if (index === cues.length - 1 && Object.keys(next).length === cues.length) {
      submit(next);
      return;
    }
    const nextUnrated = cues.findIndex((cue, cueIndex) => cueIndex > index && !next[cue.id]);
    setIndex(nextUnrated >= 0 ? nextUnrated : Math.min(index + 1, cues.length - 1));
    setRevealed(false);
    setSelectedChoice(undefined);
  }, [assessments, cues, current, index, submit]);
  const move = useCallback((offset: number) => {
    if (!cues.length) return;
    setIndex((value) => Math.min(cues.length - 1, Math.max(0, value + offset)));
    setRevealed(false);
    setSelectedChoice(undefined);
  }, [cues.length]);
  useEffect(() => {
    onProgress({ id: draft.id, task, cueIds: cues.map((cue) => cue.id), index, revealed, ...(selectedChoice !== undefined ? { selectedChoice } : {}), assessments, updatedAt: new Date().toISOString() });
  }, [assessments, cues, draft.id, index, onProgress, revealed, selectedChoice, task]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); move(1); }
      else if (!revealed && current?.type === 'multiple-choice' && Number(event.key) >= 1 && Number(event.key) <= (current.choices?.length ?? 0)) { event.preventDefault(); setSelectedChoice(Number(event.key) - 1); setRevealed(true); }
      else if ((event.key === ' ' || event.key === 'Enter') && !revealed && current?.type !== 'multiple-choice' && !(event.target instanceof HTMLButtonElement)) { event.preventDefault(); setRevealed(true); }
      else if (revealed && (event.key === '1' || event.key.toLowerCase() === 'c')) { event.preventDefault(); rate('stable'); }
      else if (revealed && (event.key === '2' || event.key.toLowerCase() === 'p')) { event.preventDefault(); rate('partial'); }
      else if (revealed && (event.key === '3' || event.key.toLowerCase() === 'x')) { event.preventDefault(); rate('unclear'); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [current, move, onClose, rate, revealed]);
  return (
    <div className="fixed inset-0 z-[75] overflow-y-auto bg-[var(--background)]" role="dialog" aria-modal="true" aria-labelledby="cue-study-title">
      <header className="sticky top-0 z-10 border-b border-[var(--card-border)] bg-[color-mix(in_srgb,var(--background)_92%,transparent)] px-4 py-4 backdrop-blur-xl sm:px-8">
        <div className="mx-auto flex max-w-5xl items-center gap-4"><button type="button" onClick={onClose} aria-label="退出 Cue 学习并保存进度" className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"><span className="material-icons-round">arrow_back</span></button><div className="min-w-0 flex-1"><p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--brand)]">Cue Study · 自动保存</p><h1 id="cue-study-title" className="truncate text-lg font-semibold">{task.title}</h1></div><span className="text-sm font-semibold">{cues.length ? `${Math.min(index + 1, cues.length)} / ${cues.length}` : '0 / 0'}</span></div>
        <div className="mx-auto mt-3 h-1.5 max-w-5xl overflow-hidden rounded-full bg-black/10 dark:bg-white/10"><div className="h-full rounded-full bg-[var(--brand)] transition-[width]" style={{ width: `${cues.length ? (assessedCount / cues.length) * 100 : 0}%` }} /></div>
      </header>
      <main className="mx-auto flex min-h-[calc(100dvh-110px)] max-w-5xl flex-col px-4 py-8 sm:px-8">
        {!current ? <div className="m-auto max-w-lg rounded-3xl border border-dashed border-[var(--card-border)] p-10 text-center"><span className="material-icons-round text-4xl text-[var(--brand)]">quiz</span><h2 className="mt-3 text-xl font-semibold">这个任务暂时没有 Cue</h2><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">请先在 Cue 工作台为“{[task.subjectName, task.scope?.unit].filter(Boolean).join(' → ') || task.title}”添加 Cue，再回来验证。</p><button type="button" onClick={onClose} className="mt-5 rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white dark:text-[#202124]">返回 Schedule</button></div> : <>
          <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-2"><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-200">{current.subjectName}</span><span className="rounded-full bg-black/5 px-3 py-1 text-xs font-semibold dark:bg-white/10">{current.unit}</span><span className="rounded-full bg-black/5 px-3 py-1 text-xs uppercase text-[var(--muted-foreground)] dark:bg-white/10">{current.type}</span><span className="rounded-full bg-black/5 px-3 py-1 text-xs text-[var(--muted-foreground)] dark:bg-white/10">{CUE_DISPLAY_OPTIONS.find((item) => item.value === (current.display ?? 'standard'))?.label}</span></div><p className="text-xs text-[var(--muted-foreground)]">先闭卷作答，再揭示证据并判定</p></div>
          <CuePromptContent cue={current} revealed={revealed} selectedChoice={selectedChoice} onReveal={() => setRevealed((value) => !value)} onChoice={(choiceIndex) => { setSelectedChoice(choiceIndex); setRevealed(true); }} />
          <div className="border-t border-[var(--card-border)] pt-5"><p className="mb-3 text-center text-sm font-semibold">这次闭卷检索的状态</p>{revealed ? <div className="grid gap-3 sm:grid-cols-3"><button type="button" onClick={() => rate('stable')} className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-left text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"><strong className="text-xl">C / 1 · √ 通过</strong><span className="mt-1 block text-xs">完整、准确，无需提示</span></button><button type="button" onClick={() => rate('partial')} className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-left text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"><strong className="text-xl">P / 2 · △ 部分通过</strong><span className="mt-1 block text-xs">有缺漏或需要提示</span></button><button type="button" onClick={() => rate('unclear')} className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-left text-rose-800 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200"><strong className="text-xl">X / 3 · ○ 未通过</strong><span className="mt-1 block text-xs">无法检索或核心错误</span></button></div> : <p className="rounded-2xl border border-dashed border-[var(--card-border)] px-4 py-4 text-center text-sm text-[var(--muted-foreground)]">{current.type === 'multiple-choice' ? `先选择 1–${current.choices?.length ?? 0}，系统核对后再判定状态。` : '先按空格 / Enter 显示答案，再判定状态。'}</p>}<div className="mt-4 flex items-center justify-between gap-3"><button type="button" disabled={index === 0} onClick={() => move(-1)} className="rounded-full px-4 py-2 text-sm font-medium disabled:opacity-30">← 上一条</button><span className="text-center text-xs leading-5 text-[var(--muted-foreground)]">{current.type === 'multiple-choice' && !revealed ? `1–${current.choices?.length ?? 0} 选择答案` : '空格 / Enter 显示答案'} · ←/→ 切换 · {revealed ? 'C/P/X 或 1/2/3 判定 · ' : ''}Esc 保存退出</span><button type="button" disabled={index >= cues.length - 1} onClick={() => move(1)} className="rounded-full px-4 py-2 text-sm font-medium disabled:opacity-30">下一条 →</button></div></div>
        </>}
      </main>
    </div>
  );
}

function CueStudyDashboard({ cues, draft, onStart, onResume, onDiscard }: { cues: StudyCue[]; draft?: CueStudyDraft; onStart: (subjectName: string, unit: string, cueIds: string[]) => void; onResume: () => void; onDiscard: () => void }) {
  const subjects = [...new Set(cues.map((cue) => cue.subjectName))];
  const [subjectName, setSubjectName] = useState(subjects[0] ?? '');
  const [unit, setUnit] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'weak' | 'partial' | 'unclear'>('all');
  const units = [...new Set(cues.filter((cue) => cue.subjectName === subjectName).map((cue) => cue.unit))];
  const scopedCues = cues.filter((cue) => cue.subjectName === subjectName && (!unit || cue.unit === unit));
  const selectedCues = scopedCues.filter((cue) => statusFilter === 'all' || (statusFilter === 'weak' && (cue.status === 'partial' || cue.status === 'unclear')) || cue.status === statusFilter);
  const stableCount = scopedCues.filter((cue) => cue.status === 'stable').length;
  const partialCount = scopedCues.filter((cue) => cue.status === 'partial').length;
  const unclearCount = scopedCues.filter((cue) => cue.status === 'unclear').length;
  return <div className="mt-5 space-y-5">
    {draft && <section className="rounded-3xl border border-blue-300 bg-blue-50/80 p-5 dark:border-blue-800 dark:bg-blue-950/30"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.12em] text-blue-700 dark:text-blue-200">发现未完成进度 · 已自动保存</p><h2 className="mt-1 text-lg font-semibold">{draft.task.title}</h2><p className="mt-2 text-sm text-[var(--muted-foreground)]">已判定 {Object.keys(draft.assessments).length} / {draft.cueIds.length} 条 · 上次位置 {Math.min(draft.index + 1, draft.cueIds.length)} / {draft.cueIds.length} · {new Date(draft.updatedAt).toLocaleString('zh-CN')}</p></div><div className="flex gap-2"><button type="button" onClick={onDiscard} className="rounded-full border border-[var(--card-border)] px-4 py-2 text-sm font-medium">放弃进度</button><button type="button" onClick={onResume} className="rounded-full bg-[var(--brand)] px-5 py-2 text-sm font-semibold text-white dark:text-[#202124]">恢复学习</button></div></div></section>}
    <section className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--brand)]">Focused Cue Study</p><h2 className="mt-1 text-2xl font-semibold">Cue 专项学习</h2><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">选择一个科目，也可以继续限定到某个大单元。学习时只需闭卷回忆、显示答案，再标记三个状态。</p></div><span className="material-icons-round text-4xl text-[var(--brand)]">psychology_alt</span></div>
      {cues.length ? <><div className="mt-6 grid gap-3 sm:grid-cols-3"><label className="text-sm font-medium">科目<select value={subjectName} onChange={(event) => { setSubjectName(event.target.value); setUnit(''); }} className="mt-1.5 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5">{subjects.map((subject) => <option key={subject}>{subject}</option>)}</select></label><label className="text-sm font-medium">大单元（可选）<select value={unit} onChange={(event) => setUnit(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5"><option value="">全部大单元</option>{units.map((item) => <option key={item}>{item}</option>)}</select></label><label className="text-sm font-medium">状态专项<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="mt-1.5 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5"><option value="all">全部 Cue</option><option value="weak">△ 黄色＋○ 红色</option><option value="partial">仅 △ 黄色</option><option value="unclear">仅 ○ 红色</option></select></label></div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">{[['本次 Cue', selectedCues.length], ['√', stableCount], ['△', partialCount], ['○', unclearCount]].map(([label, value]) => <div key={label} className="rounded-2xl bg-black/[.035] p-4 text-center dark:bg-white/[.06]"><p className="text-xs text-[var(--muted-foreground)]">{label}</p><strong className="mt-1 block text-2xl">{value}</strong></div>)}</div><button type="button" disabled={!selectedCues.length} onClick={() => onStart(subjectName, unit, selectedCues.map((cue) => cue.id))} className="mt-6 rounded-full bg-[var(--brand)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-40 dark:text-[#202124]">开始{statusFilter === 'all' ? '' : '薄弱项'}专项学习 · {selectedCues.length} 条</button></> : <div className="mt-6 rounded-2xl border border-dashed border-[var(--card-border)] p-8 text-center"><p className="font-semibold">还没有可以学习的 Cue</p><p className="mt-2 text-sm text-[var(--muted-foreground)]">请先打开 Cue 管理，手动添加或批量导入。</p></div>}
    </section>
    <section className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5 text-sm leading-6 text-[var(--muted-foreground)]"><strong className="text-[var(--foreground)]">快捷键：</strong>空格 / Enter 显示答案；←/→ 切换；显示答案后 C/P/X 或 1/2/3 标记 √/△/○；Esc 自动保存并退出。</section>
  </div>;
}

function ReviewDialog({ task, cues, catalog, signedIn, onClose, onComplete }: { task: LearningTask; cues: StudyCue[]; catalog: LearningCatalogSubject[]; signedIn: boolean; onClose: () => void; onComplete: (details: ReviewDetails, evidence: LearningSessionEvidence) => void }) {
  const [studiedContent, setStudiedContent] = useState(task.studiedContent ?? '');
  const [issue, setIssue] = useState(task.issue ?? '');
  const [note, setNote] = useState(task.note ?? '');
  const [subjectName, setSubjectName] = useState(task.subjectName ?? '');
  const [unit, setUnit] = useState(task.scope?.unit ?? '');
  const subsection = task.scope?.subsection ?? '';
  const [materials, setMaterials] = useState<Record<string, string>>(() => ({
    ...catalog.find((subject) => subject.name === task.subjectName)?.materialProgress,
    ...Object.fromEntries((task.materials ?? []).map((material) => [material.code, material.progress ?? ''])),
  }));
  const [selectedCueIds, setSelectedCueIds] = useState<string[]>(task.cueIds?.length ? task.cueIds : []);
  const [cueStatuses, setCueStatuses] = useState<Record<string, LearningStatus | 'linked'>>({});
  const [newCues, setNewCues] = useState<StudyCue[]>([]);
  const [cueQuery, setCueQuery] = useState('');
  const [showCueForm, setShowCueForm] = useState(false);
  const [showCueBatchImport, setShowCueBatchImport] = useState(false);
  const [newCuePrompt, setNewCuePrompt] = useState('');
  const [newCueSubtitle, setNewCueSubtitle] = useState('');
  const [newCueAnswer, setNewCueAnswer] = useState('');
  const [newCueType, setNewCueType] = useState<CueType>('general');
  const [newCueDisplay, setNewCueDisplay] = useState<CueDisplayPreset>('standard');
  const [newCueChoices, setNewCueChoices] = useState('');
  const [newCueCorrectChoice, setNewCueCorrectChoice] = useState(0);
  const [newCueMarkingPoints, setNewCueMarkingPoints] = useState('');
  const [cueSubjectFilter, setCueSubjectFilter] = useState(task.subjectName ?? '');
  const [cueUnitFilter, setCueUnitFilter] = useState(task.scope?.unit ?? '');
  const allCues = [...cues, ...newCues];
  const selectedCueSet = new Set(selectedCueIds);
  const visibleCues = groupCues(allCues.filter((cue) => (!cueSubjectFilter || cue.subjectName === cueSubjectFilter) && (!cueUnitFilter || cue.unit === cueUnitFilter) && `${cue.subjectName} ${cue.unit} ${cue.subsection} ${cue.prompt}`.toLowerCase().includes(cueQuery.trim().toLowerCase())).sort((left, right) => Number(selectedCueSet.has(right.id)) - Number(selectedCueSet.has(left.id))));
  const assessments = selectedCueIds.flatMap((cueId): CueAssessment[] => { const cueStatus = cueStatuses[cueId]; return cueStatus && cueStatus !== 'linked' ? [{ cueId, status: cueStatus }] : []; });
  const status = deriveLearningStatus(selectedCueIds, assessments);
  const selectedSubjectConfig = catalog.find((subject) => subject.name === subjectName);
  const missingCueState = selectedCueIds.some((id) => !cueStatuses[id]);
  const cueSubjects = [...new Set(allCues.map((cue) => cue.subjectName))];
  const cueUnits = [...new Set(allCues.filter((cue) => !cueSubjectFilter || cue.subjectName === cueSubjectFilter).map((cue) => cue.unit))];
  const chooseSubject = (value: string) => {
    setSubjectName(value); setUnit('');
    setCueSubjectFilter(value); setCueUnitFilter('');
    const previous = catalog.find((subject) => subject.name === value)?.materialProgress ?? {};
    setMaterials((current) => ({ ...previous, ...current }));
  };
  const toggleMaterial = (code: string) => setMaterials((current) => {
    const next = { ...current };
    if (code in next) delete next[code]; else next[code] = '';
    return next;
  });
  const toggleCue = (cueId: string) => {
    setSelectedCueIds((current) => current.includes(cueId) ? current.filter((id) => id !== cueId) : [...current, cueId]);
    setCueStatuses((current) => current[cueId] ? current : { ...current, [cueId]: 'linked' });
  };
  const createCue = () => {
    if (!subjectName.trim() || !unit.trim() || !newCuePrompt.trim()) return;
    const choices = newCueChoices.split('\n').map((item) => item.trim()).filter(Boolean).slice(0, 6);
    if (newCueType === 'multiple-choice' && (choices.length < 2 || newCueCorrectChoice >= choices.length)) return;
    const now = new Date().toISOString();
    const normalizedSubject = subjectName.trim().slice(0, 80);
    const subjectId = allCues.find((cue) => cue.subjectName.toLowerCase() === normalizedSubject.toLowerCase())?.subjectId
      ?? (task.subjectName?.toLowerCase() === normalizedSubject.toLowerCase() ? task.subjectId : undefined)
      ?? subjectIdFromName(normalizedSubject);
    const cue: StudyCue = {
      id: taskId(), subjectId, subjectName: normalizedSubject,
      unit: unit.trim().slice(0, 120), subsection: subsection.trim().slice(0, 120), prompt: newCuePrompt.trim().slice(0, 500),
      ...(newCueSubtitle.trim() ? { subtitle: newCueSubtitle.trim().slice(0, 500) } : {}), ...(newCueAnswer.trim() ? { answer: newCueAnswer.trim().slice(0, 2000) } : {}),
      type: newCueType, display: newCueDisplay, ...(newCueType === 'multiple-choice' ? { choices, correctChoice: newCueCorrectChoice } : {}), markingPoints: newCueMarkingPoints.split('\n').map((item) => item.trim()).filter(Boolean).slice(0, 12),
      intervalDays: 0, easeFactor: 2.5, streak: 0, nextReviewDate: addCalendarDays(dateKey(new Date()), 1), createdAt: now, updatedAt: now,
    };
    setNewCues((current) => [...current, cue]);
    setSelectedCueIds((current) => [...current, cue.id]);
    setCueStatuses((current) => ({ ...current, [cue.id]: 'linked' }));
    setNewCuePrompt(''); setNewCueSubtitle(''); setNewCueAnswer(''); setNewCueChoices(''); setNewCueCorrectChoice(0); setNewCueMarkingPoints(''); setShowCueForm(false);
  };
  const importLessonCues = (items: CueBatchImportItem[]) => {
    const now = new Date().toISOString();
    const normalizedSubject = subjectName.trim().slice(0, 80);
    const subjectId = selectedSubjectConfig?.id ?? subjectIdFromName(normalizedSubject);
    const imported = items.map((item): StudyCue => ({
      id: taskId(), subjectId, subjectName: normalizedSubject, unit: item.unit, subsection: '', prompt: item.prompt,
      ...(item.subtitle ? { subtitle: item.subtitle } : {}), ...(item.answer ? { answer: item.answer } : {}), type: item.type, display: item.display,
      ...(item.choices ? { choices: item.choices, correctChoice: item.correctChoice } : {}),
      markingPoints: item.markingPoints, intervalDays: 0, easeFactor: 2.5, streak: 0, nextReviewDate: addCalendarDays(dateKey(new Date()), 1), createdAt: now, updatedAt: now,
    }));
    setNewCues((current) => [...current, ...imported]);
    setSelectedCueIds((current) => [...current, ...imported.map((cue) => cue.id)]);
    setCueStatuses((current) => ({ ...current, ...Object.fromEntries(imported.map((cue) => [cue.id, 'linked' as const])) }));
    setShowCueBatchImport(false);
  };
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="review-dialog-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="max-h-[92dvh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-2xl">
        <div className="flex items-start gap-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-50 text-[var(--brand)] dark:bg-blue-950/50"><span className="material-icons-round">fact_check</span></div>
          <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-[var(--brand)]">完成学习记录</p><h2 id="review-dialog-title" className="mt-1 text-xl font-semibold">{task.title}</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">填写实际范围、资料和 Cue；只有评分过的 Cue 才会更新复习时间。记录会{signedIn ? '同步到当前账号' : '先保存在本机，登录后可同步'}。</p></div>
          <button type="button" onClick={onClose} aria-label="关闭" className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"><span className="material-icons-round">close</span></button>
        </div>
        <div className={`mt-5 rounded-2xl border p-4 ${status === 'stable' ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200' : status === 'partial' ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200' : 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200'}`}><div className="flex items-center gap-3"><span className="text-2xl font-bold">{statusMark(status)}</span><div><strong>系统自动判定：{status === 'stable' ? '全部通过' : status === 'partial' ? '部分通过' : '未通过'}</strong><p className="mt-1 text-xs leading-5 opacity-80">{status === 'stable' ? '所有所选 Cue 都是 √。' : status === 'unclear' ? '至少一条所选 Cue 是 ○。' : '没有红色 Cue，但存在 △、仅关联或尚无 Cue 证据。'}</p></div></div></div>
        <div className="mt-5 space-y-4">
          <label className="block text-sm font-medium">补充本次实际学习 / 复习内容 <span className="text-[var(--muted-foreground)]">（可选）</span><textarea value={studiedContent} onChange={(event) => setStudiedContent(event.target.value)} rows={2} maxLength={1000} placeholder="留空时，系统会根据任务、实际范围、资料位置和所选 Cue 自动生成。" className="mt-2 w-full resize-none rounded-2xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-3 text-sm leading-6 outline-none focus:border-[var(--brand)]" /></label>
          {status !== 'stable' && <label className="block text-sm font-medium">发现的问题 <span className="text-[var(--muted-foreground)]">（可选；留空时系统会根据 Cue 自动生成）</span><textarea value={issue} onChange={(event) => setIssue(event.target.value)} rows={2} maxLength={1000} placeholder="例如：会代公式，但无法解释为什么要这样变形。" className="mt-2 w-full resize-none rounded-2xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-3 text-sm leading-6 outline-none focus:border-[var(--brand)]" /></label>}
          <label className="block text-sm font-medium">其他备注 <span className="text-[var(--muted-foreground)]">（可选）</span><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} maxLength={1000} placeholder="例如：下次换一道综合题，或记录使用的资料页码。" className="mt-2 w-full resize-none rounded-2xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-3 text-sm leading-6 outline-none focus:border-[var(--brand)]" /></label>
          <fieldset className="rounded-2xl border border-[var(--card-border)] p-4"><legend className="px-2 text-sm font-semibold">实际范围</legend>{catalog.length ? <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium">学科<select value={subjectName} onChange={(event) => chooseSubject(event.target.value)} className="mt-1.5 w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-2.5 py-2 text-sm"><option value="">请选择</option>{catalog.map((subject) => <option key={subject.id} value={subject.name}>{subject.name}</option>)}</select></label><label className="text-xs font-medium">大单元<select value={unit} disabled={!selectedSubjectConfig} onChange={(event) => setUnit(event.target.value)} className="mt-1.5 w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-2.5 py-2 text-sm disabled:opacity-50"><option value="">请选择</option>{selectedSubjectConfig?.units.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label></div> : <p className="text-xs leading-5 text-amber-700 dark:text-amber-200">请先在“设置 → 学科与单元分类”中导入分类配置。</p>}</fieldset>
          <fieldset className="rounded-2xl border border-[var(--card-border)] p-4"><legend className="px-2 text-sm font-semibold">本次实际使用资料</legend><div className="grid gap-2 sm:grid-cols-2">{LEARNING_MATERIALS.map((material) => { const checked = material.code in materials; return <div key={material.code} className={`rounded-xl border p-3 ${checked ? 'border-[var(--brand)] bg-blue-50/60 dark:bg-blue-950/25' : 'border-[var(--card-border)]'}`}><label className="flex cursor-pointer items-center gap-2 text-xs font-medium"><input type="checkbox" checked={checked} onChange={() => toggleMaterial(material.code)} className="h-4 w-4 accent-[var(--brand)]" /><strong className="font-mono">{material.code}</strong>{material.label}</label>{checked && <input value={materials[material.code]} onChange={(event) => setMaterials((current) => ({ ...current, [material.code]: event.target.value }))} placeholder="例如：1.1–1.2 / P12–18" className="mt-2 w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-2.5 py-2 text-xs" />}</div>; })}</div></fieldset>
          <fieldset className="rounded-2xl border border-[var(--card-border)] p-4"><legend className="px-2 text-sm font-semibold">本次 Cue</legend><div className="flex flex-wrap items-center justify-between gap-3"><p className="max-w-2xl text-xs leading-5 text-[var(--muted-foreground)]">勾选代表本次有关；“仅关联”不改变复习日期，√ / △ / ○ 才更新状态。上新课时可立即手动录入，也可以把课堂笔记交给 AI 批量整理。</p><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setShowCueForm((current) => !current)} className="rounded-full border border-[var(--card-border)] px-3 py-1.5 text-xs font-semibold"><span className="material-icons-round mr-1 align-middle text-base">add</span>手动录入 Cue</button><button type="button" disabled={!subjectName.trim()} onClick={() => setShowCueBatchImport(true)} className="rounded-full bg-[var(--brand)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40 dark:text-[#202124]"><span className="material-icons-round mr-1 align-middle text-base">auto_awesome</span>课堂笔记 / AI 录入</button></div></div>
          {showCueForm && <div className="mt-4 rounded-2xl border border-[var(--card-border)] bg-black/[.025] p-4 dark:bg-white/[.05]"><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium">题型<select value={newCueType} onChange={(event) => { const value = event.target.value as CueType; setNewCueType(value); if (value === 'definition') setNewCueDisplay('definition-card'); if (value === 'multiple-choice') setNewCueDisplay('multiple-choice'); }} className="mt-1.5 w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-2.5 py-2 text-sm">{CUE_TYPE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label className="text-xs font-medium">显示预设<select value={newCueDisplay} onChange={(event) => setNewCueDisplay(event.target.value as CueDisplayPreset)} className="mt-1.5 w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-2.5 py-2 text-sm">{CUE_DISPLAY_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label} — {item.hint}</option>)}</select></label></div><label className="mt-3 block text-xs font-medium">题目大标题<input value={newCuePrompt} onChange={(event) => setNewCuePrompt(event.target.value)} placeholder="例如：推导匀加速运动的位移公式" className="mt-1.5 w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm" /></label><label className="mt-3 block text-xs font-medium">题目说明小字 <span className="font-normal text-[var(--muted-foreground)]">（背景、已知条件或作答限制，不要写答案）</span><textarea value={newCueSubtitle} onChange={(event) => setNewCueSubtitle(event.target.value)} rows={2} placeholder={String.raw`例如：从 \(v=u+at\) 出发，并说明每一步。`} className="mt-1.5 w-full resize-none rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm" /></label>{newCueType === 'multiple-choice' && <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]"><label className="text-xs font-medium">选项（每行一个，2–6 项）<textarea value={newCueChoices} onChange={(event) => setNewCueChoices(event.target.value)} rows={4} className="mt-1.5 w-full resize-none rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm" /></label><label className="text-xs font-medium">正确选项<select value={newCueCorrectChoice} onChange={(event) => setNewCueCorrectChoice(Number(event.target.value))} className="mt-1.5 w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm">{newCueChoices.split('\n').map((item) => item.trim()).filter(Boolean).slice(0, 6).map((item, itemIndex) => <option key={`${itemIndex}-${item}`} value={itemIndex}>{itemIndex + 1} · {item}</option>)}</select></label></div>}<label className="mt-3 block text-xs font-medium">参考答案 <span className="font-normal text-[var(--muted-foreground)]">（可选）</span><textarea value={newCueAnswer} onChange={(event) => setNewCueAnswer(event.target.value)} rows={3} placeholder="揭示后显示的完整参考答案" className="mt-1.5 w-full resize-none rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm" /></label><label className="mt-3 block text-xs font-medium">Marking points <span className="font-normal text-[var(--muted-foreground)]">（每行一个必要得分点）</span><textarea value={newCueMarkingPoints} onChange={(event) => setNewCueMarkingPoints(event.target.value)} rows={3} placeholder="关键公式或关系\n必要限定条件\n完整解释链" className="mt-1.5 w-full resize-none rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm" /></label><p className="mt-3 text-xs leading-5 text-[var(--muted-foreground)]">数学符号支持 LaTeX：行内使用 <code>\(...\)</code>，例如 <code>\(f(x)&gt;g(x)\)</code>；独立公式使用 <code>\[...\]</code>。</p>{newCuePrompt.trim() && <div className="mt-3 rounded-xl border border-dashed border-[var(--card-border)] bg-[var(--card)] p-4 text-center"><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--muted-foreground)]">显示预览 · {CUE_DISPLAY_OPTIONS.find((item) => item.value === newCueDisplay)?.label}</p><div className={`mt-2 font-semibold ${newCueDisplay === 'headline' || newCueDisplay === 'formula' ? 'text-2xl' : 'text-lg'}`}><LatexRenderer content={newCuePrompt} /></div>{newCueSubtitle.trim() && <div className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]"><LatexRenderer content={newCueSubtitle} /></div>}</div>}<div className="mt-3 flex justify-end"><button type="button" disabled={!subjectName.trim() || !unit.trim() || !newCuePrompt.trim() || newCueType === 'multiple-choice' && newCueChoices.split('\n').filter((item) => item.trim()).length < 2} onClick={createCue} className="rounded-full bg-[var(--brand)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-40 dark:text-[#202124]">加入本次记录</button></div></div>}
          <div className="mt-3 grid gap-2 sm:grid-cols-2"><select value={cueSubjectFilter} onChange={(event) => { setCueSubjectFilter(event.target.value); setCueUnitFilter(''); }} aria-label="按学科筛选 Cue" className="rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm"><option value="">全部学科</option>{cueSubjects.map((value) => <option key={value} value={value}>{value}</option>)}</select><select value={cueUnitFilter} onChange={(event) => setCueUnitFilter(event.target.value)} aria-label="按大单元筛选 Cue" className="rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm"><option value="">全部大单元</option>{cueUnits.map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
          <input value={cueQuery} onChange={(event) => setCueQuery(event.target.value)} placeholder="快速搜索 Cue 问题、学科或单元…" className="mt-2 w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm" />
          <div className="mt-3 max-h-80 space-y-4 overflow-y-auto">{visibleCues.map((subject) => <section key={subject.subject}><h3 className="sticky top-0 z-10 rounded-lg bg-[var(--background)] px-2 py-1.5 text-sm font-semibold">{subject.subject}</h3>{subject.units.map((unitGroup) => <div key={unitGroup.unit} className="ml-2 mt-2 border-l-2 border-[var(--card-border)] pl-3"><p className="text-xs font-semibold text-[var(--brand)]">{unitGroup.unit}</p>{unitGroup.subsections.map((subsectionGroup) => <div key={subsectionGroup.subsection} className="mt-2"><p className="text-[11px] font-medium text-[var(--muted-foreground)]">{subsectionGroup.subsection}</p><div className="mt-1 space-y-2">{subsectionGroup.cues.map((cue) => { const checked = selectedCueIds.includes(cue.id); return <div key={cue.id} className={`rounded-xl border p-3 ${checked ? 'border-[var(--brand)] bg-blue-50/60 dark:bg-blue-950/25' : 'border-[var(--card-border)]'}`}><label className="flex cursor-pointer items-start gap-2"><input type="checkbox" checked={checked} onChange={() => toggleCue(cue.id)} className="mt-1 h-4 w-4 accent-[var(--brand)]" /><span className="min-w-0 flex-1"><span className="text-[10px] font-semibold uppercase text-[var(--muted-foreground)]">[{cue.type}] · {CUE_DISPLAY_OPTIONS.find((item) => item.value === (cue.display ?? 'standard'))?.label}</span><span className="block text-sm font-semibold"><LatexRenderer content={cue.prompt} /></span>{cue.subtitle && <span className="mt-1 block text-xs leading-5 text-[var(--muted-foreground)]"><LatexRenderer content={cue.subtitle} /></span>}{cue.markingPoints.length > 0 && <span className="mt-1 block text-xs text-[var(--muted-foreground)]">Marking points：{cue.markingPoints.join(' · ')}</span>}</span></label>{checked && <div className="mt-3 grid grid-cols-4 gap-1.5">{([['linked', '仅关联'], ['stable', '√'], ['partial', '△'], ['unclear', '○']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setCueStatuses((current) => ({ ...current, [cue.id]: value }))} className={`h-9 rounded-lg border text-xs font-bold ${cueStatuses[cue.id] === value ? 'border-[var(--brand)] bg-[var(--brand)] text-white dark:text-[#202124]' : 'border-[var(--card-border)]'}`}>{label}</button>)}</div>}</div>; })}</div></div>)}</div>)}</section>)}{!allCues.length && <p className="rounded-xl border border-dashed border-[var(--card-border)] py-8 text-center text-xs text-[var(--muted-foreground)]">还没有 Cue，可以直接在上方新增。</p>}</div></fieldset>
        </div>
        {missingCueState && <p className="mt-2 text-xs text-rose-600">请为所有选中的 Cue 选择“仅关联”或状态。</p>}
        <div className="mt-5 flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-full border border-[var(--card-border)] px-5 py-2.5 text-sm font-medium">取消</button><button type="button" disabled={missingCueState} onClick={() => onComplete({ studiedContent, issue, note }, { subjectName: subjectName.trim() || undefined, scope: unit.trim() || subsection.trim() ? { ...(unit.trim() ? { unit: unit.trim() } : {}), ...(subsection.trim() ? { subsection: subsection.trim() } : {}), cueIds: selectedCueIds } : { cueIds: selectedCueIds }, materials: Object.entries(materials).map(([code, progress]) => ({ code: code as LearningSessionEvidence['materials'][number]['code'], ...(progress.trim() ? { progress: progress.trim() } : {}) })), cueIds: selectedCueIds, newCues, assessments })} className={`rounded-full px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 ${status === 'unclear' ? 'bg-rose-600' : 'bg-[var(--brand)] dark:text-[#202124]'}`}>{status === 'unclear' ? '保存记录，继续修复' : '保存学习记录'}</button></div>
      </div>
      {showCueBatchImport && <CueBatchImportDialog subjectName={subjectName.trim()} unit={unit} knownUnits={selectedSubjectConfig?.units.map((item) => item.name) ?? []} onClose={() => setShowCueBatchImport(false)} onImport={importLessonCues} />}
    </div>
  );
}

function TaskDialog({ date, cues, catalog, onClose, onSave }: { date: string; cues: StudyCue[]; catalog: LearningCatalogSubject[]; onClose: () => void; onSave: (task: ManualLearningTask) => void }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<ManualLearningTask['type']>('custom');
  const [presetId, setPresetId] = useState('');
  const [taskDate, setTaskDate] = useState(date);
  const [start, setStart] = useState('');
  const [duration, setDuration] = useState(30);
  const [subject, setSubject] = useState('');
  const [unit, setUnit] = useState('');
  const [selectedCueIds, setSelectedCueIds] = useState<string[]>([]);
  const [materials, setMaterials] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const selectedPreset = LEARNING_TASK_PRESETS.find((preset) => preset.id === presetId);
  const groupedCues = groupCues(cues);
  const selectedSubjectConfig = catalog.find((item) => item.name === subject);
  const applyPreset = (id: string) => {
    setPresetId(id);
    const preset = LEARNING_TASK_PRESETS.find((item) => item.id === id);
    if (!preset) return;
    setTitle(preset.title);
    setType(preset.type);
    setDuration(preset.durationMinutes);
    setNote(preset.note);
  };
  const toggleMaterial = (code: string) => setMaterials((current) => {
    const next = { ...current };
    if (code in next) delete next[code];
    else next[code] = '';
    return next;
  });
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="task-dialog-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-2xl" onSubmit={(event) => { event.preventDefault(); if (!title.trim()) return; onSave({ id: taskId(), title: title.trim().slice(0, 120), type, date: taskDate, ...(start ? { start } : {}), durationMinutes: Math.max(5, Math.min(600, duration || 30)), ...(subject.trim() ? { subject: subject.trim().slice(0, 80) } : {}), ...(presetId ? { presetId } : {}), ...((unit.trim() || selectedCueIds.length) ? { scope: { ...(unit.trim() ? { unit: unit.trim().slice(0, 120) } : {}), ...(selectedCueIds.length ? { cueIds: selectedCueIds } : {}) } } : {}), ...(Object.keys(materials).length ? { materials: Object.entries(materials).map(([code, progress]) => ({ code: code as keyof typeof materials, ...(progress.trim() ? { progress: progress.trim().slice(0, 200) } : {}) })) as ManualLearningTask['materials'] } : {}), ...(selectedPreset?.guide ? { guide: selectedPreset.guide } : {}), ...(note.trim() ? { note: note.trim().slice(0, 1000) } : {}) }); }}>
        <div className="flex items-center justify-between"><h2 id="task-dialog-title" className="text-xl font-semibold">添加学习任务</h2><button type="button" onClick={onClose} aria-label="关闭" className="grid h-10 w-10 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"><span className="material-icons-round">close</span></button></div>
        <div className="mt-5 space-y-4">
          <label className="block text-sm font-medium">任务预设<select value={presetId} onChange={(event) => applyPreset(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3.5 py-2.5"><option value="">不使用预设</option>{(['常规学习', '复习与检查', '练习与修复', 'IELTS'] as const).map((group) => <optgroup key={group} label={group}>{LEARNING_TASK_PRESETS.filter((preset) => preset.group === group).map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</optgroup>)}</select></label>
          <label className="block text-sm font-medium">任务名称<input autoFocus required value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder="例如：力学专题训练" className="mt-2 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3.5 py-2.5 outline-none focus:border-[var(--brand)]" /></label>
          <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">类型<select value={type} onChange={(event) => setType(event.target.value as ManualLearningTask['type'])} className="mt-2 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3.5 py-2.5"><option value="study">学习</option><option value="self-study">自学</option><option value="completeness-audit">完整性检查</option><option value="unit-review">单元复习</option><option value="cumulative-review">总复习</option><option value="practice">练习</option><option value="repair">修复</option><option value="preview">预习（可选）</option><option value="special">专项学习</option><option value="exam">考试</option><option value="custom">待办</option></select></label><label className="text-sm font-medium">科目（可选）<select value={subject} onChange={(event) => { setSubject(event.target.value); setUnit(''); }} className="mt-2 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3.5 py-2.5"><option value="">请选择</option>{catalog.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></label></div>
          <label className="block text-sm font-medium">大单元（可选）<select value={unit} disabled={!selectedSubjectConfig} onChange={(event) => setUnit(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3.5 py-2.5 disabled:opacity-50"><option value="">请选择</option>{selectedSubjectConfig?.units.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label>
          {groupedCues.length > 0 && <fieldset className="rounded-2xl border border-[var(--card-border)] p-4"><legend className="px-2 text-sm font-semibold">按大单元 / 小单元选择 Cue</legend><p className="mb-3 text-xs text-[var(--muted-foreground)]">选中的 Cue 会成为任务的具体学习或复习内容。</p><div className="max-h-64 space-y-3 overflow-y-auto">{groupedCues.map((subjectGroup) => <section key={subjectGroup.subject}><h3 className="text-xs font-semibold">{subjectGroup.subject}</h3>{subjectGroup.units.map((unitGroup) => <div key={unitGroup.unit} className="ml-2 mt-2 border-l-2 border-[var(--card-border)] pl-3"><p className="text-xs font-semibold text-[var(--brand)]">{unitGroup.unit}</p>{unitGroup.subsections.map((subsectionGroup) => <div key={subsectionGroup.subsection} className="mt-2"><p className="text-[11px] text-[var(--muted-foreground)]">{subsectionGroup.subsection}</p>{subsectionGroup.cues.map((cue) => <label key={cue.id} className="mt-1 flex cursor-pointer items-start gap-2 rounded-lg p-2 hover:bg-black/[.035] dark:hover:bg-white/[.06]"><input type="checkbox" checked={selectedCueIds.includes(cue.id)} onChange={() => setSelectedCueIds((current) => current.includes(cue.id) ? current.filter((id) => id !== cue.id) : [...current, cue.id])} className="mt-0.5 h-4 w-4 accent-[var(--brand)]" /><span className="text-xs">[{cue.type.toUpperCase()}] {cue.prompt}</span></label>)}</div>)}</div>)}</section>)}</div></fieldset>}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3"><label className="text-sm font-medium">日期<input required type="date" value={taskDate} onChange={(event) => setTaskDate(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5" /></label><label className="text-sm font-medium">开始（可选）<input type="time" value={start} onChange={(event) => setStart(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5" /></label><label className="col-span-2 text-sm font-medium sm:col-span-1">分钟<input type="number" min={5} max={600} value={duration} onChange={(event) => setDuration(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5" /></label></div>
          <label className="block text-sm font-medium">备注<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={1000} className="mt-2 w-full resize-none rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3.5 py-2.5" /></label>
          <fieldset><legend className="text-sm font-medium">使用资料与计划范围（可多选）</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{LEARNING_MATERIALS.map((material) => { const checked = material.code in materials; return <div key={material.code} className={`rounded-xl border p-3 ${checked ? 'border-[var(--brand)] bg-blue-50/60 dark:bg-blue-950/25' : 'border-[var(--card-border)]'}`}><label className="flex cursor-pointer items-center gap-2 text-sm font-medium"><input type="checkbox" checked={checked} onChange={() => toggleMaterial(material.code)} className="h-4 w-4 accent-[var(--brand)]" /><span className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-xs dark:bg-white/10">{material.code}</span>{material.label}</label>{checked && <input value={materials[material.code]} onChange={(event) => setMaterials((current) => ({ ...current, [material.code]: event.target.value }))} maxLength={200} placeholder="例如：1.1–1.2 / P12–18 / Q1–8" className="mt-2 w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-2.5 py-2 text-xs" />}</div>; })}</div></fieldset>
        </div>
        <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-full border border-[var(--card-border)] px-5 py-2.5 text-sm font-medium">取消</button><button type="submit" className="rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white dark:text-[#202124]">添加</button></div>
      </form>
    </div>
  );
}

function CueHierarchy({ cues, reviews, onDelete }: { cues: StudyCue[]; reviews: CueReview[]; onDelete: (cue: StudyCue) => void }) {
  const grouped = groupCues(cues);
  const reviewCounts = new Map<string, number>();
  for (const review of reviews) reviewCounts.set(review.cueId, (reviewCounts.get(review.cueId) ?? 0) + 1);
  if (!grouped.length) return <p className="mt-4 rounded-2xl border border-dashed border-[var(--card-border)] py-10 text-center text-sm text-[var(--muted-foreground)]">还没有匹配的 Cue。</p>;
  return <div className="mt-4 space-y-5 pb-6">{grouped.map((subject) => <section key={subject.subject} className="rounded-3xl border border-[var(--card-border)] p-5"><h4 className="flex items-center gap-2 text-lg font-semibold"><span className="material-icons-round text-xl text-[var(--brand)]">school</span>{subject.subject}</h4>{subject.units.map((unitGroup) => <div key={unitGroup.unit} className="ml-2 mt-4 border-l-2 border-[var(--card-border)] pl-5"><h5 className="font-semibold text-[var(--brand)]">{unitGroup.unit}</h5>{unitGroup.subsections.map((subsectionGroup) => <div key={subsectionGroup.subsection || unitGroup.unit} className="mt-4"><div className="mt-2 grid gap-3 xl:grid-cols-2">{subsectionGroup.cues.map((cue) => { const reviewCount = reviewCounts.get(cue.id) ?? 0; return <article key={cue.id} className="rounded-2xl bg-black/[.035] p-4 dark:bg-white/[.06]"><div className="flex items-start gap-3"><div className="min-w-0 flex-1"><div className="font-semibold"><span className="mr-1 text-xs text-[var(--muted-foreground)]">[{cue.type.toUpperCase()}]</span><LatexRenderer content={cue.prompt} /></div>{cue.subtitle && <div className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]"><LatexRenderer content={cue.subtitle} /></div>}{cue.answer && <div className="mt-2 text-sm leading-6"><span className="mr-1 font-medium">参考：</span><LatexRenderer content={cue.answer} /></div>}{cue.markingPoints.length > 0 && <div className="mt-2 space-y-1 text-xs leading-5 text-[var(--muted-foreground)]"><span className="font-medium">Marking points：</span>{cue.markingPoints.map((point) => <div key={point} className="pl-2"><LatexRenderer content={point} /></div>)}</div>}<div className="mt-3 flex flex-wrap items-center gap-2 text-xs"><span className={`rounded-full px-2 py-1 font-bold ${cue.status === 'stable' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200' : cue.status === 'partial' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-200' : cue.status === 'unclear' ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-200' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200'}`}>{cue.status ? statusMark(cue.status) : '未验证'}</span><span className="text-[var(--muted-foreground)]">{CUE_DISPLAY_OPTIONS.find((item) => item.value === (cue.display ?? 'standard'))?.label}</span><span className="text-[var(--muted-foreground)]">检索 {reviewCount} 次</span><span className="text-[var(--muted-foreground)]">连续通过 {cue.streak}</span><span className="text-[var(--muted-foreground)]">间隔 {cue.intervalDays} 天</span>{cue.nextReviewDate && <span className="text-[var(--muted-foreground)]">下次 {cue.nextReviewDate}</span>}</div></div><button type="button" onClick={() => onDelete(cue)} aria-label={`删除 ${cue.prompt}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[var(--muted-foreground)] hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"><span className="material-icons-round text-lg">delete</span></button></div></article>; })}</div></div>)}</div>)}</section>)}</div>;
}

function CueBatchImportDialog({ subjectName, unit, knownUnits, onClose, onImport }: { subjectName: string; unit: string; knownUnits: string[]; onClose: () => void; onImport: (items: CueBatchImportItem[]) => void }) {
  const subsection = '';
  const [mode, setMode] = useState<'json' | 'ai'>('json');
  const [source, setSource] = useState('');
  const [preview, setPreview] = useState<CueBatchImportItem[] | null>(null);
  const [unitMappings, setUnitMappings] = useState<Record<string, string>>({});
  const [unitsConfirmed, setUnitsConfirmed] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const normalizeUnit = (value: string) => value.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const preparePreview = (items: CueBatchImportItem[], nextMessage: string) => {
    const mappings = Object.fromEntries([...new Set(items.map((item) => item.unit))].map((sourceUnit) => [
      sourceUnit,
      knownUnits.find((knownUnit) => normalizeUnit(knownUnit) === normalizeUnit(sourceUnit)) ?? sourceUnit,
    ]));
    setPreview(items);
    setUnitMappings(mappings);
    setUnitsConfirmed(false);
    setMessage(nextMessage);
  };
  const parseSource = (value: string) => {
    try { const parsed = parseCueBatchImport(JSON.parse(value)); preparePreview(parsed.cues, `识别到 ${parsed.cues.length} 条 Cue，请先核对单元。`); }
    catch (error) { setPreview(null); setMessage(error instanceof Error ? error.message : 'Cue 配置无法读取。'); }
  };
  const aiPrompt = `请根据我提供的课堂笔记、教材内容或题目生成主动检索 Cue。只输出严格 JSON，不要 Markdown。JSON 格式示例：${JSON.stringify(cueBatchImportTemplate())}。
字段用途必须严格遵守：
- unit：这条 Cue 所属的大单元。根据输入中的标题或上下文填写；不清楚时写“待分类”，不要猜测，也不要输出小章节。
- prompt：学习时最大字号显示的题目大标题。每条只问一个可闭卷检索的问题。
- subtitle：显示在大标题下方的小字，只写背景、已知条件、范围、作答限制或必要提示；不得泄露答案。没有需要时省略。
- answer：揭示后显示的完整参考答案。可以省略，但不要把答案塞进 subtitle。
- type：题型。general=通用检索，definition=定义，state=陈述要点，explain=解释因果，calculate=计算，formula=公式回忆，derivation=推导，proof=证明，compare=比较异同，process=过程或步骤，application=情境应用，diagram=图像或示意图，multiple-choice=类型选择题。
- display：显示预设。standard=普通问答，headline=大标题加小字说明，formula=公式重点，steps=步骤或推导，comparison=对比，scenario=情境题，definition-card=Definition 翻卡，multiple-choice=选项界面。Definition 优先使用 definition-card，选择题必须使用 multiple-choice。
- choices / correctChoice：只用于选择题；choices 写 2–6 个选项，correctChoice 是从 0 开始的正确选项序号。
- markingPoints：独立字符串数组，只写判分必需的关键词、公式、关系、限定条件或完整 reasoning chain，不要重复 prompt。
数学与科学符号使用 LaTeX：行内写 \\( ... \\)，独立公式写 \\[ ... \\]；不要使用无法解析的 HTML 实体。不要编造原文没有的知识。学科统一为：${subjectName}。`;
  const copyPrompt = async () => { await navigator.clipboard.writeText(aiPrompt); setMessage('AI 导入提示词已复制。'); };
  const runAi = async () => {
    if (!source.trim()) return;
    setBusy(true); setMessage('AI 正在整理 Cue…');
    try {
      const response = await fetch('/api/llm-proxy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feature: 'chat', stream: false, temperature: 0.1, _no_thinking: true, messages: [{ role: 'system', content: aiPrompt }, { role: 'user', content: source.slice(0, 40_000) }] }) });
      const parsed = parseCueBatchImport(parseAiJson(await readAiResponseContent(response)));
      preparePreview(parsed.cues, `AI 整理出 ${parsed.cues.length} 条 Cue，请先核对单元。`);
    } catch (error) { setPreview(null); setMessage(error instanceof Error ? error.message : 'AI 导入失败。'); }
    finally { setBusy(false); }
  };
  if (preview && !unitsConfirmed) {
    const importedUnits = [...new Set(preview.map((item) => item.unit))];
    return <div className="fixed inset-0 z-[80] grid place-items-center bg-black/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="cue-unit-review-title"><div className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><h2 id="cue-unit-review-title" className="text-xl font-semibold">核对并合并单元</h2><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">AI 的单元可能识别错误。请为每个返回单元选择实际归属；同名的全部 Cue 会一起修改。</p></div><button type="button" onClick={onClose} aria-label="关闭" className="grid h-10 w-10 place-items-center rounded-full hover:bg-black/5"><span className="material-icons-round">close</span></button></div><div className="mt-5 space-y-3">{importedUnits.map((sourceUnit) => { const isKnown = knownUnits.some((knownUnit) => normalizeUnit(knownUnit) === normalizeUnit(sourceUnit)); return <div key={sourceUnit} className="rounded-2xl border border-[var(--card-border)] p-4"><p className="text-xs text-[var(--muted-foreground)]">AI 返回</p><p className="mt-1 font-semibold">{sourceUnit}</p><label className="mt-3 block text-sm font-medium">实际导入到<select value={unitMappings[sourceUnit] ?? sourceUnit} onChange={(event) => setUnitMappings((current) => ({ ...current, [sourceUnit]: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5">{!isKnown && <option value={sourceUnit}>保留并新建“{sourceUnit}”</option>}{knownUnits.map((knownUnit) => <option key={knownUnit} value={knownUnit}>{knownUnit}</option>)}</select></label></div>; })}</div><div className="mt-5 flex flex-wrap justify-end gap-3"><button type="button" onClick={() => { setPreview(null); setUnitsConfirmed(false); }} className="rounded-full border border-[var(--card-border)] px-5 py-2.5 text-sm">返回修改内容</button><button type="button" onClick={() => { setPreview((current) => current ? applyCueUnitMappings(current, unitMappings) : current); setUnitsConfirmed(true); setMessage(`单元已核对，准备导入 ${preview.length} 条 Cue。`); }} className="rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white dark:text-[#202124]">确认单元并预览 Cue</button></div></div></div>;
  }
  if (mode === 'json' || mode === 'ai') return <div className="fixed inset-0 z-[80] grid place-items-center bg-black/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="cue-import-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><h2 id="cue-import-title" className="text-xl font-semibold">批量导入 Cue</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">学科：{subjectName}。每条 Cue 在输入或 JSON 中单独填写大单元，不使用工作台当前所选大单元。</p></div><button type="button" onClick={onClose} aria-label="关闭" className="grid h-10 w-10 place-items-center rounded-full hover:bg-black/5"><span className="material-icons-round">close</span></button></div><div className="mt-4 inline-flex rounded-full bg-black/5 p-1 dark:bg-white/10"><button type="button" onClick={() => { setMode('json'); setPreview(null); }} className={`rounded-full px-4 py-2 text-sm ${mode === 'json' ? 'bg-[var(--card)] font-semibold shadow-sm' : ''}`}>JSON 批量导入</button><button type="button" onClick={() => { setMode('ai'); setPreview(null); }} className={`rounded-full px-4 py-2 text-sm ${mode === 'ai' ? 'bg-[var(--card)] font-semibold shadow-sm' : ''}`}>AI 整理导入</button></div><div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50/70 p-3 text-xs leading-5 text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">{mode === 'ai' ? '请在内容里写明单元，例如“Unit 2 Kinematics”后列出相关知识。AI 会把 unit 写入每一条 Cue；未写清的会标记为“待分类”，不会擅自猜测。' : 'JSON 中每条 Cue 都必须包含 unit 字段，因此一次可以导入多个大单元。'}</div><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={async () => { await navigator.clipboard.writeText(JSON.stringify(cueBatchImportTemplate(), null, 2)); setMessage('Cue JSON 格式已复制。'); }} className="rounded-full border border-[var(--card-border)] px-4 py-2 text-sm font-medium">复制 JSON 格式</button><button type="button" onClick={copyPrompt} className="rounded-full border border-[var(--card-border)] px-4 py-2 text-sm font-medium">复制 AI 提示词</button>{mode === 'json' && <label className="cursor-pointer rounded-full border border-[var(--card-border)] px-4 py-2 text-sm font-medium">选择 JSON<input type="file" accept="application/json,.json" className="hidden" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; const text = await file.text(); setSource(text); parseSource(text); }} /></label>}</div><textarea value={source} onChange={(event) => setSource(event.target.value)} rows={10} placeholder={mode === 'ai' ? '例如：Unit 2 Kinematics\n- acceleration 的定义\n- SUVAT 公式的适用条件\n\nUnit 3 Forces\n- terminal velocity 的解释' : '粘贴包含 unit 的 cues JSON…'} className="mt-4 w-full rounded-2xl border border-[var(--card-border)] bg-[var(--background)] p-4 font-mono text-xs leading-5" /><button type="button" disabled={busy || !source.trim()} onClick={() => mode === 'json' ? parseSource(source) : runAi()} className="mt-3 rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:text-[#202124]">{busy ? '处理中…' : mode === 'json' ? '检查并预览' : 'AI 按单元整理并预览'}</button>{message && <p role="status" className="mt-3 rounded-xl bg-black/5 px-3 py-2 text-sm dark:bg-white/10">{message}</p>}{preview && <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">{preview.map((cue, index) => <div key={`${cue.unit}-${cue.prompt}-${index}`} className="rounded-xl border border-[var(--card-border)] p-3"><p className="text-xs font-semibold text-[var(--brand)]">{cue.unit} · [{cue.type.toUpperCase()}]</p><p className="mt-1 text-sm font-medium">{cue.prompt}</p>{cue.markingPoints.length > 0 && <p className="mt-1 text-xs text-[var(--muted-foreground)]">{cue.markingPoints.join(' · ')}</p>}</div>)}</div>}<div className="mt-5 flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-full border border-[var(--card-border)] px-5 py-2.5 text-sm">取消</button><button type="button" disabled={!preview} onClick={() => preview && onImport(preview)} className="rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40 dark:text-[#202124]">导入 {preview?.length ?? 0} 条 Cue</button></div></div></div>;
  return <div className="fixed inset-0 z-[80] grid place-items-center bg-black/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="cue-import-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><h2 id="cue-import-title" className="text-xl font-semibold">批量导入 Cue</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">共同分类：{subjectName} → {unit} → {subsection}</p></div><button type="button" onClick={onClose} aria-label="关闭" className="grid h-10 w-10 place-items-center rounded-full hover:bg-black/5"><span className="material-icons-round">close</span></button></div><div className="mt-4 inline-flex rounded-full bg-black/5 p-1 dark:bg-white/10"><button type="button" onClick={() => setMode('json')} className={`rounded-full px-4 py-2 text-sm ${mode === 'json' ? 'bg-[var(--card)] font-semibold shadow-sm' : ''}`}>JSON 批量导入</button><button type="button" onClick={() => setMode('ai')} className={`rounded-full px-4 py-2 text-sm ${mode === 'ai' ? 'bg-[var(--card)] font-semibold shadow-sm' : ''}`}>AI 整理导入</button></div><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={async () => { await navigator.clipboard.writeText(JSON.stringify(cueBatchImportTemplate(), null, 2)); setMessage('Cue JSON 格式已复制。'); }} className="rounded-full border border-[var(--card-border)] px-4 py-2 text-sm font-medium">复制 JSON 格式</button><button type="button" onClick={copyPrompt} className="rounded-full border border-[var(--card-border)] px-4 py-2 text-sm font-medium">复制 AI 提示词</button>{mode === 'json' && <label className="cursor-pointer rounded-full border border-[var(--card-border)] px-4 py-2 text-sm font-medium">选择 JSON<input type="file" accept="application/json,.json" className="hidden" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; const text = await file.text(); setSource(text); parseSource(text); }} /></label>}</div><textarea value={source} onChange={(event) => setSource(event.target.value)} rows={10} placeholder={mode === 'ai' ? '粘贴课本内容、笔记或现有问题，AI 会整理成 Cue…' : '粘贴 cues JSON…'} className="mt-4 w-full rounded-2xl border border-[var(--card-border)] bg-[var(--background)] p-4 font-mono text-xs leading-5" /><button type="button" disabled={busy || !source.trim()} onClick={() => mode === 'json' ? parseSource(source) : runAi()} className="mt-3 rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:text-[#202124]">{busy ? '处理中…' : mode === 'json' ? '检查并预览' : 'AI 整理并预览'}</button>{message && <p className="mt-3 rounded-xl bg-black/5 px-3 py-2 text-sm dark:bg-white/10">{message}</p>}{preview && <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">{preview.map((cue, index) => <div key={`${cue.prompt}-${index}`} className="rounded-xl border border-[var(--card-border)] p-3"><p className="text-xs font-semibold text-[var(--brand)]">[{cue.type.toUpperCase()}]</p><p className="mt-1 text-sm font-medium">{cue.prompt}</p>{cue.markingPoints.length > 0 && <p className="mt-1 text-xs text-[var(--muted-foreground)]">{cue.markingPoints.join(' · ')}</p>}</div>)}</div>}<div className="mt-5 flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-full border border-[var(--card-border)] px-5 py-2.5 text-sm">取消</button><button type="button" disabled={!preview} onClick={() => preview && onImport(preview)} className="rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40 dark:text-[#202124]">导入 {preview?.length ?? 0} 条 Cue</button></div></div></div>;
}

function CueEnrichmentDialog({ cues, onClose, onApply }: { cues: StudyCue[]; onClose: () => void; onApply: (updates: CueEnrichmentItem[]) => void }) {
  const [notes, setNotes] = useState('');
  const [preview, setPreview] = useState<CueEnrichmentItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const cueData = cues.map((cue) => ({ id: cue.id, unit: cue.unit, prompt: cue.prompt, subtitle: cue.subtitle, answer: cue.answer, type: cue.type, display: cue.display, choices: cue.choices, correctChoice: cue.correctChoice, markingPoints: cue.markingPoints }));
  const prompt = `请补充现有 Cue，而不是创建新 Cue。只输出严格 JSON：{"updates":[{"id":"必须原样使用现有 id","subtitle":"可选背景小字","answer":"可选完整答案","type":"可选题型","display":"可选显示预设","choices":["选择题选项"],"correctChoice":0,"markingPoints":["必要得分点"]}]}。只返回确实需要补充或修正的字段，不得改 id、unit 或 prompt，不得返回不存在的 id。Definition 建议 display=definition-card；类型选择题使用 type=multiple-choice、display=multiple-choice、2–6 个 choices，correctChoice 从 0 开始。数学符号使用 LaTeX。现有 Cue：${JSON.stringify(cueData)}`;
  const run = async () => {
    setBusy(true); setMessage('AI 正在检查现有 Cue…'); setPreview(null);
    try {
      const response = await fetch('/api/llm-proxy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feature: 'chat', stream: false, temperature: 0.1, _no_thinking: true, messages: [{ role: 'system', content: prompt }, { role: 'user', content: notes.trim() || '请检查并补充这些 Cue 的说明、答案、题型、显示预设和 marking points。' }] }) });
      const updates = parseCueEnrichments(parseAiJson(await readAiResponseContent(response)));
      const ids = new Set(cues.map((cue) => cue.id));
      if (updates.some((update) => !ids.has(update.id))) throw new Error('AI 返回了不属于当前范围的 Cue id，请重新生成。');
      setPreview(updates); setMessage(`识别到 ${updates.length} 条增量补充；不会覆盖未返回的字段。`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'AI 补充失败。'); }
    finally { setBusy(false); }
  };
  return <div className="fixed inset-0 z-[85] grid place-items-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="cue-enrichment-title"><div className="max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><h2 id="cue-enrichment-title" className="text-xl font-semibold">AI 补充现有 Cue</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">当前范围 {cues.length} 条。AI 只能按 id 增量补充，不会创建重复 Cue，也不会修改学科、单元和题目标题。</p></div><button type="button" onClick={onClose} aria-label="关闭" className="grid h-10 w-10 place-items-center rounded-full hover:bg-black/5"><span className="material-icons-round">close</span></button></div><textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={6} placeholder="可选：粘贴新的课堂补充、老师强调的判分点，或写明希望补哪些内容。留空则让 AI 检查现有数据。" className="mt-5 w-full rounded-2xl border border-[var(--card-border)] bg-[var(--background)] p-4 text-sm leading-6" /><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={async () => { await navigator.clipboard.writeText(prompt); setMessage('补充提示词与当前 Cue 数据已复制。'); }} className="rounded-full border border-[var(--card-border)] px-4 py-2 text-sm font-medium">复制补充提示词和数据</button><button type="button" disabled={busy || !cues.length} onClick={run} className="rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 dark:text-[#202124]">{busy ? '检查中…' : '生成增量补充'}</button></div>{message && <p role="status" className="mt-3 rounded-xl bg-black/5 px-3 py-2 text-sm dark:bg-white/10">{message}</p>}{preview && <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">{preview.map((update) => <article key={update.id} className="rounded-xl border border-[var(--card-border)] p-3"><p className="text-xs font-semibold text-[var(--brand)]">{cues.find((cue) => cue.id === update.id)?.prompt}</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">将补充：{Object.keys(update).filter((key) => key !== 'id').join('、')}</p></article>)}</div>}<div className="mt-5 flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-full border border-[var(--card-border)] px-5 py-2.5 text-sm">取消</button><button type="button" disabled={!preview} onClick={() => preview && onApply(preview)} className="rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40 dark:text-[#202124]">应用 {preview?.length ?? 0} 条补充</button></div></div></div>;
}

function CueManagerDialog({ cues, reviews, catalog, showMastered, onClose, onChange }: { cues: StudyCue[]; reviews: CueReview[]; catalog: LearningCatalogSubject[]; showMastered: boolean; onClose: () => void; onChange: (cues: StudyCue[], catalog?: LearningCatalogSubject[]) => void }) {
  const [subjectName, setSubjectName] = useState('');
  const [unit, setUnit] = useState('');
  const [prompt, setPrompt] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [answer, setAnswer] = useState('');
  const [type, setType] = useState<CueType>('general');
  const [display, setDisplay] = useState<CueDisplayPreset>('standard');
  const [choices, setChoices] = useState('');
  const [correctChoice, setCorrectChoice] = useState(0);
  const [markingPoints, setMarkingPoints] = useState('');
  const [query, setQuery] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [filterUnit, setFilterUnit] = useState('');
  const [batchImport, setBatchImport] = useState(false);
  const [enrichExisting, setEnrichExisting] = useState(false);
  const selectedSubjectConfig = catalog.find((item) => item.name === subjectName);
  const enrichmentCues = cues.filter((cue) => cue.subjectName === subjectName && (!unit || cue.unit === unit));
  const filterSubjects = [...new Set(cues.map((cue) => cue.subjectName))];
  const filterUnits = [...new Set(cues.filter((cue) => !filterSubject || cue.subjectName === filterSubject).map((cue) => cue.unit))];
  const filtered = cues.filter((cue) => (showMastered || cue.status !== 'stable') && (!filterSubject || cue.subjectName === filterSubject) && (!filterUnit || cue.unit === filterUnit) && `${cue.subjectName} ${cue.unit} ${cue.subsection} ${cue.prompt} ${cue.subtitle ?? ''} ${cue.answer ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()));
  const makeCue = (item: CueBatchImportItem, now: string): StudyCue => ({
    id: taskId(), subjectId: selectedSubjectConfig?.id ?? subjectIdFromName(subjectName), subjectName, unit: item.unit, subsection: '',
    prompt: item.prompt, ...(item.subtitle ? { subtitle: item.subtitle } : {}), ...(item.answer ? { answer: item.answer } : {}), type: item.type, display: item.display, ...(item.choices ? { choices: item.choices, correctChoice: item.correctChoice } : {}), markingPoints: item.markingPoints,
    intervalDays: 0, easeFactor: 2.5, streak: 0, nextReviewDate: addCalendarDays(dateKey(new Date()), 1), createdAt: now, updatedAt: now,
  });
  const createCue = (event: React.FormEvent) => {
    event.preventDefault();
    if (!subjectName || !unit || !prompt.trim()) return;
    const cueChoices = choices.split('\n').map((value) => value.trim()).filter(Boolean).slice(0, 6);
    if (type === 'multiple-choice' && (cueChoices.length < 2 || correctChoice >= cueChoices.length)) return;
    const item: CueBatchImportItem = { unit, prompt: prompt.trim().slice(0, 500), ...(subtitle.trim() ? { subtitle: subtitle.trim().slice(0, 500) } : {}), ...(answer.trim() ? { answer: answer.trim().slice(0, 2000) } : {}), type, display, ...(type === 'multiple-choice' ? { choices: cueChoices, correctChoice } : {}), markingPoints: markingPoints.split('\n').map((value) => value.trim()).filter(Boolean).slice(0, 12) };
    onChange([...cues, makeCue(item, new Date().toISOString())]);
    setPrompt(''); setSubtitle(''); setAnswer(''); setChoices(''); setCorrectChoice(0); setMarkingPoints('');
  };
  const importBatch = (items: CueBatchImportItem[]) => {
    const now = new Date().toISOString();
    const normalizeUnit = (value: string) => value.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    const existingUnitKeys = new Set((selectedSubjectConfig?.units ?? []).map((item) => normalizeUnit(item.name)));
    const newUnitNames = [...new Set(items.map((item) => item.unit.trim()).filter((name) => name && !existingUnitKeys.has(normalizeUnit(name))))];
    const nextCatalog = newUnitNames.length && selectedSubjectConfig ? catalog.map((subject) => subject.id === selectedSubjectConfig.id ? {
      ...subject,
      units: [...subject.units, ...newUnitNames.map((name) => ({ name, subsections: [] }))],
    } : subject) : catalog;
    onChange([...cues, ...items.map((item) => makeCue(item, now))], nextCatalog);
    setBatchImport(false);
  };
  return <div className="fixed inset-0 z-[70] grid place-items-center bg-black/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="cue-manager-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="grid h-[94dvh] min-h-0 w-full max-w-[1500px] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-3xl border border-[var(--card-border)] bg-[var(--card)] shadow-2xl xl:grid-cols-[400px_minmax(0,1fr)] xl:grid-rows-1">
      <form onSubmit={createCue} className="max-h-[45dvh] min-h-0 overflow-y-auto overscroll-contain border-b border-[var(--card-border)] p-6 xl:max-h-none xl:border-b-0 xl:border-r">
        <div className="flex items-center justify-between"><div><h2 id="cue-manager-title" className="text-xl font-semibold">Cue 学习工作台</h2><p className="mt-1 text-xs text-[var(--muted-foreground)]">单条添加时选择大单元；批量 / AI 导入只需先选择学科，每条 Cue 可使用不同大单元。</p></div><button type="button" onClick={onClose} aria-label="关闭" className="grid h-10 w-10 place-items-center rounded-full hover:bg-black/5"><span className="material-icons-round">close</span></button></div>
        <div className="mt-5 space-y-3"><label className="block text-sm font-medium">学科<select required value={subjectName} onChange={(event) => { setSubjectName(event.target.value); setUnit(''); }} className="mt-1.5 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5"><option value="">请选择</option>{catalog.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></label><label className="block text-sm font-medium">大单元<select required value={unit} disabled={!selectedSubjectConfig} onChange={(event) => setUnit(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 disabled:opacity-50"><option value="">请选择</option>{selectedSubjectConfig?.units.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label><div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-medium">Cue 类型<select value={type} onChange={(event) => setType(event.target.value as CueType)} className="mt-1.5 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5">{CUE_TYPE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label className="block text-sm font-medium">显示预设<select value={display} onChange={(event) => setDisplay(event.target.value as CueDisplayPreset)} className="mt-1.5 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5">{CUE_DISPLAY_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></div><label className="block text-sm font-medium">题目大标题<input required value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={500} className="mt-1.5 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5" /></label><label className="block text-sm font-medium">题目说明小字（可选）<textarea value={subtitle} onChange={(event) => setSubtitle(event.target.value)} rows={2} placeholder="背景、已知条件或作答限制；不要提前泄露答案" className="mt-1.5 w-full resize-none rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5" /></label><label className="block text-sm font-medium">参考答案（可选）<textarea value={answer} onChange={(event) => setAnswer(event.target.value)} rows={3} className="mt-1.5 w-full resize-none rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5" /></label><label className="block text-sm font-medium">Marking points（每行一个）<textarea value={markingPoints} onChange={(event) => setMarkingPoints(event.target.value)} rows={3} className="mt-1.5 w-full resize-none rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5" /></label><p className="text-xs leading-5 text-[var(--muted-foreground)]">所有文字字段均支持 LaTeX：<code>\(...\)</code> 行内公式，<code>\[...\]</code> 独立公式。</p></div>
        {type === 'multiple-choice' && <div className="mt-3 rounded-2xl border border-[var(--card-border)] p-3"><label className="block text-sm font-medium">选择题选项（每行一个）<textarea value={choices} onChange={(event) => setChoices(event.target.value)} rows={4} className="mt-1.5 w-full resize-none rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5" /></label><label className="mt-3 block text-sm font-medium">正确选项<select value={correctChoice} onChange={(event) => setCorrectChoice(Number(event.target.value))} className="mt-1.5 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5">{choices.split('\n').map((item) => item.trim()).filter(Boolean).slice(0, 6).map((item, itemIndex) => <option key={`${itemIndex}-${item}`} value={itemIndex}>{itemIndex + 1} · {item}</option>)}</select></label></div>}
        <div className="mt-5 flex flex-wrap gap-2"><button type="submit" disabled={!subjectName || !unit || type === 'multiple-choice' && choices.split('\n').filter((item) => item.trim()).length < 2} className="rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40 dark:text-[#202124]">添加 Cue</button><button type="button" disabled={!subjectName} onClick={() => setBatchImport(true)} className="rounded-full border border-[var(--card-border)] px-4 py-2.5 text-sm font-semibold disabled:opacity-40"><span className="material-icons-round mr-1 align-middle text-base">playlist_add</span>批量 / AI 导入</button><button type="button" disabled={!enrichmentCues.length} onClick={() => setEnrichExisting(true)} className="rounded-full border border-violet-300 px-4 py-2.5 text-sm font-semibold text-violet-700 disabled:opacity-40 dark:border-violet-800 dark:text-violet-200"><span className="material-icons-round mr-1 align-middle text-base">auto_fix_high</span>AI 补充现有 Cue · {enrichmentCues.length}</button></div>
      </form>
      <section className="min-h-0 overflow-y-auto p-6"><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[['全部', cues.length], ['√', cues.filter((cue) => cue.status === 'stable').length], ['△', cues.filter((cue) => cue.status === 'partial').length], ['○', cues.filter((cue) => cue.status === 'unclear').length]].map(([label, value]) => <div key={label} className="rounded-2xl bg-black/[.035] p-3 text-center dark:bg-white/[.06]"><p className="text-xs text-[var(--muted-foreground)]">{label}</p><strong className="mt-1 block text-xl">{value}</strong></div>)}</div><div className="mt-4 grid gap-2 sm:grid-cols-2"><select value={filterSubject} onChange={(event) => { setFilterSubject(event.target.value); setFilterUnit(''); }} aria-label="按学科筛选" className="rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm"><option value="">全部学科</option>{filterSubjects.map((value) => <option key={value}>{value}</option>)}</select><select value={filterUnit} onChange={(event) => setFilterUnit(event.target.value)} aria-label="按大单元筛选" className="rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm"><option value="">全部大单元</option>{filterUnits.map((value) => <option key={value}>{value}</option>)}</select></div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="快速搜索 Cue、答案、学科或单元…" className="mt-2 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm" /><CueHierarchy cues={filtered} reviews={reviews} onDelete={(cue) => onChange(cues.filter((item) => item.id !== cue.id))} /></section>
    </div>
    {batchImport && <CueBatchImportDialog subjectName={subjectName} unit={unit} knownUnits={selectedSubjectConfig?.units.map((item) => item.name) ?? []} onClose={() => setBatchImport(false)} onImport={importBatch} />}
    {enrichExisting && <CueEnrichmentDialog cues={enrichmentCues} onClose={() => setEnrichExisting(false)} onApply={(updates) => { onChange(applyCueEnrichments(cues, updates, new Date().toISOString())); setEnrichExisting(false); }} />}
  </div>;
}

function ManualCatalogDetailEditor({ subjects, onChange }: { subjects: LearningCatalogSubject[]; onChange: (subjects: LearningCatalogSubject[]) => void }) {
  const [selectedId, setSelectedId] = useState(subjects[0]?.id ?? '');
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newUnitName, setNewUnitName] = useState('');
  const selected = subjects.find((subject) => subject.id === selectedId) ?? subjects[0];
  const updateSelected = (updater: (subject: LearningCatalogSubject) => LearningCatalogSubject) => {
    if (!selected) return;
    onChange(subjects.map((subject) => subject.id === selected.id ? updater(subject) : subject));
  };
  const addSubject = () => {
    const names = newSubjectName.split(/[,，;；]/u).map((name) => name.trim()).filter(Boolean);
    if (!names.length) return;
    const additions = names.map((name) => ({ id: `${subjectIdFromName(name)}-${taskId().slice(-6)}`, name: name.slice(0, 80), units: [], materialProgress: {} }));
    onChange([...subjects, ...additions]);
    setSelectedId(additions[additions.length - 1].id); setNewSubjectName('');
  };
  const removeSubject = () => {
    if (!selected || !window.confirm(`删除学科「${selected.name}」及其单元配置吗？学习记录和 Cue 不会被删除。`)) return;
    const next = subjects.filter((subject) => subject.id !== selected.id);
    onChange(next); setSelectedId(next[0]?.id ?? '');
  };
  const addUnit = () => {
    const name = newUnitName.trim();
    if (!selected || !name) return;
    updateSelected((subject) => ({ ...subject, units: [...subject.units, { name: name.slice(0, 120), subsections: [] }] }));
    setNewUnitName('');
  };
  const updateUnit = (index: number, updater: (unit: LearningCatalogSubject['units'][number]) => LearningCatalogSubject['units'][number]) => updateSelected((subject) => ({ ...subject, units: subject.units.map((unit, unitIndex) => unitIndex === index ? updater(unit) : unit) }));
  return <div className="mt-5 grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
    <aside className="self-start rounded-2xl border border-[var(--card-border)] p-3"><p className="px-2 text-xs font-semibold text-[var(--muted-foreground)]">学科</p><div className="mt-2 max-h-72 space-y-1 overflow-y-auto">{subjects.map((subject) => <button key={subject.id} type="button" onClick={() => setSelectedId(subject.id)} className={`w-full rounded-xl px-3 py-2 text-left text-sm ${selected?.id === subject.id ? 'bg-blue-50 font-semibold text-[var(--brand)] dark:bg-blue-950/30' : 'hover:bg-black/5'}`}>{subject.name}</button>)}{!subjects.length && <p className="px-2 py-5 text-center text-xs text-[var(--muted-foreground)]">还没有学科</p>}</div><div className="mt-3 flex gap-2"><input value={newSubjectName} onChange={(event) => setNewSubjectName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addSubject(); } }} placeholder="新增学科；多个用逗号" maxLength={500} className="min-w-0 flex-1 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-2.5 py-2 text-xs" /><button type="button" onClick={addSubject} aria-label="添加学科" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--brand)] text-white dark:text-[#202124]"><span className="material-icons-round text-lg">add</span></button></div></aside>
    {selected ? <section className="space-y-4">
      <div className="rounded-2xl border border-[var(--card-border)] p-4">
        <div className="flex items-end gap-3"><label className="min-w-0 flex-1 text-xs font-medium">学科名称<input value={selected.name} onChange={(event) => updateSelected((subject) => ({ ...subject, name: event.target.value.slice(0, 80) }))} className="mt-1.5 w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm" /></label><button type="button" onClick={removeSubject} className="rounded-full px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30">删除学科</button></div>
        <h3 className="mt-5 text-sm font-semibold">资料最新位置</h3><p className="mt-1 text-xs text-[var(--muted-foreground)]">自由填写当前位置，例如 1.2、P18、Q1–8；清空输入框即可移除。</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">{LEARNING_MATERIALS.map((material) => <label key={material.code} className="text-xs font-medium"><span className="font-mono">{material.code}</span> · {material.label}<input value={selected.materialProgress[material.code] ?? ''} onChange={(event) => updateSelected((subject) => { const materialProgress = { ...subject.materialProgress }; const value = event.target.value.slice(0, 200); if (value) materialProgress[material.code] = value; else delete materialProgress[material.code]; return { ...subject, materialProgress }; })} placeholder="尚未记录" className="mt-1.5 w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm" /></label>)}</div>
      </div>
      <div className="space-y-3">{selected.units.map((unit, unitIndex) => <article key={`${selected.id}-${unitIndex}`} className="rounded-2xl border border-[var(--card-border)] p-4"><div className="flex items-center gap-2"><input value={unit.name} onChange={(event) => updateUnit(unitIndex, (current) => ({ ...current, name: event.target.value.slice(0, 120) }))} aria-label={`第 ${unitIndex + 1} 个大单元名称`} className="min-w-0 flex-1 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm font-semibold" /><button type="button" onClick={() => { if (window.confirm(`删除大单元「${unit.name}」吗？`)) updateSelected((subject) => ({ ...subject, units: subject.units.filter((_, index) => index !== unitIndex) })); }} aria-label={`删除大单元 ${unit.name}`} className="grid h-9 w-9 place-items-center rounded-lg text-rose-600 hover:bg-rose-50"><span className="material-icons-round text-lg">delete</span></button></div>{unit.subsections.length > 0 && <p className="mt-2 text-xs text-[var(--muted-foreground)]">已保留 {unit.subsections.length} 个旧小章节数据，无需继续维护。</p>}</article>)}<div className="flex gap-2 rounded-2xl border border-dashed border-[var(--card-border)] p-3"><input value={newUnitName} onChange={(event) => setNewUnitName(event.target.value)} placeholder="新增大单元" maxLength={120} className="min-w-0 flex-1 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm" /><button type="button" onClick={addUnit} className="rounded-full bg-[var(--brand)] px-4 py-2 text-xs font-semibold text-white dark:text-[#202124]">添加大单元</button></div></div>
    </section> : <div className="rounded-2xl border border-dashed border-[var(--card-border)] p-10 text-center text-sm text-[var(--muted-foreground)]">请先在左侧新增学科。</div>}
  </div>;
}

function QuickUnitOutlineEditor({ subjects, onChange }: { subjects: LearningCatalogSubject[]; onChange: (subjects: LearningCatalogSubject[]) => void }) {
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? '');
  const [outline, setOutline] = useState('');
  const [message, setMessage] = useState('');
  const apply = () => {
    const subject = subjects.find((item) => item.id === subjectId);
    if (!subject || !outline.trim()) return;
    try {
      const units = parseLearningUnitOutline(outline);
      onChange(mergeLearningCatalog(subjects, [{ ...subject, units, materialProgress: {} }]));
      setOutline(''); setMessage(`已合并 ${units.length} 个大单元；重复名称已自动合并。`);
    } catch (error) { setMessage(error instanceof Error ? error.message : '批量内容无法读取。'); }
  };
  return <section className="mt-4 rounded-2xl border border-dashed border-[var(--card-border)] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-semibold">快速批量添加大单元</h3><p className="mt-1 text-xs text-[var(--muted-foreground)]">每行填写一个大单元；只合并新增内容，不覆盖已有内容。</p></div><select value={subjectId} onChange={(event) => setSubjectId(event.target.value)} aria-label="批量添加目标学科" className="rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm"><option value="">选择学科</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></div><textarea value={outline} onChange={(event) => setOutline(event.target.value)} rows={4} placeholder={'Mechanics\nWaves\nElectricity'} className="mt-3 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 font-mono text-xs leading-5" /><div className="mt-3 flex flex-wrap items-center justify-between gap-3">{message ? <p role="status" className="text-xs text-[var(--muted-foreground)]">{message}</p> : <span />}<button type="button" disabled={!subjectId || !outline.trim()} onClick={apply} className="rounded-full bg-[var(--brand)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-40 dark:text-[#202124]">批量合并大单元</button></div></section>;
}

function ManualCatalogEditor({ subjects, onChange }: { subjects: LearningCatalogSubject[]; onChange: (subjects: LearningCatalogSubject[]) => void }) {
  return <><ManualCatalogDetailEditor subjects={subjects} onChange={onChange} /><QuickUnitOutlineEditor subjects={subjects} onChange={onChange} /></>;
}

function LearningCatalogDialog({ current, onClose, onApply }: { current: LearningCatalogSubject[]; onClose: () => void; onApply: (subjects: LearningCatalogSubject[]) => void }) {
  const [mode, setMode] = useState<'manual' | 'json' | 'ai'>('manual');
  const [draft, setDraft] = useState<LearningCatalogSubject[]>(() => current.map((subject) => ({ ...subject, units: subject.units.map((unit) => ({ ...unit, subsections: [...unit.subsections] })), materialProgress: { ...subject.materialProgress } })));
  const [source, setSource] = useState('');
  const [preview, setPreview] = useState<LearningCatalogSubject[] | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [aiUseCurrent, setAiUseCurrent] = useState(true);
  const parseSource = (value: string) => { try { const parsed = parseLearningCatalogImport(JSON.parse(value)); setPreview(parsed.subjects); setMessage(`识别到 ${parsed.subjects.length} 个科目。加载后仍可手动修改。`); } catch (error) { setPreview(null); setMessage(error instanceof Error ? error.message : '分类配置无法读取。'); } };
  const copyFormat = async () => {
    const instructions = [
      'JackYun 学科配置填写说明',
      '1. version 固定为 1；subjects 是学科数组。',
      '2. 每个学科只需填写 name；id 可保留原值，新增学科也可省略。',
      '3. units 是大单元数组，每项只需填写 name；不再需要填写小章节。',
      '4. materialProgress 记录资料当前位置，例如 B: "1.2"、N: "P18"；不需要更新的字段可省略。',
      '5. 可以只保留本次需要新增或修改的部分，导入时选择“合并”不会删除其他数据。',
      '6. 要批量重命名、删除或整体调整时，先点“复制当前数据 JSON”，修改后导入并选择“替换全部”。',
      '',
      'JSON 示例：',
      JSON.stringify(learningCatalogImportTemplate(), null, 2),
    ].join('\n');
    await navigator.clipboard.writeText(instructions);
    setMessage('填写说明和 JSON 示例已复制。');
  };
  const copyCurrentJson = async () => {
    await navigator.clipboard.writeText(JSON.stringify({ version: 1, subjects: draft }, null, 2));
    setMessage('当前全部数据 JSON 已复制；修改后可粘贴回来预览并一次保存。');
  };
  const runAi = async () => {
    if (!source.trim()) return;
    setBusy(true); setMessage('AI 正在整理学科层级…');
    try {
      const currentJson = JSON.stringify({ version: 1, subjects: draft }, null, 2);
      const userContent = aiUseCurrent
        ? `下面是当前完整数据，请按照修改要求返回修改后的完整 JSON。不要遗漏未要求修改的数据。\n\n当前数据：\n${currentJson.slice(0, 30_000)}\n\n修改要求：\n${source.slice(0, 9_000)}`
        : source.slice(0, 40_000);
      const response = await fetch('/api/llm-proxy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feature: 'chat', stream: false, temperature: 0.1, _no_thinking: true, messages: [{ role: 'system', content: `把用户要求转换成严格 JSON，不要解释或补充不存在的知识。格式：${JSON.stringify(learningCatalogImportTemplate())}。subjects 是学科；units 是大单元；每个大单元只需要 name，subsections 一律输出空数组。materialProgress 只记录明确的资料位置，例如 B:"1.2"。${aiUseCurrent ? '用户会提供当前完整数据和修改要求；必须返回修改后的完整数据，并保留所有未要求改变的字段、学科和单元。' : '允许只返回用户提供的局部学科、单元或资料位置。'}` }, { role: 'user', content: userContent }] }) });
      const parsed = parseLearningCatalogImport(parseAiJson(await readAiResponseContent(response)));
      setPreview(parsed.subjects); setMessage(`AI 整理出 ${parsed.subjects.length} 个科目。${aiUseCurrent ? '这是完整修改结果，建议核对后选择“替换全部”。' : '可选择增量合并。'}`);
    } catch (error) { setPreview(null); setMessage(error instanceof Error ? error.message : 'AI 导入失败。'); }
    finally { setBusy(false); }
  };
  const loadPreview = (strategy: 'merge' | 'replace') => {
    if (!preview) return;
    if (strategy === 'replace' && !window.confirm('替换会移除当前编辑器中未包含在导入结果里的学科和单元，确定继续吗？')) return;
    setDraft(strategy === 'merge' ? mergeLearningCatalog(draft, preview) : preview);
    setMode('manual');
    setMessage(strategy === 'merge' ? '已增量合并到现有配置；未导入的内容均已保留。' : '已用导入结果替换编辑器内容，确认无误后再保存。');
  };
  const save = () => { try { onApply(parseLearningCatalogImport({ version: 1, subjects: draft }).subjects); } catch (error) { setMessage(error instanceof Error ? error.message : '请检查分类配置。'); } };
  if (mode !== 'manual') return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="catalog-dialog-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="max-h-[94dvh] w-full max-w-6xl overflow-y-auto rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3"><div><h2 id="catalog-dialog-title" className="text-xl font-semibold">学科、大单元与资料位置</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">小章节已取消；旧数据仍兼容，但新建和导入只需维护学科与大单元。</p></div><button type="button" onClick={onClose} aria-label="关闭" className="grid h-10 w-10 place-items-center rounded-full hover:bg-black/5"><span className="material-icons-round">close</span></button></div>
        <div className="mt-5 inline-flex flex-wrap rounded-full bg-black/5 p-1 dark:bg-white/10">{([['manual', '手动编辑'], ['json', 'JSON 导入'], ['ai', 'AI 批量修改']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => { setMode(value); setMessage(''); setPreview(null); }} className={`rounded-full px-4 py-2 text-sm ${mode === value ? 'bg-[var(--card)] font-semibold shadow-sm' : ''}`}>{label}</button>)}</div>
        <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50/70 p-4 text-sm leading-6 text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
          {mode === 'json' ? '先复制填写说明或当前全部数据，在任意文本编辑器中批量修改后粘贴回来。局部 JSON 选择“合并”；完整修改后的 JSON 选择“替换全部”。' : '写出想增加、重命名、删除或修改的内容。开启读取当前数据后，AI 会在现有完整配置上修改，并生成可核对的预览。'}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={copyFormat} className="rounded-full border border-[var(--card-border)] px-4 py-2 text-sm font-medium"><span className="material-icons-round mr-1 align-middle text-base">content_copy</span>复制填写说明与示例</button>
          <button type="button" onClick={copyCurrentJson} className="rounded-full border border-[var(--card-border)] px-4 py-2 text-sm font-medium"><span className="material-icons-round mr-1 align-middle text-base">data_object</span>复制当前全部数据 JSON</button>
          {mode === 'json' && <label className="cursor-pointer rounded-full border border-[var(--card-border)] px-4 py-2 text-sm font-medium">选择 JSON 文件<input type="file" accept="application/json,.json" className="hidden" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; const text = await file.text(); setSource(text); parseSource(text); }} /></label>}
        </div>
        {mode === 'ai' && <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-[var(--card-border)] p-4"><input type="checkbox" checked={aiUseCurrent} onChange={(event) => setAiUseCurrent(event.target.checked)} className="mt-1 h-4 w-4 accent-[var(--brand)]" /><span><strong className="block text-sm">让 AI 读取当前配置并批量修改</strong><span className="mt-1 block text-xs leading-5 text-[var(--muted-foreground)]">默认开启。适合批量重命名、删除、合并学科或更新多个资料位置；AI 会返回完整数据供你预览。</span></span></label>}
        <textarea value={source} onChange={(event) => setSource(event.target.value)} rows={14} placeholder={mode === 'ai' ? (aiUseCurrent ? '例如：把 Pure Math 改名为 Mathematics；删除旧单元；Physics 的 B 改到 2.3；其余数据保持不变。' : '输入要新增或更新的局部内容…') : '粘贴修改后的 JSON，或只粘贴需要增量导入的部分 JSON…'} className="mt-4 w-full rounded-2xl border border-[var(--card-border)] bg-[var(--background)] p-4 font-mono text-xs leading-5" />
        <button type="button" disabled={busy || !source.trim()} onClick={() => mode === 'json' ? parseSource(source) : runAi()} className="mt-3 rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:text-[#202124]">{busy ? '处理中…' : mode === 'json' ? '检查 JSON 并预览' : aiUseCurrent ? 'AI 修改当前数据并预览' : 'AI 整理局部数据并预览'}</button>
        {preview && <div className="mt-4 rounded-2xl border border-[var(--card-border)] p-4"><p className="text-sm font-semibold">导入预览：{preview.length} 个学科、{preview.reduce((total, subject) => total + subject.units.length, 0)} 个大单元</p><p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">{mode === 'ai' && aiUseCurrent ? 'AI 返回的是完整修改结果；核对无误后选择“替换全部”。' : '局部数据建议增量合并；只有输入确实包含完整数据时才替换全部。'}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => loadPreview('merge')} className="rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white dark:text-[#202124]">合并到现有配置</button><button type="button" onClick={() => loadPreview('replace')} className="rounded-full border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-600">替换全部</button></div></div>}
        {message && <p role="status" className="mt-4 rounded-xl bg-black/5 px-3 py-2 text-sm dark:bg-white/10">{message}</p>}
        <div className="mt-6 flex justify-end gap-3 border-t border-[var(--card-border)] pt-5"><button type="button" onClick={onClose} className="rounded-full border border-[var(--card-border)] px-5 py-2.5 text-sm">取消</button><button type="button" onClick={save} className="rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white dark:text-[#202124]">保存全部修改</button></div>
      </div>
    </div>
  );
  return <div className="fixed inset-0 z-[70] grid place-items-center bg-black/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="catalog-dialog-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="max-h-[94dvh] w-full max-w-6xl overflow-y-auto rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><h2 id="catalog-dialog-title" className="text-xl font-semibold">学科、单元与资料位置</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">可以完整手动维护；JSON 和 AI 默认增量合并，也支持明确替换。</p></div><button type="button" onClick={onClose} aria-label="关闭" className="grid h-10 w-10 place-items-center rounded-full hover:bg-black/5"><span className="material-icons-round">close</span></button></div><div className="mt-5 inline-flex flex-wrap rounded-full bg-black/5 p-1 dark:bg-white/10">{([['manual', '手动编辑'], ['json', 'JSON 导入'], ['ai', 'AI 导入']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => { setMode(value); setMessage(''); }} className={`rounded-full px-4 py-2 text-sm ${mode === value ? 'bg-[var(--card)] font-semibold shadow-sm' : ''}`}>{label}</button>)}</div>{mode === 'manual' ? <ManualCatalogEditor subjects={draft} onChange={setDraft} /> : <div className="mt-5"><div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-3 text-xs leading-5 text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">支持只导入一个学科、一个单元、小单元列表或几项资料位置。默认合并，不会删除没有出现在本次导入中的已有内容。</div><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={copyFormat} className="rounded-full border border-[var(--card-border)] px-4 py-2 text-sm font-medium"><span className="material-icons-round mr-1 align-middle text-base">content_copy</span>复制格式</button>{mode === 'json' && <label className="cursor-pointer rounded-full border border-[var(--card-border)] px-4 py-2 text-sm font-medium">选择 JSON<input type="file" accept="application/json,.json" className="hidden" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; const text = await file.text(); setSource(text); parseSource(text); }} /></label>}</div><textarea value={source} onChange={(event) => setSource(event.target.value)} rows={12} placeholder={mode === 'ai' ? '可只粘贴需要新增或更新的局部内容…' : '可只粘贴部分学科或单元的 JSON…'} className="mt-4 w-full rounded-2xl border border-[var(--card-border)] bg-[var(--background)] p-4 font-mono text-xs leading-5" /><button type="button" disabled={busy || !source.trim()} onClick={() => mode === 'json' ? parseSource(source) : runAi()} className="mt-3 rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:text-[#202124]">{busy ? '处理中…' : mode === 'json' ? '检查并预览' : 'AI 整理并预览'}</button>{preview && <div className="mt-4 rounded-2xl border border-[var(--card-border)] p-4"><p className="text-sm font-semibold">导入预览：{preview.length} 个学科、{preview.reduce((total, subject) => total + subject.units.length, 0)} 个大单元</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">建议使用增量合并；只有确实想清空未导入内容时才使用替换。</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => loadPreview('merge')} className="rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white dark:text-[#202124]">合并到现有配置</button><button type="button" onClick={() => loadPreview('replace')} className="rounded-full border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-600">替换全部</button></div></div>}</div>}{message && <p role="status" className="mt-4 rounded-xl bg-black/5 px-3 py-2 text-sm dark:bg-white/10">{message}</p>}<div className="mt-6 flex justify-end gap-3 border-t border-[var(--card-border)] pt-5"><button type="button" onClick={onClose} className="rounded-full border border-[var(--card-border)] px-5 py-2.5 text-sm">取消</button><button type="button" onClick={save} className="rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white dark:text-[#202124]">保存全部修改</button></div></div></div>;
}

function ImportDialog({ onClose, onApply }: { onClose: () => void; onApply: (timetable: TimetableImport) => void }) {
  const [mode, setMode] = useState<'json' | 'ai'>('json');
  const [source, setSource] = useState('');
  const [preview, setPreview] = useState<TimetableImport | null>(null);
  const [reviewCourseIds, setReviewCourseIds] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const showPreview = (parsed: TimetableImport, prefix: string) => {
    setPreview(parsed);
    setReviewCourseIds([]);
    setMessage(`${prefix}${parsed.courses.length} 门课程、${parsed.courses.reduce((total, course) => total + course.sessions.length, 0)} 个时段。请在下方选择需要复习的科目。`);
  };
  const parseJson = (text: string) => {
    try { showPreview(parseTimetableImport(JSON.parse(text) as unknown), '识别到 '); }
    catch (error) { setPreview(null); setReviewCourseIds([]); setMessage(error instanceof Error ? error.message : 'JSON 无法读取。'); }
  };
  const runAiImport = async () => {
    if (!source.trim()) return;
    setBusy(true); setMessage('AI 正在整理课表，只会生成导入预览…'); setPreview(null); setReviewCourseIds([]);
    try {
      const response = await fetch('/api/llm-proxy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feature: 'chat', stream: false, temperature: 0.1, _no_thinking: true, messages: [{ role: 'system', content: `把用户提供的课表文本转换成严格 JSON，不要解释，不要添加原文没有的课程。格式：${JSON.stringify(timetableImportTemplate())}。day 使用 1=周一 到 7=周日；时间使用 HH:mm；每个课程合并所有 sessions；无法确认的地点或教师省略；所有课程的 review 一律设为 false，复习科目由用户在导入预览中亲自选择。weeks 仅在原文明确给出时填写。` }, { role: 'user', content: source.slice(0, 40_000) }] }) });
      const content = await readAiResponseContent(response);
      showPreview(parseTimetableImport(parseAiJson(content)), 'AI 识别到 ');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'AI 导入失败。'); }
    finally { setBusy(false); }
  };
  const copyRules = async () => {
    const rules = `JackYun 课表 JSON 规则\n- version 固定为 1\n- day: 1=周一，7=周日\n- start/end: HH:mm\n- review 导入时保持 false；需要复习的科目在预览中手动选择\n- weeks: 可选，学期周次数组；需要 termStart 才能精确计算\n\n${JSON.stringify(timetableImportTemplate(), null, 2)}`;
    await navigator.clipboard.writeText(rules); setMessage('导入规则和模板已复制。');
  };
  const toggleReviewCourse = (courseId: string) => setReviewCourseIds((current) => current.includes(courseId) ? current.filter((id) => id !== courseId) : [...current, courseId]);
  const applyPreview = () => {
    if (!preview) return;
    onApply(withReviewCourseSelection(preview, reviewCourseIds));
  };
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="import-dialog-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-[2rem] border border-[var(--card-border)] bg-[var(--card)] shadow-2xl">
        <div className="relative overflow-hidden border-b border-[var(--card-border)] p-6"><div className="pointer-events-none absolute -right-8 -top-16 h-40 w-40 rounded-full bg-blue-500/15 blur-3xl" /><div className="relative flex items-start gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-50 text-[var(--brand)] dark:bg-blue-950/50"><span className="material-icons-round">calendar_month</span></div><div className="min-w-0 flex-1"><h2 id="import-dialog-title" className="text-xl font-semibold">导入课表</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">先确认课程，再亲自选择需要复习的科目。</p></div><button type="button" onClick={onClose} aria-label="关闭" className="grid h-10 w-10 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"><span className="material-icons-round">close</span></button></div></div>
        <div className="overflow-y-auto p-6">
          <div className="inline-flex rounded-full bg-black/5 p-1 dark:bg-white/10"><button type="button" onClick={() => { setMode('json'); setPreview(null); setReviewCourseIds([]); setMessage(''); }} className={`rounded-full px-4 py-2 text-sm font-medium ${mode === 'json' ? 'bg-[var(--card)] shadow-sm' : 'text-[var(--muted-foreground)]'}`}>JSON 导入</button><button type="button" onClick={() => { setMode('ai'); setPreview(null); setReviewCourseIds([]); setMessage(''); }} className={`rounded-full px-4 py-2 text-sm font-medium ${mode === 'ai' ? 'bg-[var(--card)] shadow-sm' : 'text-[var(--muted-foreground)]'}`}>AI 文本识别</button></div>
          {mode === 'json' ? <div className="mt-5"><div className="flex flex-wrap gap-3"><label className="cursor-pointer rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white dark:text-[#202124]">选择 JSON<input type="file" accept="application/json,.json" className="hidden" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; const text = await file.text(); setSource(text); parseJson(text); }} /></label><button type="button" onClick={copyRules} className="rounded-full border border-[var(--card-border)] px-4 py-2 text-sm font-medium"><span className="material-icons-round mr-1 align-middle text-base">content_copy</span>复制规则</button></div><textarea value={source} onChange={(event) => setSource(event.target.value)} rows={10} spellCheck={false} placeholder="也可以在这里粘贴 JSON…" className="mt-4 w-full resize-y rounded-2xl border border-[var(--card-border)] bg-[var(--background)] p-4 font-mono text-xs leading-5 outline-none focus:border-[var(--brand)]" /><button type="button" onClick={() => parseJson(source)} className="mt-3 rounded-full border border-[var(--card-border)] px-4 py-2 text-sm font-medium">检查并预览</button></div> : <div className="mt-5"><div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"><strong>隐私提醒：</strong>只有点击“AI 识别”后，下面的文本才会发送到你在 JackYun 中配置的 AI 服务。若不希望发送，请使用 JSON 导入。</div><textarea value={source} onChange={(event) => setSource(event.target.value)} rows={10} maxLength={40_000} placeholder="粘贴课表文本、OCR 结果或从表格复制的内容…" className="mt-4 w-full resize-y rounded-2xl border border-[var(--card-border)] bg-[var(--background)] p-4 text-sm leading-6 outline-none focus:border-[var(--brand)]" /><button type="button" disabled={busy || !source.trim()} onClick={runAiImport} className="mt-3 rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:text-[#202124]"><span className="material-icons-round mr-1 align-middle text-base">auto_awesome</span>{busy ? '识别中…' : 'AI 识别并预览'}</button></div>}
          {message && <p role="status" className="mt-4 rounded-xl bg-black/5 px-4 py-3 text-sm dark:bg-white/10">{message}</p>}
          {preview && <div className="mt-4 overflow-hidden rounded-3xl border border-[var(--card-border)]"><div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 dark:from-blue-950/40 dark:to-indigo-950/30"><div><p className="font-semibold">{preview.name}</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">{preview.courses.length} 门课程 · 已选择 {reviewCourseIds.length} 门复习</p></div><div className="flex gap-2"><button type="button" onClick={() => setReviewCourseIds(preview.courses.map((course) => course.id))} className="rounded-full bg-[var(--card)] px-3 py-1.5 text-xs font-semibold shadow-sm">全选</button><button type="button" onClick={() => setReviewCourseIds([])} className="rounded-full bg-[var(--card)] px-3 py-1.5 text-xs font-semibold shadow-sm">清空</button></div></div><div className="grid max-h-72 gap-2 overflow-y-auto p-3 sm:grid-cols-2">{preview.courses.map((course) => { const checked = reviewCourseIds.includes(course.id); return <label key={course.id} className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-3 transition ${checked ? 'border-[var(--brand)] bg-blue-50/80 shadow-sm dark:bg-blue-950/30' : 'border-[var(--card-border)] hover:bg-black/[.025] dark:hover:bg-white/[.04]'}`}><span className="h-9 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: course.color }} /><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{course.shortName ?? course.name}</strong><span className="mt-0.5 block text-xs text-[var(--muted-foreground)]">{course.sessions.length} 个上课时段</span></span><input type="checkbox" checked={checked} onChange={() => toggleReviewCourse(course.id)} className="h-5 w-5 shrink-0 accent-[var(--brand)]" aria-label={`${course.name}需要复习`} /></label>; })}</div></div>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--card-border)] p-5"><p className="text-xs text-[var(--muted-foreground)]">复习科目选择会保存在本机；登录后随账号同步。</p><div className="flex gap-3"><button type="button" onClick={onClose} className="rounded-full border border-[var(--card-border)] px-5 py-2.5 text-sm font-medium">取消</button><button type="button" disabled={!preview} onClick={applyPreview} className="rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-40 dark:text-[#202124]">保存课表与复习科目</button></div></div>
      </div>
    </div>
  );
}

function TaskList({ tasks, cueCount, onStudyCue, onComplete, onPostpone, onCancel, didaAccount, sendingTaskKey, onSendToDida }: { tasks: LearningTask[]; cueCount: (task: LearningTask) => number; onStudyCue: (task: LearningTask) => void; onComplete: (task: LearningTask) => void; onPostpone: (task: LearningTask) => void; onCancel: (task: LearningTask) => void; didaAccount?: DidaAccountView; sendingTaskKey: string; onSendToDida: (task: LearningTask) => void }) {
  if (!tasks.length) {
    return <div className="rounded-2xl border border-dashed border-[var(--card-border)] px-5 py-10 text-center"><span className="material-icons-round text-3xl text-emerald-500">task_alt</span><p className="mt-2 font-medium">今天的任务已经清空</p><p className="mt-1 text-sm text-[var(--muted-foreground)]">可以自己添加预习、专项学习、考试或普通待办。</p></div>;
  }
  return (
    <div className="space-y-3">
      {tasks.map((task) => {
        const meta = TYPE_META[task.type];
        return (
          <article key={task.key} className="group rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 transition hover:border-[color-mix(in_srgb,var(--brand)_45%,var(--card-border))] hover:shadow-sm">
            <div className="flex gap-3">
              <button type="button" aria-label={`完成 ${task.title}`} onClick={() => onComplete(task)} className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-[var(--card-border)] text-transparent transition hover:border-emerald-500 hover:bg-emerald-500 hover:text-white"><span className="material-icons-round text-base">check</span></button>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${meta.tone}`}><span className="material-icons-round text-sm">{meta.icon}</span>{meta.label}</span>
                  {task.overdue && <span className="rounded-full bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 dark:bg-rose-950/50 dark:text-rose-200">已逾期</span>}
                  {task.start && <span className="text-xs font-medium text-[var(--muted-foreground)]">{task.start} · {task.durationMinutes} 分钟</span>}
                </div>
                <h3 className="mt-2 font-semibold">{task.title}</h3>
                {task.mergedTasks?.length ? <div className="mt-3 rounded-2xl border border-blue-200 bg-blue-50/70 p-3 dark:border-blue-900 dark:bg-blue-950/25"><p className="text-xs font-semibold text-[var(--brand)]">联合任务 · 共 {task.mergedTasks.length} 项</p><div className="mt-2 space-y-2">{task.mergedTasks.map((item) => { const itemMeta = TYPE_META[item.type]; return <div key={item.key} className="rounded-xl bg-[var(--card)] px-3 py-2"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${itemMeta.tone}`}>{itemMeta.label}</span><strong className="text-xs">{item.title}</strong></div><p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">{item.detail}</p></div>; })}</div></div> : <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">{task.detail}</p>}
                {task.scope && <p className="mt-2 text-xs text-[var(--muted-foreground)]"><strong className="text-[var(--foreground)]">范围：</strong>{[task.subjectName, task.scope.unit, task.scope.subsection].filter(Boolean).join(' → ') || `${task.cueIds?.length ?? 0} 条 Cue`}</p>}
                {task.materials?.length ? <div className="mt-2 flex flex-wrap gap-1.5">{task.materials.map((material) => <span key={material.code} className="rounded-full bg-black/5 px-2.5 py-1 text-[11px] dark:bg-white/10"><strong className="font-mono">{material.code}</strong>{material.progress ? ` · ${material.progress}` : ''}</span>)}</div> : null}
                <div className="mt-3 flex flex-wrap gap-2">{cueCount(task) > 0 && <button type="button" onClick={() => onStudyCue(task)} className="inline-flex items-center gap-1 rounded-full bg-[var(--brand)] px-3 py-1.5 text-xs font-semibold text-white dark:text-[#202124]"><span className="material-icons-round text-base">psychology_alt</span>开始 Cue 学习 · {cueCount(task)} 条</button>}{task.guide && <Link href={`/study-guide?tab=${encodeURIComponent(task.guide.tab)}&subTab=${encodeURIComponent(task.guide.subTab)}`} className="inline-flex items-center gap-1 rounded-full border border-[var(--card-border)] px-3 py-1.5 text-xs font-semibold text-[var(--brand)]"><span className="material-icons-round text-base">menu_book</span>查看怎么做</Link>}</div>
                {task.lastStatus && task.lastReviewedAt && (
                  <div className={`mt-3 rounded-2xl border px-3.5 py-3 text-xs leading-5 ${task.lastStatus === 'stable' ? 'border-emerald-100 bg-emerald-50/80 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/35 dark:text-emerald-100' : task.lastStatus === 'partial' ? 'border-amber-100 bg-amber-50/80 text-amber-950 dark:border-amber-900 dark:bg-amber-950/35 dark:text-amber-100' : 'border-rose-100 bg-rose-50/80 text-rose-950 dark:border-rose-900 dark:bg-rose-950/35 dark:text-rose-100'}`}>
                    <p className="font-semibold">上次记录：{statusMark(task.lastStatus)} · {formatReviewTimestamp(task.lastReviewedAt)}</p>
                    {task.studiedContent && <p className="mt-1">复习内容：{task.studiedContent}</p>}
                    {task.issue && <p className="mt-1">发现问题：{task.issue}</p>}
                    {task.note && task.note !== task.issue && <p className="mt-1">备注：{task.note}</p>}
                    {task.lastStatus === 'unclear' && <p className="mt-1 font-semibold">当前未通过：修复问题后请重新提交判定。</p>}
                  </div>
                )}
                {task.note && !task.lastStatus && task.note !== task.detail && <p className="mt-2 rounded-xl bg-black/[.035] px-3 py-2 text-xs leading-5 dark:bg-white/[.06]">备注：{task.note}</p>}
              </div>
              <div className="flex shrink-0 flex-col gap-1">{didaAccount && <button type="button" disabled={sendingTaskKey === task.key} onClick={() => onSendToDida(task)} aria-label={`将 ${task.title} 添加到 ${didaAccount.displayName}`} title={`添加到 ${didaAccount.displayName}`} className="inline-flex h-9 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-[#1a73e8] hover:bg-blue-50 disabled:opacity-50 dark:hover:bg-blue-950/40"><span className="material-icons-round text-lg">playlist_add</span>{sendingTaskKey === task.key ? '添加中' : '滴答清单'}</button>}<button type="button" onClick={() => onPostpone(task)} aria-label={`将 ${task.title} 延至明天`} title="延至明天" className="inline-flex h-9 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-[var(--muted-foreground)] hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/40"><span className="material-icons-round text-lg">next_plan</span>明天</button><button type="button" onClick={() => onCancel(task)} aria-label={`取消 ${task.title}`} title="取消任务" className="inline-flex h-9 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-[var(--muted-foreground)] hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"><span className="material-icons-round text-lg">cancel</span>取消</button></div>
            </div>
          </article>
        );
      })}
    </div>
  );
}


export default function ScheduleControl({ personalIeltsPlan = false }: { personalIeltsPlan?: boolean }) {
  const { signedIn } = useAuthMode();
  const [state, setState] = useState<ScheduleControlState>(() => createEmptyScheduleState());
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [view, setView] = useState<'today' | 'week' | 'cue' | 'records' | 'settings'>('today');
  const [reviewTask, setReviewTask] = useState<LearningTask | null>(null);
  const [cueStudyTask, setCueStudyTask] = useState<LearningTask | null>(null);
  const [taskDialog, setTaskDialog] = useState(false);
  const [cueManager, setCueManager] = useState(false);
  const [importDialog, setImportDialog] = useState(false);
  const [catalogDialog, setCatalogDialog] = useState(false);
  const [notice, setNotice] = useState('');
  const [didaAccounts, setDidaAccounts] = useState<DidaAccountView[]>([]);
  const [selectedDidaAccountId, setSelectedDidaAccountId] = useState('');
  const [sendingTaskKey, setSendingTaskKey] = useState('');
  const [aiReportBusyId, setAiReportBusyId] = useState('');
  const [reminderTitle, setReminderTitle] = useState('');
  const [reminderDate, setReminderDate] = useState('');
  const [reminderSubjectId, setReminderSubjectId] = useState('');
  const selected = useMemo(() => selectedDate ? dateFromKey(selectedDate) : new Date(2000, 0, 1), [selectedDate]);
  const todayKey = now ? dateKey(now) : '';

  useEffect(() => {
    queueMicrotask(() => {
      const current = new Date();
      setNow(current);
      setSelectedDate(dateKey(current));
      setState(loadState(current));
      setReady(true);
    });
  }, []);
  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (signedIn) window.dispatchEvent(new Event('jackyun-sync-retry'));
  }, [ready, signedIn, state]);
  useEffect(() => {
    const reloadCloudState = (event: Event) => {
      const keys = (event as CustomEvent<{ keys?: string[] }>).detail?.keys;
      if (keys?.includes(STORAGE_KEY)) setState(loadState());
    };
    window.addEventListener(CLOUD_STATE_APPLIED_EVENT, reloadCloudState);
    return () => window.removeEventListener(CLOUD_STATE_APPLIED_EVENT, reloadCloudState);
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = new Date();
      setNow(current);
      setState((state) => rollOverManualTasks(state, dateKey(current), current.toISOString()));
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(''), 2800); return () => window.clearTimeout(timer); }, [notice]);
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (!signedIn) { setDidaAccounts([]); setSelectedDidaAccountId(''); return; }
      fetch('/api/integrations/dida365/accounts', { cache: 'no-store' }).then(async (response) => {
        if (!response.ok) return;
        const data = await response.json() as { accounts?: DidaAccountView[] };
        if (cancelled) return;
        const next = data.accounts ?? [];
        setDidaAccounts(next);
        setSelectedDidaAccountId((current) => next.some((item) => item.id === current) ? current : (next[0]?.id ?? ''));
      }).catch(() => {});
    });
    return () => { cancelled = true; };
  }, [signedIn]);

  const todaySessions = useMemo(() => sessionsForDate(state.timetable, selected), [selected, state.timetable]);
  const tasks = useMemo(() => tasksForDate(state, selected), [selected, state]);
  const week = useMemo(() => weekDates(selected), [selected]);
  const activeSession = now && selectedDate === todayKey ? todaySessions.find((session) => minutes(session.start) <= now.getHours() * 60 + now.getMinutes() && minutes(session.end) > now.getHours() * 60 + now.getMinutes()) : undefined;
  const nextSession = now && selectedDate === todayKey ? todaySessions.find((session) => minutes(session.start) > now.getHours() * 60 + now.getMinutes()) : todaySessions[0];
  const completedToday = now ? Object.values(state.completions).filter((completion) => dateKey(new Date(completion.completedAt)) === todayKey).length : 0;
  const reviewDue = tasks.filter((task) => REVIEW_TYPES.has(task.type)).length;
  const reviewCues = state.cues;
  const cueStudyCues = useMemo(() => cueStudyTask ? cuesForLearningTask(state.cues, cueStudyTask) : [], [cueStudyTask, state.cues]);
  const selectedDidaAccount = didaAccounts.find((account) => account.id === selectedDidaAccountId);
  const sendToDida = async (task: LearningTask) => {
    if (!selectedDidaAccount) return;
    setSendingTaskKey(task.key);
    try {
      const response = await fetch('/api/integrations/dida365/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId: selectedDidaAccount.id, task }) });
      const data = await response.json().catch(() => ({})) as { error?: string; created?: boolean };
      if (!response.ok) throw new Error(data.error || '添加失败。');
      setNotice(data.created ? `已添加到 ${selectedDidaAccount.displayName}。` : `已更新 ${selectedDidaAccount.displayName} 中的同一任务。`);
    } catch (error) { setNotice(error instanceof Error ? error.message : '添加到滴答清单失败。'); }
    finally { setSendingTaskKey(''); }
  };
  const saveCueStudyProgress = useCallback((draft: CueStudyDraft) => {
    setState((current) => ({ ...current, cueStudyDraft: draft }));
  }, []);
  const startCueStudy = (task: LearningTask) => {
    if (state.cueStudyDraft?.task.key === task.key) {
      setCueStudyTask(state.cueStudyDraft.task);
      setNotice('已恢复这项 Cue 学习的上次进度。');
      return;
    }
    if (state.cueStudyDraft && !window.confirm('已有未完成的 Cue 学习进度。开始新的学习会替换它，是否继续？')) return;
    const cueIds = cuesForLearningTask(state.cues, task).map((cue) => cue.id);
    const draft: CueStudyDraft = { id: task.key, task: { ...task, cueIds }, cueIds, index: 0, revealed: false, assessments: {}, updatedAt: new Date().toISOString() };
    setState((current) => ({ ...current, cueStudyDraft: draft }));
    setCueStudyTask(draft.task);
  };
  const startSpecialCueStudy = (subjectName: string, unit: string, cueIds: string[]) => {
    const subject = state.learningCatalog.find((item) => item.name === subjectName);
    const task: LearningTask = {
      key: `cue-special-${taskId()}`,
      title: `Cue 专项学习 · ${subjectName}${unit ? ` · ${unit}` : ''}`,
      detail: '闭卷检索 Cue，核对证据并记录状态。',
      type: 'special', date: todayKey, durationMinutes: 30,
      ...(subject ? { subjectId: subject.id } : {}), subjectName,
      scope: { ...(unit ? { unit } : {}), cueIds }, cueIds,
      materials: Object.entries(subject?.materialProgress ?? {}).map(([code, progress]) => ({ code: code as LearningSessionEvidence['materials'][number]['code'], progress })),
    };
    startCueStudy(task);
  };

  const completeTask = (task: LearningTask) => {
    setReviewTask(task);
  };
  const postponeTask = (task: LearningTask) => {
    const tomorrow = addCalendarDays(selectedDate, 1);
    setState((current) => postponeLearningTask(current, task, tomorrow));
    setNotice(`任务已延至${formatLongDate(dateFromKey(tomorrow))}。`);
  };
  const cancelTask = (task: LearningTask) => {
    if (!window.confirm(`确定取消任务「${task.title}」吗？`)) return;
    const cancelledAt = new Date().toISOString();
    setState((current) => ({ ...current, cancellations: { ...current.cancellations, ...Object.fromEntries((task.mergedTaskKeys ?? [task.key]).map((key) => [key, { cancelledAt, reason: 'cancelled' as const }])) } }));
    setNotice('任务已取消。');
  };
  const addIeltsWeek = () => {
    const weekStart = dateKey(weekDates(selected)[0]);
    setState((current) => {
      const existing = new Set(current.manualTasks.map((task) => task.id));
      const additions = createIeltsWeekTasks(weekStart).filter((task) => !existing.has(task.id));
      return { ...current, manualTasks: [...current.manualTasks, ...additions] };
    });
    setNotice('本周 IELTS 五个弹性模块已分散到周一至周五；可按需延至明天。');
  };
  const navigateDate = (offset: number) => { const date = new Date(selected); date.setDate(date.getDate() + offset); setSelectedDate(dateKey(date)); };
  const submitReview = (task: LearningTask, details: ReviewDetails, evidence: LearningSessionEvidence) => {
    const completedAt = new Date();
    let updated = { ...completeLearningSession(state, task, details, evidence, completedAt), cueStudyDraft: undefined };
    const subjectName = evidence.subjectName?.trim() || task.subjectName || '';
    const subject = state.learningCatalog.find((item) => item.name === subjectName);
    const progressChanges = evidence.materials.filter((material) => material.progress?.trim() && subject?.materialProgress[material.code] !== material.progress.trim());
    if (subject && progressChanges.length && window.confirm(`要更新 ${subject.name} 的资料位置吗？\n${progressChanges.map((material) => `${material.code}: ${subject.materialProgress[material.code] ?? '未记录'} → ${material.progress}`).join('\n')}`)) {
      updated = { ...updated, learningCatalog: updateSubjectMaterialProgress(updated.learningCatalog, subjectName, progressChanges) };
    }
    const status = updated.learningRecords[0].status;
    const progress = task.subjectId ? updated.reviewProgress[task.subjectId] : undefined;
    setState(updated);
    setReviewTask(null);
    setCueStudyTask(null);
    const syncMessage = signedIn ? ' · 正在同步到账号' : ' · 当前保存在本机';
    if (status === 'unclear') {
      setNotice(`○ 未通过，问题已记录；修复后请重新判定${syncMessage}`);
      return;
    }
    if (!progress) {
      const reviewed = evidence.assessments.length;
      setNotice(`完成记录已保存${reviewed ? ` · 已更新 ${reviewed} 条 Cue` : ''}${syncMessage}`);
      return;
    }
    const intervalLabel = status === 'partial' ? '次日' : `${progress?.intervalDays ?? 3} 天后`;
    const nextDate = progress ? formatLongDate(dateFromKey(progress.nextReviewDate)) : '待安排';
    setNotice(`${statusMark(status)} 已提交 · 下次复习：${nextDate}（${intervalLabel}）${syncMessage}`);
  };
  const generateAiReport = async (record: LearningRecord) => {
    setAiReportBusyId(record.id);
    try {
      const response = await fetch('/api/llm-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feature: 'chat', stream: false, temperature: 0.2, _no_thinking: true,
          messages: [
            { role: 'system', content: '你是严格遵循 JackYun StudyGuide 的学习报告教练。只根据提供的学习记录和 Cue 证据分析，不虚构表现。用中文输出：1. 本次证据概览；2. 按学科与大单元分析；3. 根据 √/△/○ 识别最小缺口；4. 下一次可执行动作。遵循：先闭卷检索再看证据；Definition/State 检查必要得分点；Explain 检查完整 marking-point chain；只做 minimal repair；稳定的 Cue 不机械重做。' },
            { role: 'user', content: JSON.stringify({ task: record.taskTitle, content: record.studiedContent, issue: record.issue, scope: record.scope, materials: record.materials, cues: record.cues, systemReport: record.systemReport }) },
          ],
        }),
      });
      const content = (await readAiResponseContent(response)).trim();
      if (!content) throw new Error('AI 没有返回报告内容。');
      const generatedAt = new Date().toISOString();
      setState((current) => ({ ...current, learningRecords: current.learningRecords.map((item) => item.id === record.id ? { ...item, aiReport: { content: content.slice(0, 12_000), generatedAt } } : item) }));
      setNotice('AI 学习报告已生成。');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'AI 学习报告生成失败。');
    } finally {
      setAiReportBusyId('');
    }
  };

  if (!ready || !now || !selectedDate) return <div className="mx-auto max-w-[1500px] animate-pulse"><div className="h-28 rounded-3xl bg-black/5 dark:bg-white/5" /><div className="mt-5 grid gap-5 lg:grid-cols-3"><div className="h-80 rounded-3xl bg-black/5 dark:bg-white/5 lg:col-span-2" /><div className="h-80 rounded-3xl bg-black/5 dark:bg-white/5" /></div></div>;

  return (
    <div className="mx-auto max-w-[1500px] pb-10">
      <header className="overflow-hidden rounded-3xl border border-[var(--card-border)] bg-[var(--card)] shadow-[var(--surface-shadow)]">
        <div className="relative px-5 py-6 sm:px-7">
          <div className="pointer-events-none absolute -right-12 -top-20 h-56 w-56 rounded-full bg-blue-500/10 blur-3xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-5"><div><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.12em] text-[var(--brand)]"><span className="h-2 w-2 rounded-full bg-emerald-500" />Personal learning control</div><h1 className="mt-2 text-2xl font-semibold tracking-[-.035em] sm:text-3xl">{state.settings.mode === 'holiday' ? '假日学习控制台' : '今日学习与课表'}</h1><p className="mt-2 text-sm text-[var(--muted-foreground)]">{formatLongDate(selected)}{selectedDate !== todayKey ? ' · 正在查看其他日期' : ''}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setCueManager(true)} className="rounded-full border border-[var(--card-border)] bg-[var(--card)] px-4 py-2.5 text-sm font-semibold hover:bg-black/[.035] dark:hover:bg-white/[.06]"><span className="material-icons-round mr-1 align-middle text-lg">quiz</span>Cue 管理</button><button type="button" onClick={() => setTaskDialog(true)} className="rounded-full border border-[var(--card-border)] bg-[var(--card)] px-4 py-2.5 text-sm font-semibold hover:bg-black/[.035] dark:hover:bg-white/[.06]"><span className="material-icons-round mr-1 align-middle text-lg">add</span>添加任务</button><button type="button" onClick={() => setImportDialog(true)} className="rounded-full bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white dark:text-[#202124]"><span className="material-icons-round mr-1 align-middle text-lg">upload_file</span>导入课表</button></div></div>
          <div className="relative mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-2xl bg-black/[.035] p-4 dark:bg-white/[.06]"><p className="text-xs text-[var(--muted-foreground)]">今日课程</p><strong className="mt-1 block text-2xl">{state.settings.mode === 'holiday' ? '—' : todaySessions.length}</strong></div><div className="rounded-2xl bg-black/[.035] p-4 dark:bg-white/[.06]"><p className="text-xs text-[var(--muted-foreground)]">待复习</p><strong className="mt-1 block text-2xl">{reviewDue}</strong></div><div className="rounded-2xl bg-black/[.035] p-4 dark:bg-white/[.06]"><p className="text-xs text-[var(--muted-foreground)]">今日完成</p><strong className="mt-1 block text-2xl">{completedToday}</strong></div><div className="rounded-2xl bg-black/[.035] p-4 dark:bg-white/[.06]"><p className="text-xs text-[var(--muted-foreground)]">当前模式</p><strong className="mt-1 block text-lg">{state.settings.mode === 'term' ? '学期' : '假日'}</strong></div></div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-[var(--card-border)] px-4 pt-2 sm:px-6" aria-label="日程视图">{([['today', 'today', '今日'], ['week', 'calendar_view_week', '周课表'], ['cue', 'psychology_alt', state.cueStudyDraft ? 'Cue 学习 · 可恢复' : 'Cue 学习'], ['records', 'history_edu', '学习记录'], ['settings', 'tune', '设置']] as const).map(([key, icon, label]) => <button key={key} type="button" onClick={() => setView(key)} className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold ${view === key ? 'border-[var(--brand)] text-[var(--brand)]' : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`}><span className="material-icons-round text-lg">{icon}</span>{label}</button>)}</nav>
      </header>

      {(view === 'today' || view === 'week') && <div className="mt-5 flex items-center justify-between rounded-2xl border border-[var(--card-border)] bg-[var(--card)] px-3 py-2"><button type="button" onClick={() => navigateDate(view === 'week' ? -7 : -1)} aria-label="上一日期" className="grid h-10 w-10 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"><span className="material-icons-round">chevron_left</span></button><button type="button" onClick={() => setSelectedDate(todayKey)} className="rounded-full px-4 py-2 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10">{selectedDate === todayKey ? formatShortDate(selected) : '回到今天'}</button><button type="button" onClick={() => navigateDate(view === 'week' ? 7 : 1)} aria-label="下一日期" className="grid h-10 w-10 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"><span className="material-icons-round">chevron_right</span></button></div>}

      {view === 'today' && <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,.65fr)]">
        <section className="min-w-0"><div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--muted-foreground)]">Today</p><h2 className="mt-1 text-xl font-semibold">今天要完成</h2></div><div className="flex items-center gap-2">{didaAccounts.length > 1 && <label className="text-xs text-[var(--muted-foreground)]">发送到 <select value={selectedDidaAccountId} onChange={(event) => setSelectedDidaAccountId(event.target.value)} className="ml-1 rounded-full border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-xs text-[var(--foreground)]">{didaAccounts.map((account) => <option key={account.id} value={account.id}>{account.displayName}</option>)}</select></label>}{signedIn && !didaAccounts.length && <Link href="/settings?section=connections" className="text-xs font-semibold text-[var(--brand)]">关联滴答清单</Link>}<span className="text-sm text-[var(--muted-foreground)]">{tasks.length} 项</span></div></div>{!state.timetable && !state.manualTasks.length && !state.cues.length ? <EmptyState onImport={() => setImportDialog(true)} /> : <TaskList tasks={tasks} cueCount={(task) => cuesForLearningTask(state.cues, task).length} onStudyCue={startCueStudy} onComplete={completeTask} onPostpone={postponeTask} onCancel={cancelTask} didaAccount={selectedDidaAccount} sendingTaskKey={sendingTaskKey} onSendToDida={sendToDida} />}</section>
        <aside className="min-w-0"><div className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--muted-foreground)]">Timeline</p><h2 className="mt-1 text-xl font-semibold">今日课表</h2></div>{state.timetable && <span className="max-w-40 truncate rounded-full bg-black/5 px-3 py-1.5 text-xs text-[var(--muted-foreground)] dark:bg-white/10">{state.timetable.name}</span>}</div>{state.settings.mode === 'holiday' ? <div className="mt-6 rounded-2xl bg-amber-50 p-5 text-sm leading-6 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"><span className="material-icons-round mr-2 align-middle">beach_access</span>假日模式已暂停课程表、每日课程复习和自动预习。已到期的间隔复习与手动任务仍会保留。</div> : todaySessions.length ? <div className="relative mt-6 space-y-1 before:absolute before:bottom-3 before:left-[4.4rem] before:top-3 before:w-px before:bg-[var(--card-border)]">{todaySessions.map((session, index) => { const active = activeSession === session; return <div key={`${session.course.id}-${session.day}-${session.start}-${index}`} className={`relative grid grid-cols-[3.4rem_1.5rem_minmax(0,1fr)] items-start gap-2 rounded-2xl p-2.5 ${active ? 'bg-blue-50 dark:bg-blue-950/40' : ''}`}><div className="pt-1 text-right font-mono text-xs font-semibold"><span>{session.start}</span><span className="mt-1 block text-[10px] font-normal text-[var(--muted-foreground)]">{session.end}</span></div><div className="relative z-10 mt-1.5 grid h-4 w-4 place-items-center rounded-full border-4 border-[var(--card)]" style={{ backgroundColor: session.course.color }}>{active && <span className="absolute h-6 w-6 animate-ping rounded-full opacity-20" style={{ backgroundColor: session.course.color }} />}</div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-semibold">{session.course.shortName ?? session.course.name}</p>{active && <span className="rounded-full bg-[var(--brand)] px-2 py-0.5 text-[10px] font-semibold text-white dark:text-[#202124]">正在上课</span>}</div>{(session.location || session.teacher) && <p className="mt-1 truncate text-xs text-[var(--muted-foreground)]">{[session.location, session.teacher].filter(Boolean).join(' · ')}</p>}</div></div>; })}</div> : <div className="mt-6 rounded-2xl border border-dashed border-[var(--card-border)] px-4 py-10 text-center text-sm text-[var(--muted-foreground)]">这一天没有课程。</div>}{(activeSession || nextSession) && state.settings.mode === 'term' && <div className="mt-5 rounded-2xl bg-[#202124] p-4 text-white"><p className="text-[11px] uppercase tracking-[.12em] text-white/60">{activeSession ? 'Now' : 'Next'}</p><p className="mt-1 font-semibold">{(activeSession ?? nextSession)?.course.shortName ?? (activeSession ?? nextSession)?.course.name}</p><p className="mt-1 text-xs text-white/65">{activeSession ? `${activeSession.end} 下课` : `${nextSession?.start} 开始`}</p></div>}</div>
          <div className="mt-5 rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5"><h2 className="font-semibold">StudyGuide 提醒</h2><div className="mt-3 space-y-3 text-sm leading-6 text-[var(--muted-foreground)]"><p><span className="mr-2 font-semibold text-[var(--brand)]">每日</span>下一日 Cue Recall；每条 Cue 独立记录 √ / △ / ○。</p><p><span className="mr-2 font-semibold text-teal-600">Friday</span>检查 Notes → 对照资料补缺口 → 补 Cue。</p><p><span className="mr-2 font-semibold text-amber-600">Weekend</span>闭卷 Retrieval → Evidence Review → Targeted Repair。</p></div><Link href="/study-guide?tab=learn&subTab=review" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[var(--brand)]">打开完整方法<span className="material-icons-round text-base">arrow_forward</span></Link></div>
          {personalIeltsPlan && <div className="mt-5 rounded-3xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-5 dark:border-blue-900 dark:from-blue-950/40 dark:to-indigo-950/30"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.12em] text-blue-700 dark:text-blue-200">Private · Admin</p><h2 className="mt-1 font-semibold">IELTS 备考计划 v5</h2></div><span className="material-icons-round text-blue-600">lock</span></div><p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">每周 Listening、Reading、Writing、Speaking、Weekly Review 五个弹性模块；默认分散到周一至周五，也可按需顺延，每次最多 60 分钟。</p><button type="button" onClick={addIeltsWeek} className="mt-4 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white">加入本周五个模块</button></div>}
        </aside>
      </div>}

      {view === 'week' && <section className="mt-5 overflow-x-auto rounded-3xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--card-border)] p-5"><div><p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--muted-foreground)]">Week</p><h2 className="mt-1 text-xl font-semibold">{formatShortDate(week[0])} — {formatShortDate(week[6])}</h2></div><p className="text-sm text-[var(--muted-foreground)]">课程和学习任务会一起显示</p></div>{!state.timetable && !state.manualTasks.length && !state.cues.length ? <div className="p-5"><EmptyState onImport={() => setImportDialog(true)} /></div> : <div className="grid min-w-[980px] grid-cols-7 divide-x divide-[var(--card-border)] overflow-x-auto">{week.map((day, index) => { const daySessions = state.settings.mode === 'term' ? sessionsForDate(state.timetable, day) : []; const dayTasks = tasksForDate(state, day); const key = dateKey(day); return <button key={key} type="button" onClick={() => { setSelectedDate(key); setView('today'); }} className={`min-h-[520px] p-3 text-left hover:bg-black/[.02] dark:hover:bg-white/[.03] ${key === todayKey ? 'bg-blue-50/70 dark:bg-blue-950/20' : ''}`}><div className="text-center"><p className={`text-xs font-semibold ${key === todayKey ? 'text-[var(--brand)]' : 'text-[var(--muted-foreground)]'}`}>周{WEEKDAY_LABELS[index]}</p><span className={`mt-1 inline-grid h-8 w-8 place-items-center rounded-full text-sm font-semibold ${key === todayKey ? 'bg-[var(--brand)] text-white dark:text-[#202124]' : ''}`}>{day.getDate()}</span></div><div className="mt-4 space-y-2">{daySessions.map((session, sessionIndex) => <div key={`${session.course.id}-${session.start}-${sessionIndex}`} className="rounded-xl border-l-4 bg-black/[.035] p-2.5 dark:bg-white/[.06]" style={{ borderLeftColor: session.course.color }}><p className="text-[11px] font-semibold">{session.start}–{session.end}</p><p className="mt-1 line-clamp-2 text-xs font-medium leading-5">{session.course.shortName ?? session.course.name}</p>{session.location && <p className="mt-1 truncate text-[10px] text-[var(--muted-foreground)]">{session.location}</p>}</div>)}{dayTasks.slice(0, 5).map((task) => <div key={task.key} className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-2.5"><span className="text-[10px] font-semibold text-[var(--brand)]">{TYPE_META[task.type].label}</span><p className="mt-1 line-clamp-2 text-xs font-medium leading-5">{task.title}</p></div>)}{!daySessions.length && !dayTasks.length && <p className="pt-8 text-center text-xs text-[var(--muted-foreground)]">{state.settings.mode === 'holiday' ? '假日模式' : '无安排'}</p>}{dayTasks.length > 5 && <p className="text-center text-[10px] text-[var(--muted-foreground)]">另有 {dayTasks.length - 5} 项</p>}</div></button>; })}</div>}</section>}

      {view === 'cue' && <CueStudyDashboard cues={state.cues} draft={state.cueStudyDraft} onStart={startSpecialCueStudy} onResume={() => { if (state.cueStudyDraft) setCueStudyTask(state.cueStudyDraft.task); }} onDiscard={() => { if (!window.confirm('确定放弃这次尚未完成的 Cue 学习进度吗？已完成的判定不会写入学习记录。')) return; setState((current) => ({ ...current, cueStudyDraft: undefined })); setNotice('未完成的 Cue 学习进度已放弃。'); }} />}

      {view === 'records' && <div className="mt-5"><LearningRecordsView records={state.learningRecords} catalog={state.learningCatalog} reminders={state.settings.recordReminderEnabled ? state.learningReminders : []} defaultMode={state.settings.defaultRecordView} aiBusyId={aiReportBusyId} onGenerateAi={generateAiReport} /></div>}

      {view === 'settings' && <div className="mt-5 grid gap-5 lg:grid-cols-2"><section className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6"><p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--muted-foreground)]">Mode</p><h2 className="mt-1 text-xl font-semibold">运行模式</h2><div className="mt-5 grid gap-3 sm:grid-cols-2"><button type="button" onClick={() => setState((current) => ({ ...current, settings: { ...current.settings, mode: 'term' } }))} aria-pressed={state.settings.mode === 'term'} className={`rounded-2xl border p-4 text-left ${state.settings.mode === 'term' ? 'border-[var(--brand)] bg-blue-50 dark:bg-blue-950/30' : 'border-[var(--card-border)]'}`}><span className="material-icons-round text-[var(--brand)]">school</span><strong className="ml-2">学期模式</strong><p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">显示课程，并生成已选科目的每日复习和周末集中复习。</p></button><button type="button" onClick={() => setState((current) => ({ ...current, settings: { ...current.settings, mode: 'holiday' } }))} aria-pressed={state.settings.mode === 'holiday'} className={`rounded-2xl border p-4 text-left ${state.settings.mode === 'holiday' ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30' : 'border-[var(--card-border)]'}`}><span className="material-icons-round text-amber-600">beach_access</span><strong className="ml-2">假日模式</strong><p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">暂停课程相关自动任务，保留到期复习、专项、考试和待办。</p></button></div><div className="mt-5 space-y-4 border-t border-[var(--card-border)] pt-5"><label className="flex items-center justify-between gap-4"><span><strong className="text-sm">可选预习提示（默认关闭）</strong><span className="mt-1 block text-xs text-[var(--muted-foreground)]">只有你主动开启时才会自动生成；也可在“添加任务”中单独添加预习。</span></span><input type="checkbox" checked={state.settings.previewEnabled} onChange={(event) => setState((current) => ({ ...current, settings: { ...current.settings, previewEnabled: event.target.checked, previewPreferenceSet: true } }))} className="h-5 w-5 accent-[var(--brand)]" /></label><label className="flex items-center justify-between gap-4"><span><strong className="text-sm">周末集中复习日</strong><span className="mt-1 block text-xs text-[var(--muted-foreground)]">每周只生成一次集中复习。</span></span><select value={state.settings.weekendReviewDay} onChange={(event) => setState((current) => ({ ...current, settings: { ...current.settings, weekendReviewDay: Number(event.target.value) as 6 | 7 } }))} className="rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm"><option value={6}>周六</option><option value={7}>周日</option></select></label></div></section>
        <section className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6"><p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--muted-foreground)]">Timetable</p><div className="flex items-start justify-between gap-3"><div><h2 className="mt-1 text-xl font-semibold">课表、同步与隐私</h2><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">数据优先保存在浏览器；登录后，课表、复习状态、内容、问题、备注和下次复习日期会同步到你的账号。每位用户只能读取自己的数据。</p></div><span className="material-icons-round text-emerald-600">lock</span></div><div className="mt-5 rounded-2xl bg-black/[.035] p-4 dark:bg-white/[.06]"><p className="font-semibold">{state.timetable?.name ?? '尚未导入课表'}</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">{state.timetable ? `${state.timetable.courses.length} 门课程 · ${state.timetable.courses.reduce((total, course) => total + course.sessions.length, 0)} 个时段` : '导入后可单独选择哪些科目需要课程复习。'}</p></div><div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={() => setImportDialog(true)} className="rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white dark:text-[#202124]">导入或替换</button><Link href="/timetable-hub" className="rounded-full border border-[var(--card-border)] px-4 py-2 text-sm font-medium">高级排程编辑器</Link><Link href="/control/focus" className="rounded-full border border-[var(--card-border)] px-4 py-2 text-sm font-medium">旧版专注执行</Link></div>{state.timetable && <div className="mt-5 border-t border-[var(--card-border)] pt-5"><p className="text-sm font-semibold">生成每日复习的科目</p><div className="mt-3 space-y-2">{state.timetable.courses.map((course) => <label key={course.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-black/[.025] dark:hover:bg-white/[.04]"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: course.color }} /><span className="min-w-0 flex-1 truncate text-sm">{course.name}</span><input type="checkbox" checked={course.review} onChange={(event) => setState((current) => current.timetable ? { ...current, timetable: { ...current.timetable, courses: current.timetable.courses.map((item) => item.id === course.id ? { ...item, review: event.target.checked } : item) } } : current)} className="h-5 w-5 accent-[var(--brand)]" /></label>)}</div></div>}</section>
        <section className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6"><p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--muted-foreground)]">Learning taxonomy</p><h2 className="mt-1 text-xl font-semibold">学科、大单元与资料位置</h2><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">统一配置学科 → 大单元，不再要求填写小章节。可随时手动增删改，也可导出当前 JSON 后一次批量修改；资料位置是自由文本，例如 Textbook 1.2、Notebook P18。</p><button type="button" onClick={() => setCatalogDialog(true)} className="mt-4 rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white dark:text-[#202124]">手动编辑 / AI 批量修改 / JSON 导入</button><div className="mt-4 space-y-3">{state.learningCatalog.map((subject) => <div key={subject.id} className="rounded-2xl bg-black/[.035] p-4 dark:bg-white/[.06]"><div className="flex justify-between gap-3"><strong>{subject.name}</strong><span className="text-xs text-[var(--muted-foreground)]">{subject.units.length} 个大单元</span></div><div className="mt-2 flex flex-wrap gap-1.5">{Object.entries(subject.materialProgress).map(([code, progress]) => <span key={code} className="rounded-full bg-[var(--card)] px-2.5 py-1 text-xs"><strong>{code}</strong> · {progress}</span>)}{!Object.keys(subject.materialProgress).length && <span className="text-xs text-[var(--muted-foreground)]">暂无资料位置</span>}</div></div>)}</div></section>
        <section className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6"><p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--muted-foreground)]">Records & reminders</p><h2 className="mt-1 text-xl font-semibold">记录、Cue 与提醒偏好</h2><div className="mt-5 space-y-4"><label className="flex items-center justify-between gap-3 text-sm"><span><strong>默认学习记录视图</strong><small className="mt-1 block text-[var(--muted-foreground)]">打开学习记录时优先显示的方式</small></span><select value={state.settings.defaultRecordView} onChange={(event) => setState((current) => ({ ...current, settings: { ...current.settings, defaultRecordView: event.target.value as 'calendar' | 'subjects' } }))} className="rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2"><option value="calendar">日历记录</option><option value="subjects">各科记录</option></select></label><label className="flex items-center justify-between gap-3 text-sm"><span><strong>显示已稳定 Cue</strong><small className="mt-1 block text-[var(--muted-foreground)]">关闭后 Cue 工作台只聚焦未验证、△和○</small></span><input type="checkbox" checked={state.settings.cueShowMastered} onChange={(event) => setState((current) => ({ ...current, settings: { ...current.settings, cueShowMastered: event.target.checked } }))} className="h-5 w-5 accent-[var(--brand)]" /></label><label className="flex items-center justify-between gap-3 text-sm"><span><strong>学习记录提醒</strong><small className="mt-1 block text-[var(--muted-foreground)]">在记录页显示到期提醒</small></span><input type="checkbox" checked={state.settings.recordReminderEnabled} onChange={(event) => setState((current) => ({ ...current, settings: { ...current.settings, recordReminderEnabled: event.target.checked } }))} className="h-5 w-5 accent-[var(--brand)]" /></label><label className="flex items-center justify-between gap-3 text-sm"><span><strong>默认提醒时间</strong></span><input type="time" value={state.settings.recordReminderTime} onChange={(event) => setState((current) => ({ ...current, settings: { ...current.settings, recordReminderTime: event.target.value } }))} className="rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2" /></label></div><div className="mt-5 border-t border-[var(--card-border)] pt-5"><h3 className="text-sm font-semibold">新增提醒</h3><div className="mt-3 grid gap-2 sm:grid-cols-3"><input value={reminderTitle} onChange={(event) => setReminderTitle(event.target.value)} placeholder="例如：复查 Mechanics Cue" className="rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm" /><input type="date" value={reminderDate} onChange={(event) => setReminderDate(event.target.value)} className="rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm" /><select value={reminderSubjectId} onChange={(event) => setReminderSubjectId(event.target.value)} className="rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm"><option value="">不限定科目</option>{state.learningCatalog.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></div><button type="button" disabled={!reminderTitle.trim() || !reminderDate} onClick={() => { setState((current) => ({ ...current, learningReminders: [...current.learningReminders, { id: taskId(), title: reminderTitle.trim().slice(0, 160), date: reminderDate, ...(reminderSubjectId ? { subjectId: reminderSubjectId } : {}), completed: false }] })); setReminderTitle(''); setReminderDate(''); setReminderSubjectId(''); }} className="mt-3 rounded-full border border-[var(--card-border)] px-4 py-2 text-sm font-semibold disabled:opacity-40">添加提醒</button><div className="mt-3 space-y-2">{state.learningReminders.map((reminder) => <div key={reminder.id} className="flex items-center gap-2 rounded-xl bg-black/[.035] px-3 py-2 text-sm dark:bg-white/[.06]"><input type="checkbox" checked={reminder.completed} onChange={(event) => setState((current) => ({ ...current, learningReminders: current.learningReminders.map((item) => item.id === reminder.id ? { ...item, completed: event.target.checked } : item) }))} className="h-4 w-4 accent-[var(--brand)]" /><span className={`min-w-0 flex-1 ${reminder.completed ? 'line-through opacity-60' : ''}`}>{reminder.title}</span><span className="text-xs text-[var(--muted-foreground)]">{reminder.date} · {state.settings.recordReminderTime}</span><button type="button" onClick={() => setState((current) => ({ ...current, learningReminders: current.learningReminders.filter((item) => item.id !== reminder.id) }))} className="text-[var(--muted-foreground)] hover:text-rose-600"><span className="material-icons-round text-lg">delete</span></button></div>)}</div></div></section>
      </div>}

      {cueStudyTask && state.cueStudyDraft && <CueStudyPage task={cueStudyTask} cues={cueStudyCues} draft={state.cueStudyDraft} onProgress={saveCueStudyProgress} onClose={() => { setCueStudyTask(null); setNotice('Cue 学习进度已自动保存，可随时恢复。'); }} onComplete={(details, evidence) => submitReview(cueStudyTask, details, evidence)} />}
      {reviewTask && <ReviewDialog task={reviewTask} cues={reviewCues} catalog={state.learningCatalog} signedIn={signedIn} onClose={() => setReviewTask(null)} onComplete={(details, evidence) => submitReview(reviewTask, details, evidence)} />}
      {taskDialog && <TaskDialog date={selectedDate} cues={state.cues} catalog={state.learningCatalog} onClose={() => setTaskDialog(false)} onSave={(task) => { setState((current) => ({ ...current, manualTasks: [...current.manualTasks, task] })); setTaskDialog(false); setNotice('任务已添加。'); }} />}
      {cueManager && <CueManagerDialog cues={state.cues} reviews={state.cueReviews} catalog={state.learningCatalog} showMastered={state.settings.cueShowMastered} onClose={() => setCueManager(false)} onChange={(cues, learningCatalog) => setState((current) => ({ ...current, cues, ...(learningCatalog ? { learningCatalog } : {}) }))} />}
      {importDialog && <ImportDialog onClose={() => setImportDialog(false)} onApply={(timetable) => { setState((current) => reconcileScheduleSubjects({ ...current, timetable, importedAt: new Date().toISOString() })); setImportDialog(false); setNotice(signedIn ? '课表已导入；匹配的学习科目已自动合并，正在同步到账号。' : '课表已导入；匹配的学习科目已自动合并。'); }} />}
      {catalogDialog && <LearningCatalogDialog current={state.learningCatalog} onClose={() => setCatalogDialog(false)} onApply={(subjects) => { if (!window.confirm('保存新的学科分类配置吗？系统会按关键词合并课表科目引用；现有学习记录和 Cue 不会删除。')) return; setState((current) => reconcileScheduleSubjects({ ...current, learningCatalog: subjects })); setCatalogDialog(false); setNotice('学科分类已保存；课表科目、复习进度和记录已自动归并。'); }} />}
      <Notice message={notice} />
    </div>
  );
}
