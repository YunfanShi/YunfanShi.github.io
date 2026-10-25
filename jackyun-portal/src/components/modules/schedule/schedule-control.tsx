'use client';

import { searchCues, cueHighlightParts, type CueSearchHit } from '@/lib/learning/cue-search';
import ScheduleTouchNav from './schedule-touch-nav';

import { readScheduleState, SCHEDULE_STORAGE_KEY } from '@/lib/learning/workspace-reader';
import { siteConfirm, isSiteDialogOpen } from '@/lib/site-dialog';
import CuePracticeControls from './cue-practice-controls';
import studyLayout from './cue-study-layout.module.css';
import { useWorkspaceLayout } from '@/hooks/use-workspace-layout';
import DidaScheduleSync from './dida-schedule-sync';
import SeiueScheduleSync from './seiue-schedule-sync';
import { defaultCuePracticePolicy, cuePracticeIsDue, rescheduleCuePractice, finishAutomaticCuePractice, emptyCuePractice, latestCuePracticeAttempt, cuePracticeDirectory, cuePracticeLabel, normalizeCuePractice, cuePracticeReturnIndex, rateCuePractice, enterCuePractice, dueCuePractice } from '@/lib/learning/cue-practice';
import dynamic from 'next/dynamic';
import CueGamePanel from './cue-game-panel';
import { reconcileCueGameAccount, purchaseCueShopItem, equipCueShopItem, type CueGameAccount, type CueShopAction } from '@/lib/learning/cue-shop';
import type { CueStarFeedback } from '@/lib/learning/cue-game';
import { useCueUniverseEnabled, useCueStudyPreferences, useCueReducedMotion } from './use-cue-study-preferences';
import CueAnswerCardPanel from './cue-answer-card';
import { isCueAnswerShortcut, cueAnswerCardId, editCueAnswerCard, compareCueAnswerCard, checkCueAnswerPoint, type CueAnswerCard } from '@/lib/learning/cue-answer-card';
import CueChangeHistory from './cue-change-history';
import { createCueChangeRecord, type CueChangeRecord, type CueChangeSource } from '@/lib/learning/cue-change-history';
import { MemoryCueImportDialog } from './memory-cue-import-dialog';

import FullscreenButton from '@/components/layout/fullscreen-button';
import styles from './schedule-control.module.css';
import universeStyles from './cue-game-layout.module.css';
import MobileCueCard from './mobile-cue-card';
import QuestionBankManager from './question-bank-manager';
import { cueExportOperations, cueImportPrompt, downloadStudyJson } from '@/lib/learning/study-prompts';
import StudyInsights from './study-insights';
import ClassTimeline from './class-timeline';
import CueEntryPreview from './cue-entry-preview';
import LearningCompletion, { type LearningCompletionData } from './learning-completion';
import { addCueBudgetTask } from '@/lib/learning/cue-budget';
import { summarizeLearningCompletion } from '@/lib/learning/learning-completion';
import ScheduleGuide from './schedule-guide';
import TimedPracticePanel from './timed-practice-panel';
import ExamDiagnosisPanel from './exam-diagnosis-panel';
import LearningAssistant, { CueDifficultyPicker } from './learning-assistant';
import { difficultyLabels, effectiveCueDifficulty, type CueDifficulty } from '@/lib/learning/learning-assistance';
import { DEFAULT_STUDY_FILTER, jointCueSubjectName, legacyCueStudyDraft } from '@/lib/learning/joint-cue-study';
import LearningWorkspace, { LearningSession, estimatedStudyMinutes } from './learning-workspace';
import { QUESTION_BANK_KEY, buildStudyQueue, emptyQuestionBank, itemKey, questionReviewTasks, readQuestionBank, reconcileQuestionSubjects, reconcileStudyDraft, recordQuestionAttempt, type QuestionBankState, type StudyDraft, type StudyItemRef, type StudyMode } from '@/lib/learning/question-bank';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuthMode } from '@/components/auth/auth-mode-provider';
import LearningRecordsView from '@/components/modules/schedule/learning-records-view';
import LatexRenderer from '@/components/modules/latex-renderer';
import { parseAiJson, readAiResponseContent } from '@/lib/ai-json';
import { parseLocalValue, createLocalEditWriter, LOCAL_CONFLICT_PREFIX } from '@/lib/sync/local-edit';
import { threeWayMerge } from '@/lib/sync/merge';
import { canonicalJson } from '@/lib/sync/hash';
import { CLOUD_STATE_APPLIED_EVENT } from '@/lib/local-workspace';
import { scheduleHasContent } from '@/lib/sync/schedule-safety';
import { cueRatingDestination } from '@/lib/schedule/cue-study-navigation';
import { Button } from '@/components/ui/button';
import { didaSourceKey, type DidaAccountView } from '@/lib/integrations/dida365';
import { cueSimilarityTermKey, differentCuePair, findSimilarCuePairs, reopenCuePair, unreviewedCuePairs, type CueSimilarityDecision } from '@/lib/learning/cue-similarity';
import { splitMathText } from '@/lib/latex-text';
import {
  applyCueBulkOperations,
  applyTemporaryTimetableUpdate,
  changeTimetableImportRole,
  applyTimetableUpdate,
  allCueStudyDrafts,
  cueCollectionSummaryForSubject,
  isCueCollectionBatch,
  isRecordedCueCollectionBatch,
  applyCueUnitMappings,
  cancelLearningTask,
  completeLearningSession,
  completeLearningSubtask,
  cuesForLearningTask,
  createEmptyScheduleState,
  addCalendarDays,
  dateFromKey,
  dateKey,
  deriveLearningStatus,
  cueActivityTag,
  cueMatchesStatusFilter,
  learningCatalogImportTemplate,
  LEARNING_MATERIALS,
  LEARNING_TASK_PRESETS,
  matchLearningCatalogSubject,
  mergeLearningCatalog,
  mergeLearningCatalogUnits,
  nextCueCollectionReminderDate,
  parseLearningCatalogImport,
  parseLearningUnitOutline,
  parseCueBulkImport,
  recordCueStudyAssessment,
  markCueMastered,
  isCueMasteryPaused,
  recalculateLegacyCueSchedules,
  removeCueStudyDraft,
  reorderCueStudy,
  saveCueStudyDraft,
  shuffleCueIds,
  preservedReviewCourseIds,
  postponeLearningTask,
  reconcileScheduleSubjects,
  rollOverManualTasks,
  sessionsForDate,
  tasksForDate,
  toggleCueIds,
  timetableImportTemplate,
  updateSubjectMaterialProgress,
  weekDates,
  withReviewCourseSelection,
  type LearningStatus,
  type CueStatusFilter,
  type CueAssessment,
  type CueBulkOperation,
  type CueCreateOperation,
  type CueCollectionUpdate,
  type CueDisplayPreset,
  type CueMemo,
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
const StandaloneCueShop = dynamic(() => import('./cue-star-shop'), { ssr: false });

const STORAGE_KEY = SCHEDULE_STORAGE_KEY;
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
      <span aria-hidden="true" className="material-icons-round text-4xl text-[var(--brand)]">calendar_month</span>
      <h3 className="mt-3 text-base font-semibold">先导入一份课表</h3>
      <p className="mt-1 max-w-md text-sm leading-6 text-[var(--muted-foreground)]">支持规则 JSON 和 AI 文本识别。课表不会被写进网站代码；普通 JSON 在本机解析，登录后学习状态会随账号同步。</p>
      <button type="button" onClick={onImport} className="mt-5 rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white dark:text-[#202124]">导入课表</button>
    </div>
  );
}

function CueEvidence({ cue }: { cue: StudyCue }) {
  return <><p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--brand)]">Evidence</p>{cue.answer && <div className="mt-3 text-base leading-7"><LatexRenderer content={cue.answer} /></div>}{cue.markingPoints.length > 0 && <ul className="mt-4 space-y-2 text-sm leading-6 text-[var(--muted-foreground)]">{cue.markingPoints.map((point) => <li key={point} className="flex gap-2"><span className="text-[var(--brand)]">•</span><LatexRenderer content={point} /></li>)}</ul>}{!cue.answer && !cue.markingPoints.length && <p className="mt-3 text-sm text-[var(--muted-foreground)]">这条 Cue 暂无参考答案或 marking points，请按自己的笔记核对。</p>}</>;
}

function cueRevisionLabel(cue: StudyCue): string {
  const updated = new Date(cue.updatedAt);
  const updatedDate = Number.isNaN(updated.getTime()) ? dateKey(new Date()) : dateKey(updated);
  return `v${Math.max(1, Math.floor(cue.version ?? 1))} · ${updatedDate.slice(2)}`;
}

const CUE_ACTIVITY_META = {
  new: { label: '✨ 新 CUE', tone: 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-200' },
  updated: { label: '🆕 有更新', tone: 'bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-200' },
  due: { label: '⏰ 待复习', tone: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200' },
  focus: { label: '🎯 重点练', tone: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-200' },
  building: { label: '🌱 巩固中', tone: 'bg-lime-100 text-lime-800 dark:bg-lime-950/60 dark:text-lime-200' },
  streak: { label: '🔥 连续通过', tone: 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-200' },
  reviewed: { label: '✓ 已学习', tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-200' },
} satisfies Record<ReturnType<typeof cueActivityTag>, { label: string; tone: string }>;

function CueActivityBadge({ cue }: { cue: StudyCue }) {
  const tag = cueActivityTag(cue, dateKey(new Date()));
  const meta = CUE_ACTIVITY_META[tag];
  const label = tag === 'streak' ? `${meta.label} ${cue.streak}` : meta.label;
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${meta.tone}`}>{label}</span>;
}

function CueStatusPill({ status }: { status: LearningStatus | null | undefined }) {
  const label = status === 'stable' ? '√ 通过' : status === 'partial' ? '△ 部分通过' : status === 'unclear' ? '○ 未通过' : status === undefined ? '旧状态未记录' : '未判定';
  const tone = status === 'stable' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
    : status === 'partial' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200'
      : status === 'unclear' ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-200'
        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200';
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{label}</span>;
}

function CueStatusHistory({ previous, current }: { previous: LearningStatus | null | undefined; current?: LearningStatus }) {
  return <span className="inline-flex flex-wrap items-center gap-1.5"><span className="text-[11px] text-[var(--muted-foreground)]">上次</span><CueStatusPill status={previous} /><span aria-hidden="true" className="mx-0.5 h-px w-4 bg-[var(--muted-foreground)]/50" /><span className="text-[11px] text-[var(--muted-foreground)]">本次</span>{current ? <CueStatusPill status={current} /> : <span className="text-xs text-[var(--muted-foreground)]">尚未评价</span>}</span>;
}

function CuePromptContent({ cue, revealed, selectedChoice, onReveal, onChoice }: { cue: StudyCue; revealed: boolean; selectedChoice?: number; onReveal: () => void; onChoice: (index: number) => void }) {
  const definitionCard = cue.type === 'definition' || cue.display === 'definition-card';
  const multipleChoice = cue.type === 'multiple-choice' || cue.display === 'multiple-choice';
  if (definitionCard) {
    const faceClass = 'col-start-1 row-start-1 flex min-h-[280px] sm:min-h-[390px] w-full flex-col items-center justify-center overflow-y-auto rounded-[32px] border border-[var(--card-border)] bg-[var(--card)] p-5 sm:p-8 text-center shadow-xl [backface-visibility:hidden]';
    return <section data-cue-definition className="my-auto py-5 sm:py-8"><button type="button" onClick={onReveal} aria-label={revealed ? '翻到题目面' : '翻到定义面'} aria-pressed={revealed} className="mx-auto block min-h-[280px] sm:min-h-[390px] w-full max-w-4xl [perspective:1200px]"><span className={`relative grid min-h-[280px] sm:min-h-[390px] w-full transition-transform duration-500 [transform-style:preserve-3d] motion-reduce:transition-none ${revealed ? '[transform:rotateY(180deg)]' : ''}`}><span aria-hidden={revealed} className={faceClass}><span className="text-xs font-bold uppercase tracking-[.16em] text-[var(--muted-foreground)]">Definition · 正面</span><span className="mt-8 text-3xl font-bold leading-tight sm:text-5xl"><LatexRenderer content={cue.prompt} /></span>{cue.subtitle && <span className="mt-4 text-sm font-normal leading-6 text-[var(--muted-foreground)]"><LatexRenderer content={cue.subtitle} /></span>}<span className="mt-auto pt-8 text-xs text-[var(--muted-foreground)]">空格 / Enter 或点击翻面</span></span><span aria-hidden={!revealed} className={`${faceClass} [transform:rotateY(180deg)]`}><span className="w-full text-left"><CueEvidence cue={cue} /></span></span></span></button></section>;
  }
  if (multipleChoice) {
    return <section className="my-auto py-8"><article className="mx-auto max-w-4xl rounded-[32px] border border-[var(--card-border)] bg-[var(--card)] p-7 shadow-lg"><p className="text-xs font-bold uppercase tracking-[.14em] text-[var(--brand)]">类型选择 · 点击选项作答；1 / 2 / 3 快速自评</p><div className="my-7 text-center text-2xl font-bold leading-relaxed sm:text-4xl"><LatexRenderer content={cue.prompt} /></div>{cue.subtitle && <div className="mb-6 text-center text-sm leading-6 text-[var(--muted-foreground)]"><LatexRenderer content={cue.subtitle} /></div>}<div className="space-y-3">{(cue.choices ?? []).map((choice, choiceIndex) => { const correct = choiceIndex === cue.correctChoice; const chosen = choiceIndex === selectedChoice; return <button key={`${choiceIndex}-${choice}`} type="button" disabled={revealed} onClick={() => onChoice(choiceIndex)} className={`w-full rounded-2xl border-2 p-4 text-left text-sm ${revealed && correct ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200' : revealed && chosen ? 'border-rose-500 bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200' : 'border-[var(--card-border)] hover:border-[var(--brand)]'}`}><kbd className="mr-3 rounded bg-[var(--background)] px-2 py-1 text-xs">{choiceIndex + 1}</kbd><LatexRenderer content={choice} /></button>; })}</div>{revealed && <div className="mt-5 rounded-2xl bg-black/[.035] p-4 text-left dark:bg-white/[.06]"><p className={`font-semibold ${selectedChoice === cue.correctChoice ? 'text-emerald-700 dark:text-emerald-200' : 'text-rose-700 dark:text-rose-200'}`}>{selectedChoice === undefined ? '已显示正确选项，请核对自评。' : selectedChoice === cue.correctChoice ? '选择正确' : '选择错误；正确选项已标出。'}</p>{cue.markingPoints.length > 0 && <div className="mt-2"><CueEvidence cue={{ ...cue, answer: undefined }} /></div>}</div>}</article></section>;
  }
  return <section data-cue-recall className="my-auto py-10 text-center"><p className="text-xs font-semibold uppercase tracking-[.14em] text-[var(--muted-foreground)]">Recall prompt</p><div className={`mx-auto mt-5 max-w-4xl font-semibold leading-relaxed ${(cue.display ?? 'standard') === 'headline' || (cue.display ?? 'standard') === 'formula' ? 'text-3xl sm:text-5xl' : 'text-2xl sm:text-4xl'}`}><LatexRenderer content={cue.prompt} /></div>{cue.subtitle && <div className="mx-auto mt-4 max-w-3xl text-sm font-normal leading-6 text-[var(--muted-foreground)] sm:text-base"><LatexRenderer content={cue.subtitle} /></div>}{revealed ? <div data-cue-evidence className="mx-auto mt-10 max-w-3xl rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6 text-left shadow-sm"><CueEvidence cue={cue} /></div> : <button type="button" onClick={onReveal} className="mt-10 rounded-full bg-[var(--brand)] px-6 py-3 text-sm font-semibold text-white shadow-sm dark:text-[#202124]">显示答案与判分依据</button>}</section>;
}

function CueStudyPage({ task, cues: sourceCues, draft, memos, answerCards, onAnswerText, onAnswerCompare, onAnswerCheck, onProgress, onAssessment, onMastered, onDifficulty, reviews, starCues, starRecords, gameAccount, onShopAction, onClose, onComplete }: { gameAccount?: CueGameAccount; onShopAction?: (action: CueShopAction) => void; starCues: StudyCue[]; starRecords: LearningRecord[]; reviews: CueReview[]; onDifficulty: (id: string, difficulty?: CueDifficulty) => void; task: LearningTask; cues: StudyCue[]; draft: CueStudyDraft; memos: CueMemo[]; onProgress: (draft: CueStudyDraft) => void; onAssessment: (cueId: string, status: LearningStatus, practice?: boolean, editPractice?: boolean) => void; onMastered: (cueId: string) => void; answerCards: CueAnswerCard[]; onAnswerText: (cueId: string, text: string) => void; onAnswerCompare: (cue: StudyCue) => void; onAnswerCheck: (id: string, index: number, checked: boolean) => void; onClose: () => void; onComplete: (details: ReviewDetails, evidence: LearningSessionEvidence) => void }) {
  const deviceLayout = useWorkspaceLayout();
  const cueGameEnabled = useCueUniverseEnabled();
  const [starFeedback, setStarFeedback] = useState<CueStarFeedback>();
  const studyRef = useRef<HTMLDivElement>(null);
  const memoRef = useRef<HTMLTextAreaElement>(null);
  const [orderedCueIds, setOrderedCueIds] = useState(draft.cueIds);
  const [shuffled, setShuffled] = useState(draft.shuffled === true);
  const [hiddenCueIds, setHiddenCueIds] = useState<string[]>([...new Set([...(draft.hiddenCueIds ?? []), ...sourceCues.filter(cue => isCueMasteryPaused(cue, dateKey(new Date()))).map(cue => cue.id)])]);
  const allCues = useMemo(() => {
    const byId = new Map(sourceCues.map((cue) => [cue.id, cue]));
    const ordered = orderedCueIds.flatMap((id) => {
      const cue = byId.get(id);
      return cue ? [cue] : [];
    });
    const selected = new Set(ordered.map((cue) => cue.id));
    return [...ordered, ...sourceCues.filter((cue) => !selected.has(cue.id))];
  }, [orderedCueIds, sourceCues]);
  const cues = useMemo(() => allCues.filter((cue) => !hiddenCueIds.includes(cue.id)), [allCues, hiddenCueIds]);
  const [index, setIndex] = useState(() => Math.min(Math.max(0, draft.index), Math.max(0, sourceCues.length - 1)));
  const [revealed, setRevealed] = useState(draft.revealed);
  const [selectedChoice, setSelectedChoice] = useState<number | undefined>(draft.selectedChoice);
  const [assessments, setAssessments] = useState<Record<string, LearningStatus>>(draft.assessments);
  const [memoOpen, setMemoOpen] = useState(false);
  const [motionEnabled, setAnimations] = useState(true);
  const reducedMotion = useCueReducedMotion();
  const { cueItemMotion, cueAmbientMotion } = useCueStudyPreferences();
  const animations = motionEnabled && !reducedMotion && cueItemMotion;
  const ambientAnimations = animations && cueAmbientMotion;
  const [ratingFeedback, setRatingFeedback] = useState<LearningStatus | null>(null);
  const [studyToolsOpen, setStudyToolsOpen] = useState(false);
  const [automaticPractice, setAutomaticPractice] = useState(true);
  const [practicePolicy, setPracticePolicy] = useState(defaultCuePracticePolicy);
  const currentIndex = Math.min(index, Math.max(0, cues.length - 1));
  const batchSize = cues.length > 20 ? 20 : Math.max(1, cues.length);
  const groupCount = Math.ceil(cues.length / batchSize);
  const groupIndex = Math.floor(currentIndex / batchSize);
  const groupStart = groupIndex * batchSize;
  const groupEnd = Math.min(cues.length, groupStart + batchSize);
  const groupCues = cues.slice(groupStart, groupEnd);
  const groupAssessedCount = groupCues.filter((cue) => assessments[cue.id]).length;
  const groupComplete = groupCues.length > 0 && groupAssessedCount === groupCues.length;
  const canEnterGroup = (target: number) => target <= groupIndex || cues.slice(0, target * batchSize).every((cue) => assessments[cue.id]);
  const [practice, setPractice] = useState(() => normalizeCuePractice(draft.practice ?? emptyCuePractice(), draft.assessments, Date.now()));
  const [practiceNow, setPracticeNow] = useState(() => Date.now());
  useEffect(() => { if (!practice.pending.length) return; const timer = setInterval(() => setPracticeNow(Date.now()), 1000); return () => clearInterval(timer); }, [practice.pending.length]);
  const current = practice.active ? allCues.find((cue) => cue.id === practice.active) : practice.mode ? undefined : cues[currentIndex];
  const practiceIds = cuePracticeDirectory(practice);
  const practiceCues = allCues.filter(cue => practiceIds.includes(cue.id));
  const passedPracticeCount = Object.values(practice.results ?? {}).filter(result => result.status === 'stable').length;
  const returnToRound = () => {
    setIndex(cuePracticeReturnIndex(practice, cues.map(cue => cue.id), currentIndex));
    setPractice(state => ({ ...state, mode: false, active: undefined, rating: undefined, returnCueId: undefined }));
    setRatingFeedback(null); setRevealed(false); setSelectedChoice(undefined);
    queueMicrotask(() => studyRef.current?.focus());
  };
  const currentMemo = current ? memos.find((memo) => memo.cueId === current.id) : undefined;
  const currentAnswer = current ? answerCards.find((card) => card.id === cueAnswerCardId(draft.id, current.id)) : undefined;
  const priorStatus = current ? Object.hasOwn(draft.priorStatuses ?? {}, current.id) ? draft.priorStatuses?.[current.id] : assessments[current.id] ? undefined : current.status ?? null : null;
  const activeAssessments = useMemo(() => Object.fromEntries(allCues.flatMap((cue) => assessments[cue.id] ? [[cue.id, assessments[cue.id]]] : [])) as Record<string, LearningStatus>, [assessments, allCues]);
  const assessedCount = Object.keys(activeAssessments).length;
  const roundComplete = allCues.length > 0 && assessedCount === allCues.length;
  const savingRef = useRef(false);
  const [saveError, setSaveError] = useState('');
  const submit = useCallback(async (nextAssessments: Record<string, LearningStatus>) => {
    if (savingRef.current) return;
    savingRef.current = true; setSaveError('');
    try { await onComplete(
    { studiedContent: '', issue: '', note: '' },
    {
      subjectName: task.subjectName,
      scope: { ...(task.scope?.unit ? { unit: task.scope.unit } : {}), cueIds: allCues.map((cue) => cue.id) },
      materials: task.materials ?? [],
      cueIds: allCues.map((cue) => cue.id),
      newCues: [],
      assessments: allCues.map((cue) => ({ cueId: cue.id, status: nextAssessments[cue.id] })),
      cueReviewsAlreadyRecorded: true,
    },
  ); } catch (error) { setSaveError(error instanceof Error ? error.message : '记录保存失败，进度已保留，请重试。'); }
    finally { savingRef.current = false; }
  }, [allCues, onComplete, task]);
  const advance = useCallback((destination: number) => {
    const target = practice.active ? cuePracticeReturnIndex(practice, cues.map(cue => cue.id), destination) : destination;
    setPractice((state) => automaticPractice || state.mode ? enterCuePractice(state, Date.now(), current?.id, cues[target]?.id, state.mode, state.mode && roundComplete, practicePolicy) : { ...state, active: undefined, rating: undefined, returnCueId: undefined });
    setRatingFeedback(null); setIndex(target); setRevealed(false); setSelectedChoice(undefined);
    queueMicrotask(() => studyRef.current?.focus());
  }, [current?.id, practice, cues, roundComplete, automaticPractice, practicePolicy]);
  const rate = useCallback((status: LearningStatus, stay = false) => {
    if (!current) return;
    const saved = practice.active ? practice.rating : assessments[current.id];
    if (saved === status && stay) { setRatingFeedback(status); return; }
    if (saved === status) {
      const destination = practice.active ? currentIndex : (() => { const next = cueRatingDestination(groupCues.map((cue) => cue.id), currentIndex - groupStart, assessments, status); return next === null ? currentIndex : next + groupStart; })();
      advance(destination ?? currentIndex);
      return;
    }
    const fresh = saved === undefined;
    onAssessment(current.id, status, Boolean(practice.active), Boolean(practice.active && !fresh));
    setPractice((state) => { const rated = rateCuePractice(state, current.id, status, fresh, Date.now(), Math.random, practicePolicy); return finishAutomaticCuePractice(rated, status); });
    if (practice.active && !practice.mode && status === 'stable') { setIndex(cuePracticeReturnIndex(practice, cues.map(cue => cue.id), currentIndex)); setRevealed(false); setSelectedChoice(undefined); }
    if (!practice.active) setAssessments((previous) => ({ ...previous, [current.id]: status }));
    setRatingFeedback(status);
    setStarFeedback((previous) => ({ id: (previous?.id ?? 0) + 1, cueId: current.id, status, retrieval: fresh }));
  }, [assessments, cues, current, currentIndex, onAssessment, practice, advance, practicePolicy, groupCues, groupStart]);
  const markMastered = useCallback(async () => {
    if (!current || isSiteDialogOpen()) return;
    const id = current.id;
    if (!await siteConfirm('标记后 10 天内不再安排这条 Cue。到期再次答对后，间隔依次增加至 12、14、16、18 天；答错或内容更新后恢复正常复习。', { title: '标记为已熟练掌握？', confirmLabel: '已熟练掌握', cancelLabel: '继续练习' })) return;
    onMastered(id);
    setAssessments(previous => ({ ...previous, [id]: 'stable' }));
    setPractice(previous => ({ ...previous, pending: previous.pending.filter(item => item.cueId !== id), active: previous.active === id ? undefined : previous.active, mode: false, rating: undefined }));
    setHiddenCueIds(previous => [...new Set([...previous, id])]);
    setIndex(Math.min(currentIndex, Math.max(0, cues.length - 2))); setRevealed(false); setSelectedChoice(undefined); setRatingFeedback(null);
  }, [current, currentIndex, cues.length, onMastered]);
  const reorderStudy = (next: boolean) => {
    setShuffled(next);
    const order = reorderCueStudy(sourceCues.map((cue) => cue.id), assessments, next, practice.active ? practice.returnCueId : current?.id, Math.random, sourceCues);
    setHiddenCueIds(order.hiddenCueIds);
    setOrderedCueIds(order.cueIds);
    setRatingFeedback(null);
    setIndex(order.index);
    if (!practice.active && !order.retainedCurrent) { setRevealed(false); setSelectedChoice(undefined); }
    queueMicrotask(() => studyRef.current?.focus());
  };
  const toggleShuffle = () => reorderStudy(!shuffled);
  const move = useCallback((offset: number) => {
    if (!cues.length && !practice.active) return;
    setRatingFeedback(null);
    if (practice.active || practice.mode) { advance(practice.active ? currentIndex : Math.min(cues.length - 1, currentIndex + offset)); return; }
    if (offset > 0 && currentIndex === groupEnd - 1 && groupComplete && groupIndex < groupCount - 1) { setIndex(groupEnd); setRevealed(false); setSelectedChoice(undefined); queueMicrotask(() => studyRef.current?.focus()); return; }
    if (offset < 0 && currentIndex === groupStart && groupIndex > 0) { setIndex(groupStart - 1); setRevealed(false); setSelectedChoice(undefined); queueMicrotask(() => studyRef.current?.focus()); return; }
    setPractice((state) => ({ ...state, mode: false, active: undefined, rating: undefined, returnCueId: undefined }));
    setIndex((value) => Math.min(groupEnd - 1, Math.max(groupStart, value + offset)));
    setRevealed(false);
    setSelectedChoice(undefined);
    queueMicrotask(() => studyRef.current?.focus());
  }, [cues.length, advance, practice.active, practice.mode, currentIndex, groupStart, groupEnd, groupComplete, groupIndex, groupCount]);
  useEffect(() => {
    const shell = document.querySelector<HTMLElement>('[data-portal-shell]');
    const previousInert = shell?.inert ?? false;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    if (shell) shell.inert = true;
    document.body.style.overflow = 'hidden';
    queueMicrotask(() => studyRef.current?.focus());
    return () => {
      if (shell) shell.inert = previousInert;
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);
  useEffect(() => {
    const rail = document.querySelector('[aria-label="Cue 学习进度"]');
    const item = rail?.children[currentIndex];
    if (item instanceof HTMLElement) item.scrollIntoView({ behavior: animations && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'instant', block: 'nearest', inline: 'center' });
  }, [currentIndex, animations]);
  useEffect(() => { if (memoOpen) queueMicrotask(() => memoRef.current?.focus()); }, [index, memoOpen]);
  useEffect(() => {
    onProgress({ id: draft.id, task, cueIds: allCues.map((cue) => cue.id), index: currentIndex, revealed, ...(selectedChoice !== undefined ? { selectedChoice } : {}), assessments: activeAssessments, priorStatuses: draft.priorStatuses, startedAt: draft.startedAt, shuffled, hiddenCueIds, practice, updatedAt: new Date().toISOString() });
  }, [activeAssessments, allCues, hiddenCueIds, currentIndex, draft.id, draft.priorStatuses, draft.startedAt, onProgress, revealed, selectedChoice, shuffled, task, practice]);
  useEffect(() => {
    const onKeyDown = async (event: KeyboardEvent) => {
      if (isSiteDialogOpen()) return;
      if (event.repeat || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return;
      const editing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement;
      if (editing) {
        if (event.key === 'Escape' && memoOpen) { event.preventDefault(); setMemoOpen(false); queueMicrotask(() => studyRef.current?.focus()); }
        return;
      }
      if (event.key.toLowerCase() === 'k') { event.preventDefault(); void markMastered(); return; }
      if (isCueAnswerShortcut(event.key)) { event.preventDefault(); if (!event.repeat) { setMemoOpen((open) => !open); if (memoOpen) queueMicrotask(() => studyRef.current?.focus()); } return; }
      if (event.key === 'Escape' && memoOpen) { event.preventDefault(); setMemoOpen(false); queueMicrotask(() => studyRef.current?.focus()); return; }
      if (event.key === 'Backspace') { event.preventDefault(); if ((await siteConfirm('确定结束这次 Cue 学习吗？当前进度已经自动保存。'))) onClose(); return; }
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); move(-1); }
      else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); move(1); }
      else if (event.key === 'Enter') { event.preventDefault(); if ((await siteConfirm('确定退出这次 Cue 学习吗？当前进度已经自动保存。'))) onClose(); }
      else if (event.key === ' ' && current?.type !== 'multiple-choice' && !(event.target instanceof HTMLButtonElement)) { event.preventDefault(); setRevealed((value) => !value); }
      else if ((event.key === '1' || event.key.toLowerCase() === 'c')) { event.preventDefault(); rate('stable', !revealed); if (!revealed) setRevealed(true); }
      else if ((event.key === '2' || event.key.toLowerCase() === 'p')) { event.preventDefault(); rate('partial', !revealed); if (!revealed) setRevealed(true); }
      else if ((event.key === '3' || event.key.toLowerCase() === 'x')) { event.preventDefault(); rate('unclear', !revealed); if (!revealed) setRevealed(true); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [current, memoOpen, move, onClose, rate, revealed, markMastered]);
  return createPortal(
    <div ref={studyRef} tabIndex={-1} data-responsive-study data-animations={animations} data-cue-universe={cueGameEnabled} className={`${styles.studyOverlay} ${universeStyles.session} ${studyLayout.session} fixed inset-0 z-[150] overflow-x-hidden overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)] bg-[var(--background)] outline-none`} role="dialog" aria-modal="true" aria-labelledby="cue-study-title">
      <div className={`${styles.studyWorkspace} ${studyLayout.workspace}`}>
      <header className={`${styles.studyHeader} sticky top-0 z-10 border-b border-[var(--card-border)] bg-[color-mix(in_srgb,var(--background)_92%,transparent)] px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-xl sm:px-8 sm:py-4`}>
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 sm:gap-4"><button type="button" onClick={onClose} aria-label="退出 Cue 学习并保存进度" className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"><span aria-hidden="true" className="material-icons-round">arrow_back</span></button><div className="min-w-0 flex-1"><p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--brand)]">Cue Study · 自动保存</p><h1 id="cue-study-title" className="break-words text-sm font-semibold sm:text-lg">{task.title}</h1></div><button type="button" onClick={toggleShuffle} aria-pressed={shuffled} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${shuffled ? 'border-[var(--brand)] bg-blue-50 text-[var(--brand)] dark:bg-blue-950/40' : 'border-[var(--card-border)]'}`}><span aria-hidden="true" className="material-icons-round mr-1 align-middle text-base">shuffle</span>{shuffled ? "乱序已开启" : "开启乱序"}</button><CuePracticeControls automatic={automaticPractice} policy={practicePolicy} onAutomatic={value => { setAutomaticPractice(value); if (!value && practice.active && !practice.mode) returnToRound(); }} onPolicy={value => { setPracticePolicy(value); setPractice(state => rescheduleCuePractice(state, Date.now(), value)); }} /><span className="text-sm font-semibold">{practice.mode ? `到期重练 · ${passedPracticeCount} / ${practiceIds.length} 已通过` : (cues.length || practice.active) ? `${practice.active ? "间隔重练 · " : ""}${practice.active ? allCues.findIndex((cue) => cue.id === practice.active) + 1 : Math.min(index + 1, cues.length)} / ${allCues.length}` : '0 / 0'}</span><button type="button" aria-label="学习工具和题目目录" aria-expanded={studyToolsOpen} onClick={() => setStudyToolsOpen((open) => !open)} className="min-h-11 rounded-xl border border-[var(--card-border)] px-3 text-xs">目录与帮助</button></div>
        <div className="mx-auto mt-3 h-1.5 max-w-5xl overflow-hidden rounded-full bg-black/10 dark:bg-white/10"><div className="h-full rounded-full bg-[var(--brand)] transition-[width]" style={{ width: `${allCues.length ? (assessedCount / allCues.length) * 100 : 0}%` }} /></div>
        {groupCount > 1 && !practice.active && !practice.mode && <nav aria-label="CUE 学习分组" className="mx-auto mt-3 flex max-w-5xl flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-3 py-2"><button type="button" disabled={groupIndex === 0} onClick={() => { setIndex(groupStart - batchSize); setRevealed(false); setSelectedChoice(undefined); }} className="min-h-10 rounded-lg border border-[var(--card-border)] px-3 text-sm disabled:opacity-40">上一组</button><p aria-live="polite" className="text-sm">第 {groupIndex + 1} / {groupCount} 组 · 本组 {groupAssessedCount} / {groupCues.length} 条 · 累计 {assessedCount} / {allCues.length} 条</p><button type="button" disabled={groupIndex >= groupCount - 1 || !groupComplete} onClick={() => { setIndex(groupEnd); setRevealed(false); setSelectedChoice(undefined); }} className="min-h-10 rounded-lg border border-[var(--card-border)] px-3 text-sm disabled:cursor-not-allowed disabled:opacity-40">{groupComplete ? `完成本组并进入第 ${groupIndex + 2} 组` : '完成本组后进入下一组'}</button></nav>}
        <details data-cue-actions open={deviceLayout !== 'phone' ? true : undefined}><summary>更多学习操作</summary><div data-feature="study-actions" className="mx-auto mt-2 flex max-w-5xl flex-wrap items-center justify-end gap-2"><button type="button" className="min-h-11 rounded-xl border border-[var(--card-border)] px-3 text-sm" aria-pressed={animations} disabled={reducedMotion} onClick={() => setAnimations((value) => !value)}>学习动效 · {animations ? "开" : "关"}</button>{shuffled && <button type="button" className="min-h-11 rounded-xl border border-[var(--card-border)] px-3 text-sm" onClick={()=>reorderStudy(true)}>重新打散</button>}{current && <button type="button" onClick={() => void markMastered()} className="min-h-11 rounded-full border border-emerald-300 bg-[var(--card)] px-4 py-2 text-sm font-semibold shadow-lg"><span className={styles.keyboardHint}>K · </span>已熟练掌握</button>}<FullscreenButton /><button type="button" disabled={!current} onClick={() => setMemoOpen((open) => !open)} aria-expanded={memoOpen} className="min-h-11 rounded-xl border border-[var(--card-border)] px-3 text-sm font-semibold">CUE 答题卡</button><button type="button" disabled={!assessedCount} onClick={() => submit(activeAssessments)} className="rounded-full border border-[var(--brand)] px-4 py-2 text-xs font-semibold text-[var(--brand)] disabled:cursor-not-allowed disabled:opacity-40">结束本轮学习</button></div></details>
      </header>

      {studyToolsOpen && <div data-feature="study-help" className={styles.studyTools}>
        <p className={styles.studyToolDetails}>快捷键帮助：空格翻面；← / → / ↑ / ↓ 切换；C / P / X 或 1 / 2 / 3 评价；K 熟练掌握；~ / · 答题卡；Enter / Backspace 确认退出；Esc 保存并退出。输入框中保留正常输入。</p>
        <nav aria-label="触屏题目目录">{cues.map((cue, cueIndex) => <button key={cue.id} type="button" disabled={!canEnterGroup(Math.floor(cueIndex / batchSize))} aria-current={cueIndex === currentIndex ? 'step' : undefined} onClick={() => { setPractice((state) => ({ ...state, mode: false, active: undefined, rating: undefined, returnCueId: undefined })); setRatingFeedback(null); setIndex(cueIndex); setRevealed(false); setSelectedChoice(undefined); setStudyToolsOpen(false); }}>{cueIndex + 1}{assessments[cue.id] ? ` ${statusMark(assessments[cue.id])}` : ''}</button>)}</nav>
      </div>}
      {cueGameEnabled && <CueGamePanel compact account={gameAccount} onShopAction={onShopAction} sessionKey={draft.id} sessionStartedAt={draft.startedAt} sessionCount={Math.max(practice.completed, assessedCount)} reviews={reviews} cues={starCues} records={starRecords} feedback={starFeedback} animations={motionEnabled && !reducedMotion} />}
      {ratingFeedback && <div key={`${current?.id}:${ratingFeedback}`} data-cue-rating-feedback role="status" className={styles.ratingFeedback} data-rating={ratingFeedback}>{statusMark(ratingFeedback)} {practice.active && ratingFeedback === 'stable' ? '重练已通过，原评价保留' : ratingFeedback === 'stable' ? '这条已掌握' : ratingFeedback === 'partial' ? '找到需要巩固的部分了' : '记下了，继续修复这条'} · 已保存</div>}
      {assessedCount > 0 && assessedCount === allCues.length && <div data-cue-round-complete className={styles.roundComplete} role="status"><span aria-hidden="true">✦</span> 本轮全部评价完成，记得保存学习记录 <span aria-hidden="true">✦</span></div>}
      {(practiceIds.length > 0 || practice.mode || practice.active) && <section data-cue-practice-directory className="relative z-10 mx-auto max-w-5xl px-3 py-2 text-xs text-[var(--muted-foreground)]" aria-label="本轮重练目录">
        <div className="flex flex-wrap items-center justify-center gap-3"><span>重练已通过 {passedPracticeCount} / {practiceIds.length} · 待重练 {practice.pending.length} 条 · 原评价保留</span>
          <button type="button" disabled={Boolean(practice.active) || !dueCuePractice(practice, practiceNow, undefined, roundComplete, practicePolicy)} onClick={() => { setPractice(state => enterCuePractice(state, Date.now(), undefined, cues[currentIndex]?.id, true, roundComplete, practicePolicy)); setRatingFeedback(null); setRevealed(false); setSelectedChoice(undefined); }} className="rounded-full border border-[var(--card-border)] px-3 py-1 disabled:opacity-40">{roundComplete ? '重练未掌握 CUE' : practice.mode ? '继续到期重练' : '进入到期重练'}</button>
          {(practice.mode || practice.active) && <button type="button" onClick={returnToRound} className="rounded-full border border-[var(--card-border)] px-3 py-1">返回本轮</button>}
        </div>
        <details data-cue-practice-directory className="mt-2"><summary className="cursor-pointer text-center">重练目录 · {practiceIds.length} 条</summary>
          <nav className="mt-2 flex max-h-28 flex-wrap justify-center gap-2 overflow-y-auto" aria-label="全部重练 CUE">{practiceCues.map(cue => {
            const label = cuePracticeLabel(practice, cue.id, practiceNow, roundComplete, practicePolicy);
            const item = practice.pending.find(item => item.cueId === cue.id);
            const eligible = item && (roundComplete || cuePracticeIsDue(practice, item, practiceNow, practicePolicy));
            const passed = practice.results?.[cue.id]?.status === 'stable';
            const original = assessments[cue.id] ?? cue.status ?? 'unclear';
            return <button key={cue.id} type="button" disabled={!passed && (!eligible || practice.active === cue.id)} aria-current={practice.active === cue.id ? 'step' : undefined} onClick={() => { setPractice(state => ({ ...state, mode: true, active: cue.id, lastCueId: cue.id, rating: passed ? 'stable' : undefined, returnCueId: state.returnCueId ?? cues[currentIndex]?.id })); setRatingFeedback(null); setRevealed(false); setSelectedChoice(undefined); }} className={`max-w-64 rounded-xl border px-3 py-2 text-left disabled:opacity-60 ${original === 'unclear' ? 'border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/30' : original === 'partial' ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30' : 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30'}`}><span className="block truncate">{statusMark(original)} · {cue.prompt}</span><span className={`block font-semibold ${passed ? 'text-emerald-700 dark:text-emerald-300' : ''}`}>{label}</span></button>;
          })}</nav>
        </details>
      </section>}

      <main data-cue-study-page data-cue-study-content key={`${current?.id}:${practice.active ?? "initial"}`} data-revealed={revealed} className={`${styles.studyMain} ${styles.studyTransition} mx-auto flex min-h-[calc(100dvh-110px)] min-w-0 max-w-5xl flex-col px-3 py-4 sm:px-8 sm:py-8`}>
        {saveError && <p role="alert" className="p-3">{saveError}</p>}
        {!current ? <div className="m-auto max-w-lg rounded-3xl border border-dashed border-[var(--card-border)] p-10 text-center"><span aria-hidden="true" className="material-icons-round text-4xl text-[var(--brand)]">quiz</span><h2 className="mt-3 text-xl font-semibold">{practice.mode ? practice.pending.length ? '等待其他 CUE 到期' : '本轮重练全部通过' : allCues.length ? '本轮已完成' : '这个任务暂时没有 Cue'}</h2><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">{practice.mode ? practice.pending.length ? '本轮学习中按间隔开放重练；全部 CUE 评价完成后，可直接重练未掌握项。原评价和重练结果均已保存。' : '重练通过已单独标记，原来的黄色 / 红色继续保留。' : allCues.length ? '已完成的内容已隐藏，评价和进度仍然保留。' : '请先在 CUE 工作台添加内容，再回来学习。'}</p><button type="button" onClick={() => practice.mode ? returnToRound() : allCues.length ? submit(activeAssessments) : onClose()} className="mt-5 rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white dark:text-[#202124]">{practice.mode ? '返回本轮' : allCues.length ? '完成学习' : '返回 Schedule'}</button></div> : <>
          <div className={`${practice.mode ? 'hidden' : 'hidden md:flex'} mb-4 gap-2 overflow-x-auto py-1 sm:flex-wrap`} aria-label="Cue 学习进度">{cues.map((cue, cueIndex) => { const saved = assessments[cue.id]; return <button key={cue.id} type="button" disabled={!canEnterGroup(Math.floor(cueIndex / batchSize))} onClick={() => { setPractice((state) => ({ ...state, mode: false, active: undefined, rating: undefined, returnCueId: undefined })); setRatingFeedback(null); setIndex(cueIndex); setRevealed(false); setSelectedChoice(undefined); queueMicrotask(() => studyRef.current?.focus()); }} aria-label={`第 ${cueIndex + 1} 条${saved ? `，已标记 ${statusMark(saved)}` : '，未标记'}`} className={`grid h-11 min-w-11 shrink-0 place-items-center rounded-full border px-2 text-xs font-bold ${cue.id === current.id ? 'border-[var(--brand)] ring-2 ring-[var(--brand)]/20' : 'border-[var(--card-border)]'} ${saved === 'stable' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200' : saved === 'partial' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200' : saved === 'unclear' ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200' : 'bg-[var(--card)] text-[var(--muted-foreground)]'}`}>{saved ? statusMark(saved) : cueIndex + 1}</button>; })}</div>
          <div data-cue-study-meta data-feature="study-meta" className="flex flex-wrap items-start justify-between gap-3"><div className="flex flex-wrap gap-2"><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-200">{current.subjectName}</span><span className="rounded-full bg-black/5 px-3 py-1 text-xs font-semibold dark:bg-white/10">{current.unit}</span><span className="rounded-full bg-black/5 px-3 py-1 text-xs uppercase text-[var(--muted-foreground)] dark:bg-white/10">{current.type}</span><span className="rounded-full bg-black/5 px-3 py-1 text-xs text-[var(--muted-foreground)] dark:bg-white/10">{CUE_DISPLAY_OPTIONS.find((item) => item.value === (current.display ?? 'standard'))?.label}</span><button type="button" onClick={() => setMemoOpen(true)} className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${currentMemo ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200' : 'border border-[var(--card-border)] text-[var(--muted-foreground)]'}`}><span aria-hidden="true" className="material-icons-round text-sm">edit_note</span>{currentAnswer?.text.trim() ? '查看作答' : '填写答题卡'}</button></div><div className="text-right"><div className="flex flex-wrap items-center justify-end gap-2"><CueStatusHistory previous={priorStatus} current={assessments[current.id]} /><CueActivityBadge cue={current} /><span className="text-xs font-semibold text-[var(--foreground)]">{cueRevisionLabel(current)}</span></div><p className="mt-1 text-xs text-[var(--muted-foreground)]">先闭卷作答，再揭示证据并判定</p></div></div>
          <details data-cue-extra-info><summary className="cursor-pointer text-xs font-semibold">学习明细与难度</summary><div className="mt-2"><p className="text-xs text-[var(--muted-foreground)]">{current.type} · {CUE_DISPLAY_OPTIONS.find(item => item.value === (current.display ?? 'standard'))?.label}</p><details data-feature="study-history" className="my-3 rounded-xl border border-[var(--card-border)] p-3 text-xs">
            <summary className="cursor-pointer font-semibold">测试历史与学习明细</summary>
            <div className="mt-2 max-h-64 overflow-y-auto">{reviews.filter(review => review.cueId === current.id).toSorted((a, b) => b.reviewedAt.localeCompare(a.reviewedAt)).map(review => <p key={review.id} className="py-2">{formatReviewTimestamp(review.reviewedAt)} · {statusMark(review.status)} · 间隔 {review.intervalDays} 天</p>)}{!reviews.some(review => review.cueId === current.id) && <p>尚无历史评价，本轮评价会自动保存。</p>}</div>
          </details>
          <CueDifficultyPicker cue={current} reviews={reviews} onChange={(difficulty) => onDifficulty(current.id, difficulty)} /></div></details>
          <div className={`${styles.touchStudyOnly} md:hidden`}><MobileCueCard cue={current} revealed={revealed} selectedChoice={selectedChoice} onReveal={() => setRevealed((value) => !value)} onChoice={(choiceIndex) => { setSelectedChoice(choiceIndex); setRevealed(true); }} evidence={<CueEvidence cue={current} />} /></div>
          <div data-cue-study-stage className="hidden md:flex md:flex-col">
          <CuePromptContent cue={current} revealed={revealed} selectedChoice={selectedChoice} onReveal={() => setRevealed((value) => !value)} onChoice={(choiceIndex) => { setSelectedChoice(choiceIndex); setRevealed(true); }} />
          <div data-cue-study-ratings className={`${styles.pointerStudyOnly} hidden md:block border-t border-[var(--card-border)] pt-5`}><p className="mb-3 text-center text-sm font-semibold">{practice.active ? `本次重练：${practice.rating ? statusMark(practice.rating) : '尚未判定'} · 原评价 ${statusMark(assessments[current.id] ?? 'unclear')} 保留` : '这次闭卷检索的状态'}{!practice.active && assessments[current.id] ? ` · 已保存 ${statusMark(assessments[current.id])}$，再次点击相同状态进入下一条` : ''}</p>{revealed ? <div className="grid gap-3 sm:grid-cols-3"><button type="button" onClick={() => rate('stable')} className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-left text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"><strong className="text-xl">C / 1 · √ 通过</strong><span className="mt-1 block text-xs">首次保存；再次点击进入下一条</span></button><button type="button" onClick={() => rate('partial')} className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-left text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"><strong className="text-xl">P / 2 · △ 部分通过</strong><span className="mt-1 block text-xs">首次保存；再次点击进入下一条</span></button><button type="button" onClick={() => rate('unclear')} className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-left text-rose-800 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200"><strong className="text-xl">X / 3 · ○ 未通过</strong><span className="mt-1 block text-xs">首次保存；再次点击进入下一条</span></button></div> : <p className="rounded-2xl border border-dashed border-[var(--card-border)] px-4 py-4 text-center text-sm text-[var(--muted-foreground)]">{current.type === 'multiple-choice' ? `先选择 1–${current.choices?.length ?? 0}，系统核对后再判定状态。` : '空格 / Enter 可反复显示、隐藏答案。'}</p>}{assessedCount === allCues.length && cues.length > 0 && <button type="button" onClick={() => submit(assessments)} className="mt-4 w-full rounded-full bg-[var(--brand)] px-5 py-3 text-sm font-semibold text-white dark:text-[#202124]">完成本次 Cue 学习并保存记录</button>}<div className="mt-4 flex items-center justify-between gap-3"><button type="button" disabled={!practice.active && index === 0} onClick={() => move(-1)} className="rounded-full px-4 py-2 text-sm font-medium disabled:opacity-30">{practice.active ? "← 下一条错题" : "← 上一条"}</button><span className="text-center text-xs leading-5 text-[var(--muted-foreground)]">{current.type === 'multiple-choice' && !revealed ? `1–${current.choices?.length ?? 0} 选择答案` : '空格 / Enter 显示或隐藏答案'} · <kbd className="rounded bg-black/5 px-1.5 py-0.5 dark:bg-white/10">~ / ·</kbd> 答题卡 · ←/→/↑/↓ 切换 · {revealed ? 'C/P/X 或 1/2/3 首次保存、同状态再按切换 · ' : ''}Esc 退出</span><button type="button" disabled={!practice.active && index >= cues.length - 1} onClick={() => move(1)} className="rounded-full px-4 py-2 text-sm font-medium disabled:opacity-30">下一条 →</button></div></div>
          </div>
        </>}
      </main>
      </div>
      {current && <footer className={styles.touchControls}>
        <button type="button" className={styles.touchAnswerButton} aria-expanded={memoOpen} onClick={() => setMemoOpen(true)}>{currentAnswer?.text.trim() ? "查看我的作答" : "填写答题卡（可选）"}</button>
        {revealed && <div className={styles.touchRatings} aria-label="判定本次学习状态">{(['stable', 'partial', 'unclear'] as const).map((status) => <button key={status} type="button" data-rating={status} aria-pressed={(practice.active ? practice.rating : assessments[current.id]) === status} onClick={() => rate(status)}>{status === 'stable' ? '√ 通过' : status === 'partial' ? '△ 部分' : '○ 未通过'}</button>)}</div>}
        <div className={styles.touchNavigation}><button type="button" disabled={currentIndex === 0} onClick={() => move(-1)} aria-label="上一题">←</button><button type="button" disabled={!revealed && (current.type === 'multiple-choice' || current.display === 'multiple-choice')} onClick={() => setRevealed((value) => !value)}>{revealed ? '翻回题目' : current.type === 'multiple-choice' || current.display === 'multiple-choice' ? '请先选择选项' : '翻到答案'}</button><button type="button" disabled={!practice.active && currentIndex >= cues.length - 1} onClick={() => move(1)} aria-label="下一题">→</button></div>
        {assessedCount === allCues.length && <button type="button" className={styles.touchComplete} onClick={() => submit(activeAssessments)}>完成学习并保存记录</button>}
      </footer>}
      {memoOpen && current && <CueAnswerCardPanel key={`${draft.id}:${current.id}`} cue={current} card={currentAnswer} previousCards={answerCards.filter((card) => card.cueId === current.id && card.sessionId !== draft.id && card.text.trim()).slice(-5).reverse()} legacyMemo={currentMemo?.content} inputRef={memoRef} onText={(text) => onAnswerText(current.id, text)} onCompare={() => { onAnswerCompare(current); setRevealed(true); }} onCheck={(index, checked) => currentAnswer && onAnswerCheck(currentAnswer.id, index, checked)} onClose={() => { setMemoOpen(false); queueMicrotask(() => studyRef.current?.focus()); }} />}
    </div>, document.body
  );
}

function CueStudyDashboard({ cues, reviews, drafts, onStart, onResume, onDiscard }: { cues: StudyCue[]; reviews: CueReview[]; drafts: CueStudyDraft[]; onStart: (subjectName: string, unit: string, cueIds: string[], shuffled: boolean) => void; onResume: (draft: CueStudyDraft) => void; onDiscard: (draft: CueStudyDraft) => void }) {
  const subjects = [...new Set(cues.map((cue) => cue.subjectName))];
  const [subjectName, setSubjectName] = useState(subjects[0] ?? '');
  const [unit, setUnit] = useState('');
  const [statusFilter, setStatusFilter] = useState<CueStatusFilter>(DEFAULT_STUDY_FILTER);
  const { cueShuffle } = useCueStudyPreferences();
  const [shuffleOverride, setShuffleOverride] = useState<boolean | null>(null);
  const shuffled = shuffleOverride ?? cueShuffle;
  const today = dateKey(new Date());
  const reviewsByCue = new Map<string, CueReview[]>();
  for (const review of reviews) reviewsByCue.set(review.cueId, [...(reviewsByCue.get(review.cueId) ?? []), review]);
  const reviewedToday = (cue: StudyCue) => Boolean(cue.lastReviewedAt && dateKey(new Date(cue.lastReviewedAt)) === today);
  const subjectSummaries = subjects.map((name) => {
    const items = cues.filter((cue) => cue.subjectName === name);
    return {
      name,
      total: items.length,
      due: items.filter((cue) => cueMatchesStatusFilter(cue, 'due', today)).length,
      unreviewed: items.filter((cue) => !cue.lastReviewedAt).length,
      weak: items.filter((cue) => cue.status === 'partial' || cue.status === 'unclear').length,
      unstable: items.filter((cue) => cueMatchesStatusFilter(cue, 'unstable', today, reviewsByCue.get(cue.id))).length,
      completedToday: items.filter(reviewedToday).length,
      units: [...new Set(items.map((cue) => cue.unit || '未分单元'))],
    };
  });
  const selectedSubject = subjectSummaries.find((subject) => subject.name === subjectName);
  const scopedCues = cues.filter((cue) => cue.subjectName === subjectName && (!unit || (cue.unit || '未分单元') === unit));
  const selectedCues = scopedCues.filter((cue) => !isCueMasteryPaused(cue, today) && cueMatchesStatusFilter(cue, statusFilter, today, reviewsByCue.get(cue.id)));
  const studyCues = selectedCues.filter((cue) => !reviewedToday(cue));
  const cueGroups = new Map<string, StudyCue[]>();
  for (const cue of selectedCues) cueGroups.set(cue.unit || '未分单元', [...(cueGroups.get(cue.unit || '未分单元') ?? []), cue]);
  const filterOptions: Array<{ value: CueStatusFilter; label: string }> = [
    { value: 'all', label: '全部' },
    { value: 'due', label: '今天到期' },
    { value: 'unstable', label: '历史不稳定' },
    { value: 'repeated-weak', label: '反复失误' },
    { value: 'recovering', label: '刚转绿' },
    { value: 'unreviewed', label: '未学过' },
    { value: 'weak', label: '黄＋红' },
    { value: 'stable', label: '仅绿色' },
    { value: 'partial', label: '仅黄色' },
    { value: 'unclear', label: '仅红色' },
  ];
  return <div className="mt-5 space-y-5">
    {drafts.map((draft) => <section key={draft.id} className="rounded-3xl border border-blue-300 bg-blue-50/80 p-5 dark:border-blue-800 dark:bg-blue-950/30"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.12em] text-blue-700 dark:text-blue-200">{draft.task.subjectName || '未分类'} · 未完成进度已自动保存</p><h2 className="mt-1 text-lg font-semibold">{draft.task.title}</h2><p className="mt-2 text-sm text-[var(--muted-foreground)]">已判定 {Object.keys(draft.assessments).length} / {draft.cueIds.length} 条 · 上次位置 {Math.min(draft.index + 1, draft.cueIds.length)} / {draft.cueIds.length} · {new Date(draft.updatedAt).toLocaleString('zh-CN')}</p></div><div className="flex gap-2"><button type="button" onClick={() => onDiscard(draft)} className="rounded-full border border-[var(--card-border)] px-4 py-2 text-sm font-medium">放弃进度</button><button type="button" onClick={() => onResume(draft)} className="rounded-full bg-[var(--brand)] px-5 py-2 text-sm font-semibold text-white dark:text-[#202124]">恢复学习</button></div></div></section>)}
    <section className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--brand)]">Focused Cue Study</p><h2 className="mt-1 text-2xl font-semibold">Cue 专项学习</h2><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">先看各科需要复习什么，再按单元或历史表现挑选；今天已完成的 Cue 明天起再复习。</p></div><span aria-hidden="true" className="material-icons-round text-4xl text-[var(--brand)]">psychology_alt</span></div>
      {cues.length ? <>
        <h3 className="mt-6 text-sm font-semibold">按科目查看</h3>
        <select aria-label="选择学习科目" value={subjectName} onChange={(event) => { setSubjectName(event.target.value); setUnit(''); }} className="mt-3 min-h-12 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 md:hidden">{subjectSummaries.map((subject) => <option key={subject.name} value={subject.name}>{subject.name} · 到期 {subject.due} · 不稳定 {subject.unstable}</option>)}</select><div data-feature="subject-statistics" className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{subjectSummaries.map((subject) => <button key={subject.name} type="button" onClick={() => { setSubjectName(subject.name); setUnit(''); }} aria-pressed={subjectName === subject.name} className={`rounded-2xl border p-4 text-left transition-colors ${subjectName === subject.name ? 'border-[var(--brand)] bg-blue-50/70 dark:bg-blue-950/25' : 'border-[var(--card-border)] hover:border-[var(--brand)]'}`}><span className="flex items-center justify-between gap-2"><strong className="text-base">{subject.name}</strong><span className="text-xs text-[var(--muted-foreground)]">{subject.total} 条 Cue</span></span><span className="mt-3 grid grid-cols-3 gap-2 text-xs"><span><strong className="block text-lg text-[var(--brand)]">{subject.due}</strong>今天到期</span><span><strong className="block text-lg text-amber-600">{subject.unstable}</strong>不稳定</span><span><strong className="block text-lg">{subject.unreviewed}</strong>未学过</span></span><span className="mt-3 block text-xs text-[var(--muted-foreground)]">当前黄／红 {subject.weak} · 今天已完成 {subject.completedToday}</span><span className="mt-2 block truncate text-xs text-[var(--muted-foreground)]" title={subject.units.join(' · ')}>{subject.units.join(' · ')}</span></button>)}</div>
        {selectedSubject && <div className="mt-6 border-t border-[var(--card-border)] pt-5">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><h3 className="text-xl font-semibold">{selectedSubject.name}</h3><p className="mt-1 text-sm text-[var(--muted-foreground)]">{selectedSubject.total} 条 Cue · {selectedSubject.units.length} 个单元 · 今天到期 {selectedSubject.due} · 不稳定 {selectedSubject.unstable}</p><p className="mt-1 text-xs text-[var(--muted-foreground)] md:hidden">未学过 {selectedSubject.unreviewed} · 黄／红 {selectedSubject.weak} · 今日完成 {selectedSubject.completedToday}</p></div><button type="button" disabled={!studyCues.length} onClick={() => onStart(subjectName, unit, studyCues.map((cue) => cue.id), shuffled)} className="rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40 dark:text-[#202124]">学习当前筛选 · {studyCues.length} 条</button></div>
          <div className="mt-5"><p className="text-xs font-semibold text-[var(--muted-foreground)]">单元</p><select aria-label="选择学习单元" value={unit} onChange={(event) => setUnit(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 md:hidden"><option value="">全部单元</option>{selectedSubject.units.map((name) => <option key={name} value={name}>{name}</option>)}</select><div className="mt-2 hidden md:flex flex-wrap gap-2">{['', ...selectedSubject.units].map((name) => <button key={name || 'all'} type="button" onClick={() => setUnit(name)} aria-pressed={unit === name} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${unit === name ? 'border-[var(--brand)] bg-[var(--brand)] text-white dark:text-[#202124]' : 'border-[var(--card-border)] hover:border-[var(--brand)]'}`}>{name || '全部单元'}{name ? ` · ${cues.filter((cue) => cue.subjectName === subjectName && (cue.unit || '未分单元') === name).length}` : ''}</button>)}</div></div>
          <div className="mt-4"><p className="text-xs font-semibold text-[var(--muted-foreground)]">学习范围</p><select aria-label="选择学习范围" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as CueStatusFilter)} className="mt-2 min-h-12 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 md:hidden">{filterOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><div className="mt-2 hidden md:flex flex-wrap gap-2">{filterOptions.map((option) => <button key={option.value} type="button" onClick={() => setStatusFilter(option.value)} aria-pressed={statusFilter === option.value} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${statusFilter === option.value ? 'border-[var(--brand)] bg-[var(--brand)] text-white dark:text-[#202124]' : 'border-[var(--card-border)] hover:border-[var(--brand)]'}`}>{option.label}</button>)}</div></div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"><p>当前显示 <strong>{selectedCues.length}</strong> 条 · 可学习 <strong>{studyCues.length}</strong> 条{selectedCues.length > studyCues.length ? ` · 今天已完成 ${selectedCues.length - studyCues.length} 条` : ''}</p><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={shuffled} onChange={(event) => setShuffleOverride(event.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />乱序学习</label></div>
          <div className="mt-3 max-h-[42rem] space-y-5 overflow-y-auto pr-1">{[...cueGroups].map(([groupUnit, items]) => <section key={groupUnit} className="rounded-2xl border border-[var(--card-border)] p-4"><h4 className="font-semibold">{groupUnit} <span className="ml-1 text-xs font-normal text-[var(--muted-foreground)]">{items.length} 条</span></h4><div className="mt-3 space-y-2">{items.map((cue) => { const history = (reviewsByCue.get(cue.id) ?? []).toSorted((left, right) => right.reviewedAt.localeCompare(left.reviewedAt)); const doneToday = reviewedToday(cue); return <article key={cue.id} className="rounded-xl bg-black/[.035] p-3 dark:bg-white/[.05]"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2 text-xs"><span className="rounded-full bg-[var(--card)] px-2 py-0.5 font-semibold">{cue.status ? statusMark(cue.status) : '未验证'}</span><span className="text-[var(--muted-foreground)]">{cue.subsection || groupUnit} · {cue.type.toUpperCase()}</span>{doneToday && <span className="font-medium text-emerald-700 dark:text-emerald-300">今日已完成</span>}</div><div className="mt-2 font-medium"><LatexRenderer content={cue.prompt} /></div><p className="mt-2 text-xs text-[var(--muted-foreground)]">难度 {difficultyLabels[effectiveCueDifficulty(cue, history)]} · 检索 {history.length} 次 · 连续 √ {cue.streak} · 当前间隔 {cue.intervalDays} 天 · 下次 {cue.nextReviewDate ?? '未排期'}</p>{history.length > 0 && <p className="mt-1 text-xs text-[var(--muted-foreground)]">近 3 次：{history.slice(0, 3).map((review) => statusMark(review.status)).join(' ')} · 最近 {formatReviewTimestamp(history[0].reviewedAt)}</p>}</div><button type="button" disabled={doneToday} onClick={() => onStart(subjectName, cue.unit, [cue.id], false)} className="rounded-full border border-[var(--card-border)] px-3 py-1.5 text-xs font-semibold hover:border-[var(--brand)] disabled:cursor-not-allowed disabled:opacity-40">{doneToday ? '明天再学' : '学习这条'}</button></div></article>; })}</div></section>)}{!selectedCues.length && <p className="rounded-2xl border border-dashed border-[var(--card-border)] px-4 py-8 text-center text-sm text-[var(--muted-foreground)]">当前范围没有 Cue；可以选其他单元或范围。</p>}</div>
        </div>}
      </> : <div className="mt-6 rounded-2xl border border-dashed border-[var(--card-border)] p-8 text-center"><p className="font-semibold">还没有可以学习的 Cue</p><p className="mt-2 text-sm text-[var(--muted-foreground)]">请先打开 Cue 管理，手动添加或批量导入。</p></div>}
    </section>
    <details className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5 text-sm leading-6 text-[var(--muted-foreground)]"><summary className="cursor-pointer font-semibold text-[var(--foreground)]">学习帮助与外接键盘快捷键</summary>空格 / Enter 显示、隐藏答案；←/→/↑/↓ 切换；显示答案后 C/P/X 或 1/2/3 标记 √/△/○；Esc 自动保存并退出。</details>
    <p className="px-2 text-sm leading-6 text-[var(--muted-foreground)] md:hidden">点击题目卡片查看答案；选择题先点选项。底部可判定状态和切换题目，“目录与帮助”打开题目目录和键盘说明。乱序、答题卡和结束本轮可直接操作。</p>
  </div>;
}

function CueMemoBoard({ cues, memos, onChange }: { cues: StudyCue[]; memos: CueMemo[]; onChange: (cueId: string, content: string) => void }) {
  const [query, setQuery] = useState('');
  const cuesById = new Map(cues.map((cue) => [cue.id, cue]));
  const visible = [...memos].sort((left, right) => {
    const first = cuesById.get(left.cueId);
    const second = cuesById.get(right.cueId);
    return (first?.subjectName ?? '').localeCompare(second?.subjectName ?? '')
      || (first?.unit ?? '').localeCompare(second?.unit ?? '')
      || left.cueId.localeCompare(right.cueId);
  }).filter((memo) => {
    const cue = cuesById.get(memo.cueId);
    return `${cue?.subjectName ?? ''} ${cue?.unit ?? ''} ${cue?.prompt ?? memo.cueId} ${memo.content}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  });
  return <section className="mt-5 rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--brand)]">Cue Memos</p><h2 className="mt-1 text-xl font-semibold">备忘录</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">查看每条备忘录对应的 Cue；修改后自动保存。</p></div><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">{memos.length} 条</span></div>
    <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索学科、Cue 或备忘内容" aria-label="搜索备忘录" className="mt-5 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-2.5 text-sm outline-none focus:border-[var(--brand)]" />
    {visible.length ? <div className="mt-5 grid gap-4 lg:grid-cols-2">{visible.map((memo) => { const cue = cuesById.get(memo.cueId); return <article key={memo.cueId} className="min-w-0 rounded-2xl border border-[var(--card-border)] p-4"><div className="flex flex-wrap items-center gap-2 text-xs"><span className="rounded-full bg-blue-50 px-2.5 py-1 font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-200">{cue?.subjectName ?? '已移除的 Cue'}</span>{cue?.unit && <span className="text-[var(--muted-foreground)]">{cue.unit}</span>}</div><div className="mt-3 font-semibold leading-6">{cue ? <LatexRenderer content={cue.prompt} /> : memo.cueId}</div>{cue?.subtitle && <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]"><LatexRenderer content={cue.subtitle} /></p>}<textarea value={memo.content} onChange={(event) => onChange(memo.cueId, event.target.value.slice(0, 10_000))} rows={5} aria-label={`编辑 ${cue?.prompt ?? memo.cueId} 的备忘录`} className="mt-4 w-full resize-y rounded-xl border border-amber-200 bg-amber-50/50 px-3 py-2 text-sm leading-6 outline-none focus:border-amber-500 dark:border-amber-900 dark:bg-amber-950/20" /><div className="mt-2 flex items-center justify-between gap-3 text-xs text-[var(--muted-foreground)]"><span>{formatReviewTimestamp(memo.updatedAt)} 保存</span><button type="button" onClick={() => onChange(memo.cueId, '')} className="font-medium text-rose-600">删除备忘录</button></div></article>; })}</div> : <p className="mt-8 rounded-2xl border border-dashed border-[var(--card-border)] px-5 py-10 text-center text-sm text-[var(--muted-foreground)]">{memos.length ? '没有匹配的备忘录。' : '还没有备忘录；可在 Cue 学习中为任意 Cue 添加。'}</p>}
  </section>;
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
      version: 1, intervalDays: 0, easeFactor: 2.5, streak: 0, nextReviewDate: addCalendarDays(dateKey(new Date()), 1), createdAt: now, updatedAt: now,
    };
    setNewCues((current) => [...current, cue]);
    setSelectedCueIds((current) => [...current, cue.id]);
    setCueStatuses((current) => ({ ...current, [cue.id]: 'linked' }));
    setNewCuePrompt(''); setNewCueSubtitle(''); setNewCueAnswer(''); setNewCueChoices(''); setNewCueCorrectChoice(0); setNewCueMarkingPoints(''); setShowCueForm(false);
  };
  const importLessonCues = (items: CueCreateOperation[]) => {
    const now = new Date().toISOString();
    const imported = items.map((item): StudyCue => {
      const normalizedSubject = item.subjectName?.trim().slice(0, 80) || subjectName.trim().slice(0, 80);
      const subjectId = catalog.find((subject) => subject.name.trim().toLocaleLowerCase() === normalizedSubject.toLocaleLowerCase())?.id ?? subjectIdFromName(normalizedSubject);
      return {
        id: taskId(), subjectId, subjectName: normalizedSubject, unit: item.unit, subsection: '', prompt: item.prompt,
        ...(item.subtitle ? { subtitle: item.subtitle } : {}), ...(item.answer ? { answer: item.answer } : {}), type: item.type, display: item.display,
        ...(item.choices ? { choices: item.choices, correctChoice: item.correctChoice } : {}),
        markingPoints: item.markingPoints, version: 1, intervalDays: 0, easeFactor: 2.5, streak: 0, nextReviewDate: addCalendarDays(dateKey(new Date()), 1), createdAt: now, updatedAt: now,
      };
    });
    setNewCues((current) => [...current, ...imported]);
    setSelectedCueIds((current) => [...current, ...imported.map((cue) => cue.id)]);
    setCueStatuses((current) => ({ ...current, ...Object.fromEntries(imported.map((cue) => [cue.id, 'linked' as const])) }));
    setShowCueBatchImport(false);
  };
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="review-dialog-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="max-h-[92dvh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-2xl">
        <div className="flex items-start gap-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-50 text-[var(--brand)] dark:bg-blue-950/50"><span aria-hidden="true" className="material-icons-round">fact_check</span></div>
          <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-[var(--brand)]">完成学习记录</p><h2 id="review-dialog-title" className="mt-1 text-xl font-semibold">{task.title}</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">填写实际范围、资料和 Cue；只有评分过的 Cue 才会更新复习时间。记录会{signedIn ? '同步到当前账号' : '先保存在本机，登录后可同步'}。</p></div>
          <button type="button" onClick={onClose} aria-label="关闭" className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"><span aria-hidden="true" className="material-icons-round">close</span></button>
        </div>
        <div className={`mt-5 rounded-2xl border p-4 ${status === 'stable' ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200' : status === 'partial' ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200' : 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200'}`}><div className="flex items-center gap-3"><span className="text-2xl font-bold">{statusMark(status)}</span><div><strong>系统自动判定：{status === 'stable' ? '全部通过' : status === 'partial' ? '部分通过' : '未通过'}</strong><p className="mt-1 text-xs leading-5 opacity-80">{status === 'stable' ? '所有所选 Cue 都是 √。' : status === 'unclear' ? '至少一条所选 Cue 是 ○。' : '没有红色 Cue，但存在 △、仅关联或尚无 Cue 证据。'}</p></div></div></div>
        <div className="mt-5 space-y-4"><details><summary className="cursor-pointer text-sm font-semibold">补充内容、问题和备注（可选）</summary>
          <label className="block text-sm font-medium">补充本次实际学习 / 复习内容 <span className="text-[var(--muted-foreground)]">（可选）</span><textarea value={studiedContent} onChange={(event) => setStudiedContent(event.target.value)} rows={2} maxLength={1000} placeholder="留空时，系统会根据任务、实际范围、资料位置和所选 Cue 自动生成。" className="mt-2 w-full resize-none rounded-2xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-3 text-sm leading-6 outline-none focus:border-[var(--brand)]" /></label>
          {status !== 'stable' && <label className="block text-sm font-medium">发现的问题 <span className="text-[var(--muted-foreground)]">（可选；留空时系统会根据 Cue 自动生成）</span><textarea value={issue} onChange={(event) => setIssue(event.target.value)} rows={2} maxLength={1000} placeholder="例如：会代公式，但无法解释为什么要这样变形。" className="mt-2 w-full resize-none rounded-2xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-3 text-sm leading-6 outline-none focus:border-[var(--brand)]" /></label>}
          <label className="block text-sm font-medium">其他备注 <span className="text-[var(--muted-foreground)]">（可选）</span><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} maxLength={1000} placeholder="例如：下次换一道综合题，或记录使用的资料页码。" className="mt-2 w-full resize-none rounded-2xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-3 text-sm leading-6 outline-none focus:border-[var(--brand)]" /></label></details>
          <fieldset className="rounded-2xl border border-[var(--card-border)] p-4"><legend className="px-2 text-sm font-semibold">实际范围</legend>{catalog.length ? <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium">学科<select value={subjectName} onChange={(event) => chooseSubject(event.target.value)} className="mt-1.5 w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-2.5 py-2 text-sm"><option value="">请选择</option>{catalog.map((subject) => <option key={subject.id} value={subject.name}>{subject.name}</option>)}</select></label><label className="text-xs font-medium">大单元<select value={unit} disabled={!selectedSubjectConfig} onChange={(event) => setUnit(event.target.value)} className="mt-1.5 w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-2.5 py-2 text-sm disabled:opacity-50"><option value="">请选择</option>{selectedSubjectConfig?.units.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label></div> : <p className="text-xs leading-5 text-amber-700 dark:text-amber-200">请先在“设置 → 学科与单元分类”中导入分类配置。</p>}</fieldset>
          <fieldset className="rounded-2xl border border-[var(--card-border)] p-4"><legend className="px-2 text-sm font-semibold">本次实际使用资料</legend><div className="grid gap-2 sm:grid-cols-2">{LEARNING_MATERIALS.map((material) => { const checked = material.code in materials; return <div key={material.code} className={`rounded-xl border p-3 ${checked ? 'border-[var(--brand)] bg-blue-50/60 dark:bg-blue-950/25' : 'border-[var(--card-border)]'}`}><label className="flex cursor-pointer items-center gap-2 text-xs font-medium"><input type="checkbox" checked={checked} onChange={() => toggleMaterial(material.code)} className="h-4 w-4 accent-[var(--brand)]" /><strong className="font-mono">{material.code}</strong>{material.label}</label>{checked && <input value={materials[material.code]} onChange={(event) => setMaterials((current) => ({ ...current, [material.code]: event.target.value }))} placeholder="例如：1.1–1.2 / P12–18" className="mt-2 w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-2.5 py-2 text-xs" />}</div>; })}</div></fieldset>
          <fieldset className="rounded-2xl border border-[var(--card-border)] p-4"><legend className="px-2 text-sm font-semibold">本次 Cue</legend><div className="flex flex-wrap items-center justify-between gap-3"><p className="max-w-2xl text-xs leading-5 text-[var(--muted-foreground)]">勾选代表本次有关；“仅关联”不改变复习日期，√ / △ / ○ 才更新状态。上新课时可立即手动录入，也可以把课堂笔记交给 AI 批量整理。</p><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setShowCueForm((current) => !current)} className="rounded-full border border-[var(--card-border)] px-3 py-1.5 text-xs font-semibold"><span aria-hidden="true" className="material-icons-round mr-1 align-middle text-base">add</span>手动录入 Cue</button><button type="button" disabled={!subjectName.trim()} onClick={() => setShowCueBatchImport(true)} className="rounded-full bg-[var(--brand)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40 dark:text-[#202124]"><span aria-hidden="true" className="material-icons-round mr-1 align-middle text-base">auto_awesome</span>课堂笔记 / AI 录入</button></div></div>
          {showCueForm && <div className="mt-4 rounded-2xl border border-[var(--card-border)] bg-black/[.025] p-4 dark:bg-white/[.05]"><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium">题型<select value={newCueType} onChange={(event) => { const value = event.target.value as CueType; setNewCueType(value); if (value === 'definition') setNewCueDisplay('definition-card'); if (value === 'multiple-choice') setNewCueDisplay('multiple-choice'); }} className="mt-1.5 w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-2.5 py-2 text-sm">{CUE_TYPE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label className="text-xs font-medium">显示预设<select value={newCueDisplay} onChange={(event) => setNewCueDisplay(event.target.value as CueDisplayPreset)} className="mt-1.5 w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-2.5 py-2 text-sm">{CUE_DISPLAY_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label} — {item.hint}</option>)}</select></label></div><label className="mt-3 block text-xs font-medium">题目大标题<input value={newCuePrompt} onChange={(event) => setNewCuePrompt(event.target.value)} placeholder="例如：推导匀加速运动的位移公式" className="mt-1.5 w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm" /></label><label className="mt-3 block text-xs font-medium">题目说明小字 <span className="font-normal text-[var(--muted-foreground)]">（背景、已知条件或作答限制，不要写答案）</span><textarea value={newCueSubtitle} onChange={(event) => setNewCueSubtitle(event.target.value)} rows={2} placeholder={String.raw`例如：从 \(v=u+at\) 出发，并说明每一步。`} className="mt-1.5 w-full resize-none rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm" /></label>{newCueType === 'multiple-choice' && <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]"><label className="text-xs font-medium">选项（每行一个，2–6 项）<textarea value={newCueChoices} onChange={(event) => setNewCueChoices(event.target.value)} rows={4} className="mt-1.5 w-full resize-none rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm" /></label><label className="text-xs font-medium">正确选项<select value={newCueCorrectChoice} onChange={(event) => setNewCueCorrectChoice(Number(event.target.value))} className="mt-1.5 w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm">{newCueChoices.split('\n').map((item) => item.trim()).filter(Boolean).slice(0, 6).map((item, itemIndex) => <option key={`${itemIndex}-${item}`} value={itemIndex}>{itemIndex + 1} · {item}</option>)}</select></label></div>}<label className="mt-3 block text-xs font-medium">参考答案 <span className="font-normal text-[var(--muted-foreground)]">（可选）</span><textarea value={newCueAnswer} onChange={(event) => setNewCueAnswer(event.target.value)} rows={3} placeholder="揭示后显示的完整参考答案" className="mt-1.5 w-full resize-none rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm" /></label><label className="mt-3 block text-xs font-medium">Marking points <span className="font-normal text-[var(--muted-foreground)]">（每行一个必要得分点）</span><textarea value={newCueMarkingPoints} onChange={(event) => setNewCueMarkingPoints(event.target.value)} rows={3} placeholder="关键公式或关系\n必要限定条件\n完整解释链" className="mt-1.5 w-full resize-none rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm" /></label><p className="mt-3 text-xs leading-5 text-[var(--muted-foreground)]">数学符号支持 LaTeX：行内使用 <code>\(...\)</code>，例如 <code>\(f(x)&gt;g(x)\)</code>；独立公式使用 <code>\[...\]</code>。</p>{newCuePrompt.trim() && <div className="mt-3 rounded-xl border border-dashed border-[var(--card-border)] bg-[var(--card)] p-4 text-center"><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--muted-foreground)]">显示预览 · {CUE_DISPLAY_OPTIONS.find((item) => item.value === newCueDisplay)?.label}</p><div className={`mt-2 font-semibold ${newCueDisplay === 'headline' || newCueDisplay === 'formula' ? 'text-2xl' : 'text-lg'}`}><LatexRenderer content={newCuePrompt} /></div>{newCueSubtitle.trim() && <div className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]"><LatexRenderer content={newCueSubtitle} /></div>}</div>}<div className="mt-3 flex justify-end"><button type="button" disabled={!subjectName.trim() || !unit.trim() || !newCuePrompt.trim() || newCueType === 'multiple-choice' && newCueChoices.split('\n').filter((item) => item.trim()).length < 2} onClick={createCue} className="rounded-full bg-[var(--brand)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-40 dark:text-[#202124]">加入本次记录</button></div></div>}
          <div className="mt-3 grid gap-2 sm:grid-cols-2"><select value={cueSubjectFilter} onChange={(event) => { setCueSubjectFilter(event.target.value); setCueUnitFilter(''); }} aria-label="按学科筛选 Cue" className="rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm"><option value="">全部学科</option>{cueSubjects.map((value) => <option key={value} value={value}>{value}</option>)}</select><select value={cueUnitFilter} onChange={(event) => setCueUnitFilter(event.target.value)} aria-label="按大单元筛选 Cue" className="rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm"><option value="">全部大单元</option>{cueUnits.map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
          <input value={cueQuery} onChange={(event) => setCueQuery(event.target.value)} placeholder="快速搜索 Cue 问题、学科或单元…" className="mt-2 w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm" />
          <div className="mt-3 max-h-80 space-y-4 overflow-y-auto">{visibleCues.map((subject) => <section key={subject.subject}><h3 className="sticky top-0 z-10 rounded-lg bg-[var(--background)] px-2 py-1.5 text-sm font-semibold">{subject.subject}</h3>{subject.units.map((unitGroup) => <div key={unitGroup.unit} className="ml-2 mt-2 border-l-2 border-[var(--card-border)] pl-3"><p className="text-xs font-semibold text-[var(--brand)]">{unitGroup.unit}</p>{unitGroup.subsections.map((subsectionGroup) => <div key={subsectionGroup.subsection} className="mt-2"><p className="text-[11px] font-medium text-[var(--muted-foreground)]">{subsectionGroup.subsection}</p><div className="mt-1 space-y-2">{subsectionGroup.cues.map((cue) => { const checked = selectedCueIds.includes(cue.id); return <div key={cue.id} className={`rounded-xl border p-3 ${checked ? 'border-[var(--brand)] bg-blue-50/60 dark:bg-blue-950/25' : 'border-[var(--card-border)]'}`}><label className="flex cursor-pointer items-start gap-2"><input type="checkbox" checked={checked} onChange={() => toggleCue(cue.id)} className="mt-1 h-4 w-4 accent-[var(--brand)]" /><span className="min-w-0 flex-1"><span className="text-[10px] font-semibold uppercase text-[var(--muted-foreground)]">[{cue.type}] · {CUE_DISPLAY_OPTIONS.find((item) => item.value === (cue.display ?? 'standard'))?.label}</span><span className="block text-sm font-semibold"><LatexRenderer content={cue.prompt} /></span>{cue.subtitle && <span className="mt-1 block text-xs leading-5 text-[var(--muted-foreground)]"><LatexRenderer content={cue.subtitle} /></span>}{cue.markingPoints.length > 0 && <span className="mt-1 block text-xs text-[var(--muted-foreground)]">Marking points：{cue.markingPoints.join(' · ')}</span>}</span></label>{checked && <div className="mt-3 grid grid-cols-4 gap-1.5">{([['linked', '仅关联'], ['stable', '√'], ['partial', '△'], ['unclear', '○']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setCueStatuses((current) => ({ ...current, [cue.id]: value }))} className={`h-9 rounded-lg border text-xs font-bold ${cueStatuses[cue.id] === value ? 'border-[var(--brand)] bg-[var(--brand)] text-white dark:text-[#202124]' : 'border-[var(--card-border)]'}`}>{label}</button>)}</div>}</div>; })}</div></div>)}</div>)}</section>)}{!allCues.length && <p className="rounded-xl border border-dashed border-[var(--card-border)] py-8 text-center text-xs text-[var(--muted-foreground)]">还没有 Cue，可以直接在上方新增。</p>}</div></fieldset>
        </div>
        {missingCueState && <p className="mt-2 text-xs text-rose-600">请为所有选中的 Cue 选择“仅关联”或状态。</p>}
        <div className="mt-5 flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-full border border-[var(--card-border)] px-5 py-2.5 text-sm font-medium">取消</button><button type="button" disabled={missingCueState} onClick={() => onComplete({ studiedContent, issue, note }, { subjectName: subjectName.trim() || undefined, scope: unit.trim() || subsection.trim() ? { ...(unit.trim() ? { unit: unit.trim() } : {}), ...(subsection.trim() ? { subsection: subsection.trim() } : {}), cueIds: selectedCueIds } : { cueIds: selectedCueIds }, materials: Object.entries(materials).map(([code, progress]) => ({ code: code as LearningSessionEvidence['materials'][number]['code'], ...(progress.trim() ? { progress: progress.trim() } : {}) })), cueIds: selectedCueIds, newCues, assessments })} className={`rounded-full px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 ${status === 'unclear' ? 'bg-rose-600' : 'bg-[var(--brand)] dark:text-[#202124]'}`}>{status === 'unclear' ? '保存记录，继续修复' : '保存学习记录'}</button></div>
      </div>
      {showCueBatchImport && <CueBulkImportDialog subjectName={subjectName.trim()} knownUnits={selectedSubjectConfig?.units.map((item) => item.name) ?? []} cues={[]} onClose={() => setShowCueBatchImport(false)} onApply={(operations) => importLessonCues(operations.filter((operation): operation is CueCreateOperation => operation.action === 'create'))} />}
    </div>
  );
}

function TaskDialog({ date, cues, catalog, onClose, onSave }: { date: string; cues: StudyCue[]; catalog: LearningCatalogSubject[]; onClose: () => void; onSave: (tasks: ManualLearningTask[]) => void }) {
  const [title, setTitle] = useState('');
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
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
  const multiSubject = Boolean(presetId && selectedSubjects.length > 1);
  const activeSubject = presetId && selectedSubjects.length ? selectedSubjects[0] : subject;
  const selectedSubjectConfig = catalog.find((item) => item.name === activeSubject);
  const scopedCues = cues.filter((cue) => (!activeSubject || cue.subjectName === activeSubject) && (!unit || cue.unit === unit));
  const groupedCues = [...new Set(scopedCues.map((cue) => cue.subjectName))].map((subjectName) => ({
    subject: subjectName,
    units: [...new Set(scopedCues.filter((cue) => cue.subjectName === subjectName).map((cue) => cue.unit))].map((unitName) => ({
      unit: unitName,
      subsections: [...new Set(scopedCues.filter((cue) => cue.subjectName === subjectName && cue.unit === unitName).map((cue) => cue.subsection))].map((subsection) => ({
        subsection,
        cues: scopedCues.filter((cue) => cue.subjectName === subjectName && cue.unit === unitName && cue.subsection === subsection),
      })),
    })),
  }));
  const updateSubjects = (next: string[]) => {
    setSelectedSubjects(next);
    setUnit('');
    setSelectedCueIds([]);
  };
  const toggleCueGroup = (ids: string[], checked: boolean) => setSelectedCueIds((current) => toggleCueIds(current, ids, checked));
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
      <form className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-2xl" onSubmit={(event) => {
        event.preventDefault();
        if (!title.trim() || (presetId && !selectedSubjects.length && !subject)) return;
        const subjects = presetId && selectedSubjects.length ? selectedSubjects : [subject];
        onSave(subjects.map((taskSubject) => ({
          id: taskId(),
          title: (subjects.length > 1 ? `${taskSubject} · ${title.trim()}` : title.trim()).slice(0, 120),
          type, date: taskDate, ...(start ? { start } : {}),
          durationMinutes: Math.max(5, Math.min(600, duration || 30)),
          ...(taskSubject ? { subject: taskSubject.slice(0, 80), subjectId: catalog.find((item) => item.name === taskSubject)?.id } : {}),
          ...(presetId ? { presetId } : {}),
          ...(!multiSubject && (unit.trim() || selectedCueIds.length) ? { scope: { ...(unit.trim() ? { unit: unit.trim().slice(0, 120) } : {}), ...(selectedCueIds.length ? { cueIds: selectedCueIds } : {}) } } : {}),
          ...(Object.keys(materials).length ? { materials: Object.entries(materials).map(([code, progress]) => ({ code: code as keyof typeof materials, ...(progress.trim() ? { progress: progress.trim().slice(0, 200) } : {}) })) as ManualLearningTask['materials'] } : {}),
          ...(selectedPreset?.guide ? { guide: selectedPreset.guide } : {}),
          ...(note.trim() ? { note: note.trim().slice(0, 1000) } : {}),
        })));
      }}>
        <div className="flex items-center justify-between"><h2 id="task-dialog-title" className="text-xl font-semibold">添加学习任务</h2><button type="button" onClick={onClose} aria-label="关闭" className="grid h-10 w-10 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"><span aria-hidden="true" className="material-icons-round">close</span></button></div>
        <div className="mt-5 space-y-4">
          <label className="block text-sm font-medium">任务预设<select value={presetId} onChange={(event) => applyPreset(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3.5 py-2.5"><option value="">不使用预设</option>{(['常规学习', '复习与检查', '练习与修复', 'IELTS'] as const).map((group) => <optgroup key={group} label={group}>{LEARNING_TASK_PRESETS.filter((preset) => preset.group === group).map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</optgroup>)}</select></label>
          <label className="block text-sm font-medium">任务名称<input autoFocus required value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder="例如：整体复习" className="mt-2 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3.5 py-2.5 outline-none focus:border-[var(--brand)]" /></label>
          {presetId && <fieldset className="rounded-2xl border border-[var(--card-border)] p-4"><legend className="px-2 text-sm font-semibold">选择学科（可多选）</legend><div className="mb-2 flex gap-3 text-xs"><button type="button" onClick={() => updateSubjects(catalog.map((item) => item.name))} className="text-[var(--brand)]">全选</button><button type="button" onClick={() => updateSubjects([])} className="text-[var(--brand)]">清空</button></div><div className="grid max-h-40 gap-2 overflow-y-auto sm:grid-cols-2">{catalog.map((item) => <label key={item.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selectedSubjects.includes(item.name)} onChange={(event) => updateSubjects(event.target.checked ? [...selectedSubjects, item.name] : selectedSubjects.filter((name) => name !== item.name))} className="h-4 w-4 accent-[var(--brand)]" />{item.name}</label>)}</div>{!catalog.length && <p className="text-xs text-[var(--muted-foreground)]">先在设置中添加学科与单元分类。</p>}</fieldset>}
          <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">类型<select value={type} onChange={(event) => setType(event.target.value as ManualLearningTask['type'])} className="mt-2 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3.5 py-2.5"><option value="study">学习</option><option value="self-study">自学</option><option value="completeness-audit">完整性检查</option><option value="unit-review">单元复习</option><option value="cumulative-review">总复习</option><option value="practice">练习</option><option value="repair">修复</option><option value="preview">预习（可选）</option><option value="special">专项学习</option><option value="exam">考试</option><option value="custom">待办</option></select></label>{!presetId && <label className="text-sm font-medium">科目（可选）<select value={subject} onChange={(event) => { setSubject(event.target.value); setUnit(''); setSelectedCueIds([]); }} className="mt-2 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3.5 py-2.5"><option value="">请选择</option>{catalog.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></label>}</div>
          {!multiSubject && <label className="block text-sm font-medium">大单元（可选）<select value={unit} disabled={!selectedSubjectConfig} onChange={(event) => { setUnit(event.target.value); setSelectedCueIds([]); }} className="mt-2 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3.5 py-2.5 disabled:opacity-50"><option value="">请选择</option>{selectedSubjectConfig?.units.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label>}
          {!multiSubject && groupedCues.length > 0 && <fieldset className="rounded-2xl border border-[var(--card-border)] p-4"><legend className="px-2 text-sm font-semibold">按大单元 / 小单元选择 Cue</legend><div className="mb-3 flex items-center justify-between gap-2 text-xs text-[var(--muted-foreground)]"><span>已选 {selectedCueIds.length} / {scopedCues.length} 条</span><button type="button" onClick={() => toggleCueGroup(scopedCues.map((cue) => cue.id), selectedCueIds.length !== scopedCues.length)} className="font-semibold text-[var(--brand)]">{selectedCueIds.length === scopedCues.length ? '清空当前范围' : '全选当前范围'}</button></div><div className="max-h-64 space-y-3 overflow-y-auto">{groupedCues.map((subjectGroup) => <section key={subjectGroup.subject}><h3 className="text-xs font-semibold">{subjectGroup.subject}</h3>{subjectGroup.units.map((unitGroup) => { const unitIds = unitGroup.subsections.flatMap((group) => group.cues.map((cue) => cue.id)); return <div key={unitGroup.unit} className="ml-2 mt-2 border-l-2 border-[var(--card-border)] pl-3"><label className="flex items-center gap-2 text-xs font-semibold text-[var(--brand)]"><input type="checkbox" checked={unitIds.every((id) => selectedCueIds.includes(id))} onChange={(event) => toggleCueGroup(unitIds, event.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />{unitGroup.unit} · 全选</label>{unitGroup.subsections.map((subsectionGroup) => { const subsectionIds = subsectionGroup.cues.map((cue) => cue.id); return <div key={subsectionGroup.subsection} className="mt-2"><label className="flex items-center gap-2 text-[11px] text-[var(--muted-foreground)]"><input type="checkbox" checked={subsectionIds.every((id) => selectedCueIds.includes(id))} onChange={(event) => toggleCueGroup(subsectionIds, event.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />{subsectionGroup.subsection || '未分小单元'} · 全选</label>{subsectionGroup.cues.map((cue) => <label key={cue.id} className="mt-1 flex cursor-pointer items-start gap-2 rounded-lg p-2 hover:bg-black/[.035] dark:hover:bg-white/[.06]"><input type="checkbox" checked={selectedCueIds.includes(cue.id)} onChange={(event) => toggleCueGroup([cue.id], event.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--brand)]" /><span className="text-xs">[{cue.type.toUpperCase()}] <LatexRenderer content={cue.prompt} /></span></label>)}</div>; })}</div>; })}</section>)}</div></fieldset>}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3"><label className="text-sm font-medium">日期<input required type="date" value={taskDate} onChange={(event) => setTaskDate(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5" /></label><label className="text-sm font-medium">开始（可选）<input type="time" value={start} onChange={(event) => setStart(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5" /></label><label className="col-span-2 text-sm font-medium sm:col-span-1">分钟<input type="number" min={5} max={600} value={duration} onChange={(event) => setDuration(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5" /></label></div>
          <label className="block text-sm font-medium">备注<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={1000} className="mt-2 w-full resize-none rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3.5 py-2.5" /></label>
          <fieldset><legend className="text-sm font-medium">使用资料与计划范围（可多选）</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{LEARNING_MATERIALS.map((material) => { const checked = material.code in materials; return <div key={material.code} className={`rounded-xl border p-3 ${checked ? 'border-[var(--brand)] bg-blue-50/60 dark:bg-blue-950/25' : 'border-[var(--card-border)]'}`}><label className="flex cursor-pointer items-center gap-2 text-sm font-medium"><input type="checkbox" checked={checked} onChange={() => toggleMaterial(material.code)} className="h-4 w-4 accent-[var(--brand)]" /><span className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-xs dark:bg-white/10">{material.code}</span>{material.label}</label>{checked && <input value={materials[material.code]} onChange={(event) => setMaterials((current) => ({ ...current, [material.code]: event.target.value }))} maxLength={200} placeholder="例如：1.1–1.2 / P12–18 / Q1–8" className="mt-2 w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-2.5 py-2 text-xs" />}</div>; })}</div></fieldset>
        </div>
        <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-full border border-[var(--card-border)] px-5 py-2.5 text-sm font-medium">取消</button><button type="submit" disabled={!title.trim() || Boolean(presetId && !selectedSubjects.length && !subject)} className="rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40 dark:text-[#202124]">{selectedSubjects.length > 1 ? `添加 ${selectedSubjects.length} 项` : '添加'}</button></div>
      </form>
    </div>
  );
}

function cueStatusTone(status: LearningStatus): string {
  return status === 'stable'
    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
    : status === 'partial'
      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200'
      : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-200';
}

function CuePracticeHistoryBadge({ reviews, cueId }: { reviews: CueReview[]; cueId: string }) {
  const attempt = latestCuePracticeAttempt(reviews, cueId);
  if (!attempt) return null;
  return <span data-cue-practice-history title={`最近重练：${formatReviewTimestamp(attempt.reviewedAt)} · 原评价保留`} className={`rounded-full px-2 py-1 text-xs font-semibold ${attempt.status === 'stable' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200' : 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'}`}>{attempt.status === 'stable' ? '重练已通过' : '重练仍需巩固'}</span>;
}

function CueReviewDetailsDialog({ cue, reviews, onClose, onDifficulty }: { cue: StudyCue; reviews: CueReview[]; onClose: () => void; onDifficulty?: (difficulty?: CueDifficulty) => void }) {
  const history = reviews.filter((review) => review.cueId === cue.id).toSorted((left, right) => right.reviewedAt.localeCompare(left.reviewedAt));
  const stableCount = history.filter((review) => review.status === 'stable').length;
  const partialCount = history.filter((review) => review.status === 'partial').length;
  const unclearCount = history.filter((review) => review.status === 'unclear').length;
  const greenRate = history.length ? Math.round(stableCount / history.length * 100) : 0;
  const recent = history.slice(0, 3);
  const stability = !history.length ? '尚无测试记录' : recent.length === 3 && recent.every((review) => review.status === 'stable') ? '稳定，可逐步延长' : recent.some((review) => review.status === 'unclear') ? '不稳定，需要高频复习' : recent.some((review) => review.status === 'partial') ? '正在建立稳定性' : '初步稳定';
  return <div className="fixed inset-0 z-[90] grid place-items-center bg-black/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="cue-details-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-2xl">
      <div className="flex items-start gap-4"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-200"><span aria-hidden="true" className="material-icons-round">analytics</span></div><div className="min-w-0 flex-1"><p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--muted-foreground)]">Cue review details</p><h2 id="cue-details-title" className="mt-1 text-xl font-semibold"><LatexRenderer content={cue.prompt} /></h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">{cue.subjectName} · {cue.unit}{cue.subsection ? ` · ${cue.subsection}` : ''}</p></div><button type="button" onClick={onClose} aria-label="关闭详细信息" className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"><span aria-hidden="true" className="material-icons-round">close</span></button></div>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">{[['当前判断', cue.status ? statusMark(cue.status) : '未验证'], ['稳定度', stability], ['绿色比例', history.length ? `${greenRate}%` : '—'], ['当前间隔', `${cue.intervalDays} 天`]].map(([label, value]) => <div key={label} className="rounded-2xl bg-black/[.035] p-4 dark:bg-white/[.06]"><p className="text-xs text-[var(--muted-foreground)]">{label}</p><strong className="mt-1 block text-sm leading-5">{value}</strong></div>)}</div>
      <div className="mt-5"><CueDifficultyPicker compact={false} cue={cue} reviews={reviews} onChange={onDifficulty} /></div><section className="mt-5 rounded-2xl border border-[var(--card-border)] p-4"><h3 className="font-semibold">当前复习计划</h3><div className="mt-3 grid gap-3 text-sm sm:grid-cols-2"><p><span className="text-[var(--muted-foreground)]">下次复习：</span>{cue.nextReviewDate ?? '尚未安排'}</p><p><span className="text-[var(--muted-foreground)]">最近复习：</span>{cue.lastReviewedAt ? formatReviewTimestamp(cue.lastReviewedAt) : '从未复习'}</p><p><span className="text-[var(--muted-foreground)]">连续绿色：</span>{cue.streak} 次</p><p><span className="text-[var(--muted-foreground)]">历史调度参数：</span>{cue.easeFactor.toFixed(2)}</p><p><span className="text-[var(--muted-foreground)]">内容版本：</span>v{cue.version ?? 1}</p><p><span className="text-[var(--muted-foreground)]">内容更新：</span>{formatReviewTimestamp(cue.updatedAt)}</p></div>{history[0]?.scheduleReason && <p className="mt-4 rounded-xl bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800 dark:bg-blue-950/30 dark:text-blue-200"><strong>本次排期依据：</strong>{history[0].scheduleReason}</p>}</section>
      <section className="mt-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="font-semibold">测试历史</h3><p className="mt-1 text-xs text-[var(--muted-foreground)]">共 {history.length} 次{stableCount > 0 && ` · √ ${stableCount}`}{partialCount > 0 && ` · △ ${partialCount}`}{unclearCount > 0 && ` · ○ ${unclearCount}`}</p></div></div>{history.length ? <div className="mt-3 space-y-2">{history.map((review, index) => <article key={review.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--card-border)] p-3"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full font-bold ${cueStatusTone(review.status)}`}>{statusMark(review.status)}</span><div className="min-w-40 flex-1"><p className="text-sm font-semibold">{formatReviewTimestamp(review.reviewedAt)}{index === 0 ? ' · 最近一次' : ''}</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">间隔 {review.intervalDays ?? '旧记录'} 天 · 下次 {review.nextReviewDate}</p>{review.note && <p className="mt-1 text-xs leading-5">备注：{review.note}</p>}{Boolean(review.practiceAttempts?.length) && <ul className="mt-2 space-y-1 text-xs" aria-label="重练记录">{review.practiceAttempts?.map((attempt, attemptIndex) => <li key={`${attempt.reviewedAt}:${attemptIndex}`} className={attempt.status === 'stable' ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-800 dark:text-amber-300'}>{statusMark(attempt.status)} {attempt.status === 'stable' ? '重练已通过' : '重练仍需巩固'} · {formatReviewTimestamp(attempt.reviewedAt)}</li>)}</ul>}</div>{review.scheduleReason && <p className="w-full rounded-xl bg-black/[.035] px-3 py-2 text-xs leading-5 text-[var(--muted-foreground)] dark:bg-white/[.05]">{review.scheduleReason}</p>}</article>)}</div> : <p className="mt-3 rounded-2xl border border-dashed border-[var(--card-border)] py-10 text-center text-sm text-[var(--muted-foreground)]">还没有测试记录；第一次完成 √ / △ / ○ 后会在这里形成历史。</p>}</section>
      <div className="mt-6 flex justify-end"><button type="button" onClick={onClose} className="rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white dark:text-[#202124]">完成</button></div>
    </div>
  </div>;
}

function CueHierarchy({ cues, reviews, onDelete, onEdit, onDifficulty, searchHits }: { searchHits?: CueSearchHit[]; cues: StudyCue[]; reviews: CueReview[]; onDifficulty?: (id: string, difficulty?: CueDifficulty) => void; onDelete: (cue: StudyCue) => void; onEdit?: (cue: StudyCue) => void }) {
  const [detailCueId, setDetailCueId] = useState('');
  const grouped = searchHits ? [{ subject: '搜索结果', units: [{ unit: '大标题 → 小标题 → 答案 → MS', subsections: [{ subsection: '', cues }] }] }] : groupCues(cues);
  const hitById = new Map(searchHits?.map(hit => [hit.cue.id, hit]));
  const reviewsByCue = new Map<string, CueReview[]>();
  for (const review of reviews) reviewsByCue.set(review.cueId, [...(reviewsByCue.get(review.cueId) ?? []), review]);
  const detailCue = cues.find((cue) => cue.id === detailCueId);
  if (!cues.length) return <p className="mt-4 rounded-2xl border border-dashed border-[var(--card-border)] py-10 text-center text-sm text-[var(--muted-foreground)]">还没有匹配的 Cue。</p>;
  return <><div className="mt-4 space-y-5 pb-6">{grouped.map((subject) => <section key={subject.subject} className="rounded-3xl border border-[var(--card-border)] p-5"><h4 className="flex items-center gap-2 text-lg font-semibold"><span aria-hidden="true" className="material-icons-round text-xl text-[var(--brand)]">school</span>{subject.subject}</h4>{subject.units.map((unitGroup) => <div key={unitGroup.unit} className="ml-2 mt-4 border-l-2 border-[var(--card-border)] pl-5"><h5 className="font-semibold text-[var(--brand)]">{unitGroup.unit}</h5>{unitGroup.subsections.map((subsectionGroup) => <div key={subsectionGroup.subsection || unitGroup.unit} className="mt-4"><div className="mt-2 grid gap-3 xl:grid-cols-2">{subsectionGroup.cues.map((cue) => { const hit = hitById.get(cue.id); const cueReviews = (reviewsByCue.get(cue.id) ?? []).toSorted((left, right) => right.reviewedAt.localeCompare(left.reviewedAt)); const recent = cueReviews.slice(0, 3).toReversed(); return <article key={cue.id} className="rounded-2xl bg-black/[.035] p-4 dark:bg-white/[.06]"><div className="flex items-start gap-3"><div className="min-w-0 flex-1"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-[var(--muted-foreground)]">[{cue.type.toUpperCase()}]</span><div className="flex items-center gap-1" aria-label="最近 3 次测试结果"><span className="mr-1 text-[10px] text-[var(--muted-foreground)]">近3次</span>{recent.length ? recent.map((review) => <span key={review.id} title={formatReviewTimestamp(review.reviewedAt)} className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold ${cueStatusTone(review.status)}`}>{statusMark(review.status)}</span>) : <span className="text-[10px] text-[var(--muted-foreground)]">暂无</span>}</div></div><div className="font-semibold">{hit && <div className="mb-2 text-xs font-normal text-[var(--muted-foreground)]">{cue.subjectName} · {cue.unit}{cue.subsection ? ` · ${cue.subsection}` : ''}</div>}<LatexRenderer content={cue.prompt} /></div>{cue.subtitle && <div className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]"><LatexRenderer content={cue.subtitle} /></div>}{cue.answer && <div className="mt-2 text-sm leading-6"><span className="mr-1 font-medium">参考：</span><LatexRenderer content={cue.answer} /></div>}{cue.markingPoints.length > 0 && <div className="mt-2 space-y-1 text-xs leading-5 text-[var(--muted-foreground)]"><span className="font-medium">Marking points：</span>{cue.markingPoints.map((point) => <div key={point} className="pl-2"><LatexRenderer content={point} /></div>)}</div>}{hit && <div className="mt-3 whitespace-pre-wrap break-words rounded-xl border border-amber-200/60 bg-amber-50/50 p-3 text-sm dark:border-amber-800/60 dark:bg-amber-950/20"><span className="mr-2 text-xs text-[var(--muted-foreground)]">命中{({prompt:'大标题',subtitle:'小标题',answer:'答案',ms:'MS',location:'学科或单元'})[hit.field]}</span>{cueHighlightParts(hit.text, hit.terms).map((part,index) => part.hit ? <mark key={index} className="rounded bg-amber-200 px-0.5 text-amber-950 dark:bg-amber-700 dark:text-white">{part.text}</mark> : <span key={index}>{part.text}</span>)}</div>}<div className="mt-3 flex flex-wrap items-center gap-2 text-xs"><span className={`rounded-full px-2 py-1 font-bold ${cue.status ? cueStatusTone(cue.status) : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200'}`}>{cue.status ? statusMark(cue.status) : '未验证'}</span><CuePracticeHistoryBadge reviews={cueReviews} cueId={cue.id} /><span className="text-[var(--muted-foreground)]">{CUE_DISPLAY_OPTIONS.find((item) => item.value === (cue.display ?? 'standard'))?.label}</span><span className="text-[var(--muted-foreground)]">检索 {cueReviews.length} 次</span><span className="text-[var(--muted-foreground)]">连续通过 {cue.streak}</span><span className="text-[var(--muted-foreground)]">间隔 {cue.intervalDays} 天</span>{cue.nextReviewDate && <span className="text-[var(--muted-foreground)]">下次 {cue.nextReviewDate}</span>}</div><div className="mt-4 flex flex-wrap gap-2">{onEdit && <button type="button" onClick={() => onEdit(cue)} className="min-h-11 rounded-full border border-[var(--brand)] px-4 py-2 text-xs font-semibold text-[var(--brand)]">编辑 Cue</button>}<button type="button" onClick={() => setDetailCueId(cue.id)} className="inline-flex items-center gap-1 rounded-full border border-[var(--card-border)] px-3 py-1.5 text-xs font-semibold hover:border-[var(--brand)] hover:text-[var(--brand)]"><span aria-hidden="true" className="material-icons-round text-base">info</span>详细信息</button><button type="button" onClick={() => onDelete(cue)} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-[var(--muted-foreground)] hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"><span aria-hidden="true" className="material-icons-round text-base">delete</span>删除</button></div></div></div></article>; })}</div></div>)}</div>)}</section>)}</div>{detailCue && <CueReviewDetailsDialog onDifficulty={onDifficulty ? (difficulty) => onDifficulty(detailCue.id, difficulty) : undefined} cue={detailCue} reviews={reviewsByCue.get(detailCue.id) ?? []} onClose={() => setDetailCueId('')} />}</>;
}

function CueBulkImportDialog({ subjectName, knownUnits, cues, onClose, onApply, saveOnRead = false }: { subjectName: string; knownUnits: string[]; cues: StudyCue[]; onClose: () => void; onApply: (operations: CueBulkOperation[], markAsBatch?: boolean) => void | { createdCount: number; modifiedCount: number }; saveOnRead?: boolean }) {
  const [mode, setMode] = useState<'json' | 'ai'>('json');
  const [source, setSource] = useState('');
  const [preview, setPreview] = useState<CueBulkOperation[] | null>(null);
  const [unitMappings, setUnitMappings] = useState<Record<string, string>>({});
  const [unitsConfirmed, setUnitsConfirmed] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [savedSource, setSavedSource] = useState<string | null>(null);
  const [markAsBatch, setMarkAsBatch] = useState(false);
  const lastAppliedSourceRef = useRef('');
  const normalizeUnit = (value: string) => value.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const cueById = useMemo(() => new Map(cues.map((cue) => [cue.id, cue])), [cues]);
  const exportData = useMemo(() => ({ version: 1, operations: cueExportOperations(cues) }), [cues]);
  const aiPrompt = useMemo(() => cueImportPrompt(subjectName, knownUnits, cues), [subjectName, knownUnits, cues]);
  const validate = (value: unknown) => {
    const operations = parseCueBulkImport(value).operations;
    const ids = new Set(cues.map((cue) => cue.id));
    const unknown = operations.find((operation) => operation.action === 'update' && !ids.has(operation.id));
    if (unknown?.action === 'update') throw new Error('修改操作包含当前范围之外的 Cue id：' + unknown.id);
    return operations;
  };
  const saveOperations = (operations: CueBulkOperation[], input: string) => {
    if (saveOnRead && input === lastAppliedSourceRef.current) return;
    lastAppliedSourceRef.current = input;
    try {
      const result = onApply(operations, markAsBatch);
      const creates = operations.filter((operation) => operation.action === 'create').length;
      setPreview(operations);
      setUnitsConfirmed(true);
      setSavedSource(input);
      setMessage(`已保存：创建 ${result?.createdCount ?? creates} 条、修改 ${result?.modifiedCount ?? operations.length - creates} 条。${markAsBatch || (result?.createdCount ?? creates) + (result?.modifiedCount ?? operations.length - creates) >= 5 ? '已记录整批更新。' : '本次不计入整批更新。'}窗口保持打开；修改输入后可继续导入。`);
    } catch (error) {
      lastAppliedSourceRef.current = '';
      setMessage(error instanceof Error ? error.message : 'Cue 保存失败，请检查内容后重试。');
    }
  };
  const preparePreview = (operations: CueBulkOperation[], nextMessage: string, input: string) => {
    const returnedUnits = [...new Set(operations.flatMap((operation) => operation.unit ? [operation.unit] : []))];
    const mappings = Object.fromEntries(returnedUnits.map((sourceUnit) => [
      sourceUnit,
      knownUnits.find((knownUnit) => normalizeUnit(knownUnit) === normalizeUnit(sourceUnit)) ?? sourceUnit,
    ]));
    setUnitMappings(mappings);
    setPreview(operations);
    const needsUnitReview = returnedUnits.length > 0 && (!saveOnRead || returnedUnits.some((sourceUnit) => !knownUnits.some((knownUnit) => normalizeUnit(knownUnit) === normalizeUnit(sourceUnit))));
    setUnitsConfirmed(!needsUnitReview);
    if (saveOnRead && !needsUnitReview) {
      saveOperations(applyCueUnitMappings(operations, mappings), input);
      return;
    }
    setMessage(nextMessage);
  };
  const parseSource = (value: string) => {
    if (saveOnRead && savedSource !== null && value === savedSource) { setMessage('这份内容已保存。修改输入后可继续导入。'); return; }
    try {
      const operations = validate(parseAiJson(value));
      const creates = operations.filter((operation) => operation.action === 'create').length;
      preparePreview(operations, '已读取 ' + creates + ' 条创建、' + (operations.length - creates) + ' 条修改。', value);
    } catch (error) {
      setPreview(null);
      setMessage(error instanceof Error ? error.message : 'Cue 配置无法读取。');
    }
  };
  const runAi = async () => {
    if (!source.trim()) return;
    if (saveOnRead && savedSource !== null && source === savedSource) { setMessage('这份要求已保存。修改输入后可继续导入。'); return; }
    setBusy(true);
    setMessage('AI 正在按你的要求生成操作预览…');
    setPreview(null);
    try {
      const response = await fetch('/api/llm-proxy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feature: 'chat', stream: false, temperature: 0.1, _no_thinking: true, messages: [{ role: 'system', content: aiPrompt }, { role: 'user', content: source.slice(0, 40_000) }] }) });
      const operations = validate(parseAiJson(await readAiResponseContent(response)));
      const creates = operations.filter((operation) => operation.action === 'create').length;
      preparePreview(operations, 'AI 返回 ' + creates + ' 条创建、' + (operations.length - creates) + ' 条修改。', source);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'AI 操作生成失败。');
    } finally {
      setBusy(false);
    }
  };
  if (preview && !unitsConfirmed) {
    const returnedUnits = [...new Set(preview.flatMap((operation) => operation.unit ? [operation.unit] : []))];
    return <div className="fixed inset-0 z-[80] grid place-items-center bg-black/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="cue-unit-review-title"><div className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><h2 id="cue-unit-review-title" className="text-xl font-semibold">核对操作中的单元</h2><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">创建和修改会一起执行。请先确认操作中出现的大单元；相同名称会统一映射。</p></div><button type="button" onClick={onClose} aria-label="关闭" className="grid h-10 w-10 place-items-center rounded-full hover:bg-black/5"><span aria-hidden="true" className="material-icons-round">close</span></button></div><div className="mt-5 space-y-3">{returnedUnits.map((sourceUnit) => { const isKnown = knownUnits.some((knownUnit) => normalizeUnit(knownUnit) === normalizeUnit(sourceUnit)); return <div key={sourceUnit} className="rounded-2xl border border-[var(--card-border)] p-4"><p className="text-xs text-[var(--muted-foreground)]">操作中填写</p><p className="mt-1 font-semibold">{sourceUnit}</p><label className="mt-3 block text-sm font-medium">实际使用<select value={unitMappings[sourceUnit] ?? sourceUnit} onChange={(event) => setUnitMappings((current) => ({ ...current, [sourceUnit]: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5">{!isKnown && <option value={sourceUnit}>保留并新建“{sourceUnit}”</option>}{knownUnits.map((knownUnit) => <option key={knownUnit} value={knownUnit}>{knownUnit}</option>)}</select></label></div>; })}</div><div className="mt-5 flex flex-wrap justify-end gap-3"><button type="button" onClick={() => setPreview(null)} className="rounded-full border border-[var(--card-border)] px-5 py-2.5 text-sm">返回修改内容</button><button type="button" onClick={() => { const mapped = applyCueUnitMappings(preview, unitMappings); if (saveOnRead) saveOperations(mapped, source); else { setPreview(mapped); setUnitsConfirmed(true); } }} className="rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white dark:text-[#202124]">{saveOnRead ? '确认单元并保存' : '确认单元并查看操作'}</button></div></div></div>;
  }
  const createCount = preview?.filter((operation) => operation.action === 'create').length ?? 0;
  const updateCount = (preview?.length ?? 0) - createCount;
  return <div className="fixed inset-0 z-[80] grid place-items-center bg-black/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="cue-import-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="max-h-[90dvh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><h2 id="cue-import-title" className="text-xl font-semibold">批量创建 / 修改 Cue</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">学科：{subjectName} · 当前范围 {cues.length} 条。一个 JSON 可以同时创建新 Cue 和修改旧 Cue。</p></div><button type="button" onClick={onClose} aria-label="关闭" className="grid h-10 w-10 place-items-center rounded-full hover:bg-black/5"><span aria-hidden="true" className="material-icons-round">close</span></button></div><div className="mt-4 inline-flex rounded-full bg-black/5 p-1 dark:bg-white/10"><button type="button" onClick={() => { setMode('json'); setPreview(null); }} className={mode === 'json' ? 'rounded-full bg-[var(--card)] px-4 py-2 text-sm font-semibold shadow-sm' : 'rounded-full px-4 py-2 text-sm'}>JSON 导入 / 编辑</button><button type="button" onClick={() => { setMode('ai'); setPreview(null); }} className={mode === 'ai' ? 'rounded-full bg-[var(--card)] px-4 py-2 text-sm font-semibold shadow-sm' : 'rounded-full px-4 py-2 text-sm'}>AI 按要求处理</button></div><div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50/70 p-3 text-xs leading-5 text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">每项先写 <code>action</code>：<code>create</code>（创建）或 <code>update</code>（修改）。修改必须使用已导出的原 Cue ID；未写的字段保持不变。AI 提示词会附带当前学科的允许单元，除非你明确要求，否则不得新建或改写单元名。</div><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => downloadStudyJson(exportData, 'cue-data.json')} className="rounded-full border border-[var(--card-border)] px-4 py-2 text-sm font-medium">导出当前数据</button><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(aiPrompt); setMessage('提示词、CUE RULES、允许单元和当前数据已复制；请附上当前笔记和要求。'); } catch { setSource(aiPrompt); setMessage('复制失败，可在文本框手动复制提示词及数据；这段提示词不能直接作为 JSON 导入。'); } }} className="rounded-full border border-[var(--card-border)] px-4 py-2 text-sm font-medium">复制提示词及数据</button>{mode === 'json' && <label className="cursor-pointer rounded-full border border-[var(--card-border)] px-4 py-2 text-sm font-medium">选择 JSON<input type="file" accept="application/json,.json" className="hidden" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; const textValue = await file.text(); setSource(textValue); parseSource(textValue); }} /></label>}</div><label className="mt-4 flex items-start gap-2 text-xs leading-5 text-[var(--muted-foreground)]"><input type="checkbox" checked={markAsBatch} onChange={(event) => setMarkAsBatch(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--brand)]" /><span>本次手动记为整批更新；未勾选时，只有实际新增或修改至少 5 条才自动记录。</span></label><textarea value={source} onChange={(event) => { setSource(event.target.value); setPreview(null); setMessage(''); }} rows={14} placeholder={mode === 'ai' ? '在这里写你的要求并粘贴笔记，例如：根据下面的新笔记更新已有 Cue，同时补充缺少的 Cue……' : '粘贴 operations JSON；每项写 action，修改项还要写 id。'} className="mt-4 w-full rounded-2xl border border-[var(--card-border)] bg-[var(--background)] p-4 font-mono text-xs leading-5" /><button type="button" disabled={busy || !source.trim() || saveOnRead && savedSource !== null && source === savedSource} onClick={() => mode === 'json' ? parseSource(source) : runAi()} className="mt-3 rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 dark:text-[#202124]">{busy ? '处理中…' : saveOnRead && savedSource !== null && source === savedSource ? '已保存' : mode === 'json' ? saveOnRead ? '读取并保存' : '检查并预览' : saveOnRead ? '让 AI 处理并保存' : '让 AI 按我的要求处理'}</button>{message && <p role="status" className="mt-3 rounded-xl bg-black/5 px-3 py-2 text-sm dark:bg-white/10">{message}</p>}{preview && <div className="mt-4 max-h-80 space-y-2 overflow-y-auto">{preview.map((operation, index) => { const existing = operation.action === 'update' ? cueById.get(operation.id) : undefined; return <article key={operation.action === 'update' ? operation.id : 'create-' + index} className="rounded-xl border border-[var(--card-border)] p-3"><p className="text-xs font-semibold text-[var(--brand)]">{operation.action === 'create' ? '创建' : '修改 · ' + operation.id}{operation.unit ? ' · ' + operation.unit : ''}</p><p className="mt-1 text-sm font-medium">{operation.prompt ?? existing?.prompt}</p>{operation.action === 'update' && <p className="mt-1 text-xs text-[var(--muted-foreground)]">修改字段：{Object.keys(operation).filter((key) => key !== 'action' && key !== 'id').join('、')}</p>}</article>; })}</div>}<div className="mt-5 flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-full border border-[var(--card-border)] px-5 py-2.5 text-sm">{saveOnRead && savedSource !== null && source === savedSource ? '完成' : '取消'}</button>{!saveOnRead && <button type="button" disabled={!preview} onClick={() => preview && onApply(preview, markAsBatch)} className="rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40 dark:text-[#202124]">执行：创建 {createCount} · 修改 {updateCount}</button>}</div></div></div>;
}

function HighlightedCueSimilarityText({ text, sharedTerms }: { text: string; sharedTerms: string[] }) {
  const shared = new Set(sharedTerms);
  return <div className="min-w-0 overflow-x-auto whitespace-pre-wrap text-lg font-semibold leading-8">{splitMathText(text).map((part, partIndex) => part.type === 'text'
    ? <span key={partIndex}>{part.value.split(/([\p{L}\p{N}]+)/gu).map((word, wordIndex) => {
      const key = cueSimilarityTermKey(word);
      const matches = Boolean(key && shared.has(key)) || /^\p{Script=Han}+$/u.test(word) && sharedTerms.some((term) => word.includes(term));
      return matches ? <mark key={wordIndex} className="rounded bg-amber-200 px-0.5 text-amber-950 dark:bg-amber-500/70 dark:text-white">{word}</mark> : word;
    })}</span>
    : <LatexRenderer key={partIndex} content={part.type === 'latex-block' ? `\\[${part.value}\\]` : `\\(${part.value}\\)`} />
  )}</div>;
}

function sharedCueProseTerms(left: StudyCue, right: StudyCue): string[] {
  const proseTerms = (cue: StudyCue) => new Set([cue.prompt, cue.answer ?? ''].flatMap((content) => splitMathText(content).flatMap((part) => part.type === 'text' ? part.value.split(/([\p{L}\p{N}]+)/gu).map(cueSimilarityTermKey).filter(Boolean) : [])));
  const leftTerms = proseTerms(left);
  const rightTerms = proseTerms(right);
  return [...leftTerms].filter((term) => rightTerms.has(term));
}

function SimilarCueColumn({ cue, side, sharedPromptTerms, sharedAnswerTerms, onDelete }: { cue: StudyCue; side: '左边' | '右边'; sharedPromptTerms: string[]; sharedAnswerTerms: string[]; onDelete: () => void }) {
  return <article className="flex min-h-72 flex-col rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><span className="rounded-full bg-black/5 px-2.5 py-1 text-xs font-bold dark:bg-white/10">{side} CUE</span><span className="text-xs text-[var(--muted-foreground)]"><LatexRenderer content={[cue.unit, cue.subsection].filter(Boolean).join(' · ')} /></span></div>
    <div className="mt-5 flex-1"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">TOPIC / 题目</p><HighlightedCueSimilarityText text={cue.prompt} sharedTerms={sharedPromptTerms} />{cue.subtitle && <div className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]"><LatexRenderer content={cue.subtitle} /></div>}{cue.answer && <div className="mt-4 rounded-2xl bg-black/[.035] p-3 text-sm leading-6 dark:bg-white/[.06]"><span className="font-medium">参考：</span><HighlightedCueSimilarityText text={cue.answer} sharedTerms={sharedAnswerTerms} /></div>}</div>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--card-border)] pt-4"><span className="text-xs text-[var(--muted-foreground)]">v{cue.version ?? 1} · 更新 {formatReviewTimestamp(cue.updatedAt)}</span><button type="button" onClick={onDelete} className="rounded-full border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-200 dark:hover:bg-rose-950/40">删除{side}</button></div>
  </article>;
}

function SimilarCueToolDialog({ subjectName, cues, decisions, onDecisionsChange, onDelete, onClose }: { subjectName: string; cues: StudyCue[]; decisions: CueSimilarityDecision[]; onDecisionsChange: (update: (current: CueSimilarityDecision[]) => CueSimilarityDecision[]) => void; onDelete: (cueId: string) => Promise<boolean>; onClose: () => void }) {
  const pairs = useMemo(() => findSimilarCuePairs(cues, 72), [cues]);
  const visiblePairs = unreviewedCuePairs(pairs, decisions);
  const visibleSet = new Set(visiblePairs);
  const reviewedPairs = pairs.filter((pair) => !visibleSet.has(pair));
  const reviewedIds = new Set(reviewedPairs.map((pair) => differentCuePair(pair.left, pair.right, '').id));
  const latestDecision = decisions.toReversed().find((decision) => reviewedIds.has(decision.id));
  const current = visiblePairs[0];
  const sharedProseTerms = current ? sharedCueProseTerms(current.left, current.right) : [];
  const markDifferent = () => {
    if (!current) return;
    onDecisionsChange((items) => [...reopenCuePair(items, current.left.id, current.right.id), differentCuePair(current.left, current.right, new Date().toISOString())]);
  };
  const deleteCue = (cueId: string) => {
    if (!current) return;
    onDelete(cueId);
  };
  return <div className="fixed inset-0 z-[85] grid place-items-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="similar-cue-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="max-h-[94dvh] w-full max-w-[1500px] overflow-y-auto rounded-3xl border border-[var(--card-border)] bg-[var(--background)] p-6 shadow-2xl">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.12em] text-violet-600 dark:text-violet-300">Cue similarity inspector</p><h2 id="similar-cue-title" className="mt-1 text-2xl font-semibold">相似 CUE 检查 · {subjectName}</h2><p className="mt-2 text-sm text-[var(--muted-foreground)]">题目相似度达到 72% 后，还会比较答案；两边答案都存在时，答案相似度低于 60% 的组合会被排除。题目和答案中的共同文字词高亮，公式按数学格式显示。</p></div><button type="button" onClick={onClose} aria-label="关闭相似 CUE 检查" className="grid h-10 w-10 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"><span aria-hidden="true" className="material-icons-round">close</span></button></div>
      {latestDecision && <div className="mt-3 flex justify-end"><button type="button" onClick={() => onDecisionsChange((items) => reopenCuePair(items, latestDecision.leftCueId, latestDecision.rightCueId))} className="rounded-full border border-[var(--card-border)] px-3 py-1.5 text-xs font-semibold">撤销上一次“不同”判定</button></div>}
      {current ? <><div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--card-border)] px-4 py-3 text-sm"><span>还剩 <strong>{visiblePairs.length}</strong> 组需要判断</span><span className="text-[var(--muted-foreground)]">按相似度从高到低显示</span></div><div className="mt-5 grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_210px_minmax(0,1fr)]"><SimilarCueColumn cue={current.left} side="左边" sharedPromptTerms={current.sharedPromptTerms} sharedAnswerTerms={current.sharedAnswerTerms} onDelete={async () => (await deleteCue(current.left.id))} /><aside className="flex flex-col justify-center rounded-3xl border border-violet-200 bg-violet-50/70 p-5 text-center dark:border-violet-900 dark:bg-violet-950/30"><strong className="text-4xl text-violet-700 dark:text-violet-200">{current.similarity}%</strong><span className="mt-1 text-sm font-semibold">相似</span><div className="my-4 h-px bg-violet-200 dark:bg-violet-800" /><p className="text-xs leading-5 text-[var(--muted-foreground)]">共同文字词 {sharedProseTerms.length} 个<br />左 {current.leftTermCount} · 右 {current.rightTermCount}</p><div className="mt-3 flex flex-wrap justify-center gap-1.5">{sharedProseTerms.slice(0, 12).map((term) => <span key={term} className="rounded-full bg-amber-200 px-2 py-1 text-[11px] font-semibold text-amber-950 dark:bg-amber-500/70 dark:text-white">{term}</span>)}</div></aside><SimilarCueColumn cue={current.right} side="右边" sharedPromptTerms={current.sharedPromptTerms} sharedAnswerTerms={current.sharedAnswerTerms} onDelete={async () => (await deleteCue(current.right.id))} /></div><div className="mt-5 flex flex-wrap justify-center gap-3"><button type="button" onClick={markDifferent} className="rounded-full border border-[var(--card-border)] px-5 py-2.5 text-sm font-semibold">这两条不同 · 查看下一组</button><button type="button" onClick={async () => (await deleteCue(current.left.id))} className="rounded-full bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white">删除左边 · 保留右边</button><button type="button" onClick={async () => (await deleteCue(current.right.id))} className="rounded-full bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white">删除右边 · 保留左边</button></div></> : <div className="mt-8 rounded-3xl border border-dashed border-[var(--card-border)] py-16 text-center"><span aria-hidden="true" className="material-icons-round text-5xl text-emerald-500">task_alt</span><h3 className="mt-3 text-xl font-semibold">没有待处理的相似 CUE</h3><p className="mt-2 text-sm text-[var(--muted-foreground)]">此科目没有达到 72% 阈值的组合，或配对已经判断为不同。</p><button type="button" onClick={onClose} className="mt-5 rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white dark:text-[#202124]">完成</button></div>}
      {reviewedPairs.length > 0 && <details className="mt-5 rounded-2xl border border-[var(--card-border)] p-4 text-sm"><summary className="cursor-pointer font-semibold">已判为不同 · {reviewedPairs.length} 组（可撤销）</summary><div className="mt-3 space-y-2">{reviewedPairs.map((pair) => <div key={`${pair.left.id}:${pair.right.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-black/[.035] p-3 dark:bg-white/[.05]"><span className="min-w-0 flex-1 break-words"><LatexRenderer content={pair.left.prompt} /> <span className="text-[var(--muted-foreground)]">／</span> <LatexRenderer content={pair.right.prompt} /></span><button type="button" onClick={() => onDecisionsChange((items) => reopenCuePair(items, pair.left.id, pair.right.id))} className="shrink-0 rounded-full border border-[var(--card-border)] px-3 py-1.5 font-semibold">撤销并重新判断</button></div>)}</div></details>}
    </div>
  </div>;
}

function CueManagerDialog({ cues, reviews, catalog, collectionUpdates, changeHistory, similarityDecisions, onSimilarityDecisionsChange, reminderDays, initialSubjectName, showMastered, onClose, onChange }: { cues: StudyCue[]; reviews: CueReview[]; catalog: LearningCatalogSubject[]; collectionUpdates: CueCollectionUpdate[]; changeHistory: CueChangeRecord[]; similarityDecisions: CueSimilarityDecision[]; onSimilarityDecisionsChange: (update: (current: CueSimilarityDecision[]) => CueSimilarityDecision[]) => void; reminderDays: number; initialSubjectName?: string; showMastered: boolean; onClose: () => void; onChange: (cues: StudyCue[], catalog?: LearningCatalogSubject[], batchUpdate?: CueCollectionUpdate, source?: CueChangeSource) => void }) {
  const [subjectName, setSubjectName] = useState(() => catalog.some((item) => item.name === initialSubjectName) ? initialSubjectName ?? '' : '');
  const [unit, setUnit] = useState('');
  const [subsection, setSubsection] = useState('');
  const [editingId, setEditingId] = useState('');
  const [editNotice, setEditNotice] = useState('');
  const editorRef = useRef<HTMLFormElement>(null);
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
  const [filterStatus, setFilterStatus] = useState<CueStatusFilter>('all');
  const [bulkImport, setBulkImport] = useState(false);
  const [similarityTool, setSimilarityTool] = useState(false);
  const [memoryImport, setMemoryImport] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const selectedSubjectConfig = catalog.find((item) => item.name === subjectName);
  const latestCollectionUpdate = collectionUpdates.filter((update) => update.subjectName === subjectName && isRecordedCueCollectionBatch(update)).toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  const enrichmentCues = cues.filter((cue) => cue.subjectName === subjectName);
  const filterSubjects = [...new Set(cues.map((cue) => cue.subjectName))];
  const filterUnits = [...new Set(cues.filter((cue) => !filterSubject || cue.subjectName === filterSubject).map((cue) => cue.unit))];
  const reviewsByCue = new Map<string, CueReview[]>();
  for (const review of reviews) reviewsByCue.set(review.cueId, [...(reviewsByCue.get(review.cueId) ?? []), review]);
  const scopedCues = cues.filter((cue) => (showMastered || filterStatus !== 'all' || cue.status !== 'stable') && cueMatchesStatusFilter(cue, filterStatus, dateKey(new Date()), reviewsByCue.get(cue.id)) && (!filterSubject || cue.subjectName === filterSubject) && (!filterUnit || cue.unit === filterUnit));
  const search = searchCues(scopedCues, query);
  const filtered = search.hits.map(hit => hit.cue);
  const deleteCue = async (cueId: string): Promise<boolean> => {
    const cue = cues.find((item) => item.id === cueId);
    if (!cue || !(await siteConfirm(`确定删除这条 Cue 吗？\n\n${cue.prompt.slice(0, 100)}\n\n删除后相关备忘录也会移除。`))) return false;
    onChange(cues.filter((item) => item.id !== cueId));
    return true;
  };
  const makeCue = (item: CueCreateOperation, now: string): StudyCue => {
    const resolvedSubjectName = item.subjectName?.trim() || subjectName;
    const resolvedSubject = catalog.find((subject) => subject.name.trim().toLocaleLowerCase() === resolvedSubjectName.toLocaleLowerCase());
    return {
      id: taskId(), subjectId: resolvedSubject?.id ?? subjectIdFromName(resolvedSubjectName), subjectName: resolvedSubject?.name ?? resolvedSubjectName, unit: item.unit, subsection: '',
      prompt: item.prompt, ...(item.subtitle ? { subtitle: item.subtitle } : {}), ...(item.answer ? { answer: item.answer } : {}), type: item.type, display: item.display, ...(item.choices ? { choices: item.choices, correctChoice: item.correctChoice } : {}), markingPoints: item.markingPoints,
      version: 1, intervalDays: 0, easeFactor: 2.5, streak: 0, nextReviewDate: addCalendarDays(dateKey(new Date()), 1), createdAt: now, updatedAt: now,
    };
  };
  const resetEditor = () => {
    setEditingId(''); setPrompt(''); setSubtitle(''); setAnswer(''); setSubsection('');
    setChoices(''); setCorrectChoice(0); setMarkingPoints(''); setType('general'); setDisplay('standard');
  };
  const editCue = (cue: StudyCue) => {
    setEditingId(cue.id); setSubjectName(cue.subjectName); setUnit(cue.unit); setSubsection(cue.subsection);
    setPrompt(cue.prompt); setSubtitle(cue.subtitle ?? ''); setAnswer(cue.answer ?? '');
    setType(cue.type); setDisplay(cue.display ?? 'standard'); setChoices((cue.choices ?? []).join('\n'));
    setCorrectChoice(cue.correctChoice ?? 0); setMarkingPoints(cue.markingPoints.join('\n')); setEditNotice('');
    queueMicrotask(() => {
      editorRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      editorRef.current?.focus({ preventScroll: true });
    });
  };
  const createCue = (event: React.FormEvent) => {
    event.preventDefault();
    if (!subjectName || !unit || !prompt.trim()) return;
    const cueChoices = choices.split('\n').map((value) => value.trim()).filter(Boolean).slice(0, 6);
    if ((type === 'multiple-choice' || display === 'multiple-choice') && (cueChoices.length < 2 || correctChoice < 0 || correctChoice >= cueChoices.length)) { setEditNotice('选择题需要 2–6 个选项，并选择有效的正确答案。'); return; }
    const item: CueCreateOperation = { action: 'create', unit, prompt: prompt.trim().slice(0, 500), ...(subtitle.trim() ? { subtitle: subtitle.trim().slice(0, 500) } : {}), ...(answer.trim() ? { answer: answer.trim().slice(0, 2000) } : {}), type, display, ...(type === 'multiple-choice' || display === 'multiple-choice' ? { choices: cueChoices, correctChoice } : {}), markingPoints: markingPoints.split('\n').map((value) => value.trim()).filter(Boolean).slice(0, 12) };
    const now = new Date().toISOString();
    if (editingId) {
      if (!cues.some((cue) => cue.id === editingId)) { setEditNotice('这条 Cue 已被移除，请重新选择。'); return; }
      try {
        const operations = parseCueBulkImport({ version: 1, operations: [{ ...item, action: 'update', id: editingId, subjectName, subsection, subtitle: subtitle.trim(), answer: answer.trim() }] }).operations;
        const updated = applyCueBulkOperations(cues, operations, (operation) => makeCue(operation, now), now).map((cue) => cue.id === editingId ? { ...cue, subjectId: selectedSubjectConfig?.id ?? subjectIdFromName(subjectName) } : cue);
        onChange(updated);
        setEditNotice('修改已保存，学习历史与备忘录保留。');
      } catch (error) { setEditNotice(error instanceof Error ? error.message : '无法保存修改'); return; }
    } else {
      onChange([...cues, { ...makeCue(item, now), subsection: subsection.trim().slice(0, 120) }]);
      setEditNotice('Cue 已添加。');
    }
    resetEditor();
  };
  const collectionUpdate = (updatedAt: string, summary: ReturnType<typeof cueCollectionSummaryForSubject>, manuallyMarked = false): CueCollectionUpdate => {
    const { subjectName, createdCount, modifiedCount, totalCueCount } = summary;
    const subject = catalog.find((item) => item.name === subjectName);
    return {
      id: `cue-collection-${taskId()}`,
      subjectId: subject?.id ?? subjectIdFromName(subjectName),
      subjectName,
      updatedAt,
      nextReminderDate: nextCueCollectionReminderDate(updatedAt, reminderDays),
      createdCount,
      modifiedCount,
      totalCueCount,
      ...(manuallyMarked ? { manuallyMarked: true } : {}),
    };
  };
  const applyBulkOperations = (operations: CueBulkOperation[], targetSubjectName = subjectName, markAsBatch = false, source: CueChangeSource = 'import') => {
    const now = new Date().toISOString();
    const beforeById = new Map(cues.map((cue) => [cue.id, cue]));
    const appliedCues = applyCueBulkOperations(cues, operations, (item) => makeCue(item, now), now);
    const createdCount = appliedCues.filter((cue) => !beforeById.has(cue.id)).length;
    const modifiedCount = appliedCues.filter((cue) => beforeById.has(cue.id) && beforeById.get(cue.id) !== cue).length;
    const updatedCues = appliedCues.map((cue) => {
      const subject = catalog.find((item) => item.name.trim().toLocaleLowerCase() === cue.subjectName.trim().toLocaleLowerCase());
      return subject ? { ...cue, subjectId: subject.id, subjectName: subject.name } : cue;
    });
    const nextCatalog = catalog.map((subject) => {
      const importedUnits = updatedCues.filter((cue) => cue.subjectId === subject.id).map((cue) => cue.unit);
      const known = new Set(subject.units.map((item) => item.name.trim().toLocaleLowerCase()));
      const additions = [...new Set(importedUnits.filter((name) => !known.has(name.trim().toLocaleLowerCase())))];
      return additions.length ? { ...subject, units: [...subject.units, ...additions.map((name) => ({ name, subsections: [] }))] } : subject;
    });
    const summary = cueCollectionSummaryForSubject(cues, updatedCues, targetSubjectName);
    onChange(updatedCues, nextCatalog, isCueCollectionBatch(summary, markAsBatch) ? collectionUpdate(now, summary, markAsBatch) : undefined, source);
    return { createdCount, modifiedCount };
  };
  return <div className={`${styles.cueManager} fixed inset-0 z-[70] grid place-items-center bg-black/45 p-2 sm:p-4 backdrop-blur-sm`} role="dialog" aria-modal="true" aria-labelledby="cue-manager-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="grid h-[94dvh] min-h-0 w-full max-w-[1500px] grid-rows-[auto_auto] overflow-y-auto xl:grid-rows-[auto_minmax(0,1fr)] xl:overflow-hidden rounded-3xl border border-[var(--card-border)] bg-[var(--card)] shadow-2xl xl:grid-cols-[400px_minmax(0,1fr)] xl:grid-rows-1">
      <form ref={editorRef} tabIndex={-1} onSubmit={createCue} className="min-h-0 xl:overflow-y-auto xl:overscroll-contain border-b border-[var(--card-border)] p-6 xl:max-h-none xl:border-b-0 xl:border-r">
        <div className="flex items-center justify-between"><div><h2 id="cue-manager-title" className="text-xl font-semibold">知识 CUE 管理</h2><p className="mt-1 text-xs text-[var(--muted-foreground)]">单条添加时选择大单元；批量 / AI 导入只需先选择学科，每条 Cue 可使用不同大单元。</p></div><button type="button" onClick={onClose} aria-label="关闭" className="grid h-10 w-10 place-items-center rounded-full hover:bg-black/5"><span aria-hidden="true" className="material-icons-round">close</span></button></div>
        <button type="button" onClick={() => setHistoryOpen(true)} className="mt-4 min-h-11 w-full rounded-xl border border-[var(--card-border)] px-3 text-sm font-semibold">修改 / 导入记录（{changeHistory.length}）</button>
        <button type="button" onClick={() => setMemoryImport(true)} className="mt-4 min-h-11 w-full rounded-xl border border-[var(--card-border)] px-3 text-sm font-semibold">从 DEFINITIONS / 对比记忆导入</button>
        {editingId && <div className="mt-4 rounded-xl border border-[var(--brand)] p-3 text-sm"><strong>编辑现有 Cue</strong><p className="mt-1 text-xs">修改内容与分类，保留原有学习历史、判定和备忘录。</p></div>}
        {editNotice && <p role="status" className="mt-3 text-sm text-[var(--brand)]">{editNotice}</p>}
        {subjectName && <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-3 text-xs leading-5 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"><strong>整批 Cue 更新：</strong>{latestCollectionUpdate ? `上次 ${formatReviewTimestamp(latestCollectionUpdate.updatedAt)} · 新增 ${latestCollectionUpdate.createdCount} · 修改 ${latestCollectionUpdate.modifiedCount} · 下次提醒 ${nextCueCollectionReminderDate(latestCollectionUpdate.updatedAt, reminderDays)}` : '尚未记录。单次新增或实际修改至少 5 条时自动记录，也可在导入时手动标记。'}</div>}
        <div className="mt-5 space-y-3"><label className="block text-sm font-medium">学科<select required value={subjectName} onChange={(event) => { setSubjectName(event.target.value); setUnit(''); }} className="mt-1.5 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5"><option value="">请选择</option>{subjectName && !catalog.some((item) => item.name === subjectName) && <option value={subjectName}>{subjectName}</option>}{catalog.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></label><label className="block text-sm font-medium">大单元<select required value={unit} disabled={!subjectName} onChange={(event) => setUnit(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 disabled:opacity-50"><option value="">请选择</option>{unit && !selectedSubjectConfig?.units.some((item) => item.name === unit) && <option value={unit}>{unit}</option>}{selectedSubjectConfig?.units.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label><label className="block text-sm font-medium">小单元 / 章节（可选）<input value={subsection} onChange={(event) => setSubsection(event.target.value)} maxLength={120} className="mt-1.5 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5" /></label><div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-medium">Cue 类型<select value={type} onChange={(event) => setType(event.target.value as CueType)} className="mt-1.5 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5">{CUE_TYPE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label className="block text-sm font-medium">显示预设<select value={display} onChange={(event) => setDisplay(event.target.value as CueDisplayPreset)} className="mt-1.5 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5">{CUE_DISPLAY_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></div><label className="block text-sm font-medium">题目大标题<input name="cuePrompt" required value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={500} className="mt-1.5 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5" /></label><label className="block text-sm font-medium">题目说明小字（可选）<textarea value={subtitle} onChange={(event) => setSubtitle(event.target.value)} rows={2} placeholder="背景、已知条件或作答限制；不要提前泄露答案" className="mt-1.5 w-full resize-none rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5" /></label><label className="block text-sm font-medium">参考答案（可选）<textarea value={answer} onChange={(event) => setAnswer(event.target.value)} rows={3} className="mt-1.5 w-full resize-none rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5" /></label><label className="block text-sm font-medium">Marking points（每行一个）<textarea value={markingPoints} onChange={(event) => setMarkingPoints(event.target.value)} rows={3} className="mt-1.5 w-full resize-none rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5" /></label><p className="text-xs leading-5 text-[var(--muted-foreground)]">所有文字字段均支持 LaTeX：<code>\(...\)</code> 行内公式，<code>\[...\]</code> 独立公式。</p></div>
        {(type === 'multiple-choice' || display === 'multiple-choice') && <div className="mt-3 rounded-2xl border border-[var(--card-border)] p-3"><label className="block text-sm font-medium">选择题选项（每行一个）<textarea value={choices} onChange={(event) => setChoices(event.target.value)} rows={4} className="mt-1.5 w-full resize-none rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5" /></label><label className="mt-3 block text-sm font-medium">正确选项<select value={correctChoice} onChange={(event) => setCorrectChoice(Number(event.target.value))} className="mt-1.5 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5">{choices.split('\n').map((item) => item.trim()).filter(Boolean).slice(0, 6).map((item, itemIndex) => <option key={`${itemIndex}-${item}`} value={itemIndex}>{itemIndex + 1} · {item}</option>)}</select></label></div>}
        <div className="mt-5 flex flex-wrap gap-2"><button type="submit" disabled={!subjectName || !unit || type === 'multiple-choice' && choices.split('\n').filter((item) => item.trim()).length < 2} className="rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40 dark:text-[#202124]">{editingId ? '保存修改' : '添加 Cue'}</button>{editingId && <button type="button" onClick={() => { resetEditor(); setEditNotice('已取消编辑。'); }} className="min-h-11 rounded-full border border-[var(--card-border)] px-4 py-2 text-sm">取消编辑</button>}<button type="button" disabled={!subjectName} onClick={() => setBulkImport(true)} className="rounded-full border border-violet-300 px-4 py-2.5 text-sm font-semibold text-violet-700 disabled:opacity-40 dark:border-violet-800 dark:text-violet-200"><span aria-hidden="true" className="material-icons-round mr-1 align-middle text-base">playlist_add</span>批量创建 / 修改 Cue · {enrichmentCues.length} 条现有</button><button type="button" disabled={!subjectName || enrichmentCues.length < 2} onClick={() => setSimilarityTool(true)} className="rounded-full border border-cyan-300 px-4 py-2.5 text-sm font-semibold text-cyan-700 disabled:opacity-40 dark:border-cyan-800 dark:text-cyan-200"><span aria-hidden="true" className="material-icons-round mr-1 align-middle text-base">difference</span>相似 CUE 检查</button><button type="button" disabled={!subjectName} onClick={async () => { if (!(await siteConfirm(`确认已经把「${subjectName}」的全部 Cue 与最新笔记完成整批检查，并且本次没有需要导入的修改吗？`))) return; const now = new Date().toISOString(); onChange(cues, catalog, collectionUpdate(now, { subjectName, createdCount: 0, modifiedCount: 0, totalCueCount: enrichmentCues.length }, true)); }} className="rounded-full border border-amber-300 px-4 py-2.5 text-sm font-semibold text-amber-700 disabled:opacity-40 dark:border-amber-800 dark:text-amber-200"><span aria-hidden="true" className="material-icons-round mr-1 align-middle text-base">event_available</span>本次已检查 · 无需导入</button></div>
      </form>
      <section className="min-h-0 overflow-y-auto p-6"><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[['全部', cues.length], ['√', cues.filter((cue) => cue.status === 'stable').length], ['△', cues.filter((cue) => cue.status === 'partial').length], ['○', cues.filter((cue) => cue.status === 'unclear').length]].map(([label, value]) => <div key={label} className="rounded-2xl bg-black/[.035] p-3 text-center dark:bg-white/[.06]"><p className="text-xs text-[var(--muted-foreground)]">{label}</p><strong className="mt-1 block text-xl">{value}</strong></div>)}</div><div className="mt-4 grid gap-2 sm:grid-cols-3"><select value={filterSubject} onChange={(event) => { setFilterSubject(event.target.value); setFilterUnit(''); }} aria-label="按学科筛选" className="rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm"><option value="">全部学科</option>{filterSubjects.map((value) => <option key={value}>{value}</option>)}</select><select value={filterUnit} onChange={(event) => setFilterUnit(event.target.value)} aria-label="按大单元筛选" className="rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm"><option value="">全部大单元</option>{filterUnits.map((value) => <option key={value}>{value}</option>)}</select><select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value as CueStatusFilter)} aria-label="按状态筛选" className="rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm"><option value="all">全部 Cue</option><option value="unreviewed">没有最新标记</option><option value="due">今天到期或未排期</option><option value="weak">△ 黄色＋○ 红色</option><option value="unstable">历史不稳定项</option><option value="repeated-weak">近期反复失误</option><option value="recovering">刚转绿待巩固</option><option value="stable">仅 √ 绿色</option><option value="partial">仅 △ 黄色</option><option value="unclear">仅 ○ 红色</option></select></div>{filterStatus === 'unstable' && <p className="mt-2 text-xs text-[var(--muted-foreground)]">包含当前 △ / ○，以及历史失误风险仍高的 √ Cue。</p>}{filterStatus === 'repeated-weak' && <p className="mt-2 text-xs text-[var(--muted-foreground)]">最近 5 次检索中至少 2 次为 △ / ○。</p>}{filterStatus === 'recovering' && <p className="mt-2 text-xs text-[var(--muted-foreground)]">最新为 √，但历史失误风险仍高，需要继续巩固。</p>}<p className="mt-2 text-xs text-[var(--muted-foreground)]">当前显示 {filtered.length} / {cues.length} 条{!showMastered && filterStatus === 'all' ? ' · 设置中已隐藏绿色 Cue，可选“仅 √ 绿色”查看' : ''}</p><input value={query} onChange={(event) => setQuery(event.target.value)} type="search" aria-label="搜索 Cue 管理" placeholder="搜索大标题、小标题、答案或 MS…" className="mt-2 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm" />{query.trim() && <p role="status" className="mt-2 text-xs text-[var(--muted-foreground)]">{search.expanded ? '没有直接匹配，已扩大到单元、组合关键词及相近拼写。' : '按大标题、小标题、答案、MS 的命中优先级排序。'}</p>}<CueHierarchy searchHits={query.trim() ? search.hits : undefined} cues={filtered} reviews={reviews} onDifficulty={(id, userDifficulty) => onChange(cues.map((cue) => cue.id === id ? { ...cue, userDifficulty } : cue))} onEdit={editCue} onDelete={async (cue) => { (await deleteCue(cue.id)); }} /></section>
    </div>
    {historyOpen && <CueChangeHistory records={changeHistory} legacyUpdates={collectionUpdates} onClose={() => setHistoryOpen(false)} />}
    {memoryImport && <MemoryCueImportDialog catalog={catalog} cues={cues} onApply={(operations) => applyBulkOperations(operations, operations[0]?.subjectName ?? subjectName, false, 'memory')} onClose={() => setMemoryImport(false)} />}
    {bulkImport && <CueBulkImportDialog subjectName={subjectName} knownUnits={selectedSubjectConfig?.units.map((item) => item.name) ?? []} cues={enrichmentCues} onClose={() => setBulkImport(false)} onApply={(operations, markAsBatch) => applyBulkOperations(operations, subjectName, markAsBatch)} saveOnRead />}
    {similarityTool && <SimilarCueToolDialog subjectName={subjectName} cues={enrichmentCues} decisions={similarityDecisions} onDecisionsChange={onSimilarityDecisionsChange} onDelete={deleteCue} onClose={() => setSimilarityTool(false)} />}
  </div>;
}

function ManualCatalogDetailEditor({ subjects, onChange }: { subjects: LearningCatalogSubject[]; onChange: (subjects: LearningCatalogSubject[]) => void }) {
  const [selectedId, setSelectedId] = useState(subjects[0]?.id ?? '');
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newUnitName, setNewUnitName] = useState('');
  const [mergeSourceIndex, setMergeSourceIndex] = useState('');
  const [mergeTargetIndex, setMergeTargetIndex] = useState('');
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
  const removeSubject = async () => {
    if (!selected || !(await siteConfirm(`删除学科「${selected.name}」及其单元配置吗？学习记录和 Cue 不会被删除。`))) return;
    const next = subjects.filter((subject) => subject.id !== selected.id);
    onChange(next); setSelectedId(next[0]?.id ?? ''); setMergeSourceIndex(''); setMergeTargetIndex('');
  };
  const addUnit = () => {
    const name = newUnitName.trim();
    if (!selected || !name) return;
    updateSelected((subject) => ({ ...subject, units: [...subject.units, { name: name.slice(0, 120), subsections: [] }] }));
    setNewUnitName('');
  };
  const mergeUnits = async () => {
    if (!selected || mergeSourceIndex === '' || mergeTargetIndex === '') return;
    const sourceIndex = Number(mergeSourceIndex);
    const targetIndex = Number(mergeTargetIndex);
    const source = selected.units[sourceIndex];
    const target = selected.units[targetIndex];
    if (!source || !target || sourceIndex === targetIndex) return;
    if (!(await siteConfirm(`把「${source.name}」合并到「${target.name}」吗？\n\n将保留「${target.name}」，删除「${source.name}」；保存全部修改后，原单元的 Cue 会自动迁移。`))) return;
    onChange(mergeLearningCatalogUnits(subjects, selected.id, sourceIndex, targetIndex));
    setMergeSourceIndex(''); setMergeTargetIndex('');
  };
  const updateUnit = (index: number, updater: (unit: LearningCatalogSubject['units'][number]) => LearningCatalogSubject['units'][number]) => updateSelected((subject) => ({ ...subject, units: subject.units.map((unit, unitIndex) => unitIndex === index ? updater(unit) : unit) }));
  return <div className="mt-5 grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
    <aside className="self-start rounded-2xl border border-[var(--card-border)] p-3"><p className="px-2 text-xs font-semibold text-[var(--muted-foreground)]">学科</p><div className="mt-2 max-h-72 space-y-1 overflow-y-auto">{subjects.map((subject) => <button key={subject.id} type="button" onClick={() => { setSelectedId(subject.id); setMergeSourceIndex(''); setMergeTargetIndex(''); }} className={`w-full rounded-xl px-3 py-2 text-left text-sm ${selected?.id === subject.id ? 'bg-blue-50 font-semibold text-[var(--brand)] dark:bg-blue-950/30' : 'hover:bg-black/5'}`}>{subject.name}</button>)}{!subjects.length && <p className="px-2 py-5 text-center text-xs text-[var(--muted-foreground)]">还没有学科</p>}</div><div className="mt-3 flex gap-2"><input value={newSubjectName} onChange={(event) => setNewSubjectName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addSubject(); } }} placeholder="新增学科；多个用逗号" maxLength={500} className="min-w-0 flex-1 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-2.5 py-2 text-xs" /><button type="button" onClick={addSubject} aria-label="添加学科" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--brand)] text-white dark:text-[#202124]"><span aria-hidden="true" className="material-icons-round text-lg">add</span></button></div></aside>
    {selected ? <section className="space-y-4">
      <div className="rounded-2xl border border-[var(--card-border)] p-4">
        <div className="flex items-end gap-3"><label className="min-w-0 flex-1 text-xs font-medium">学科名称<input value={selected.name} onChange={(event) => updateSelected((subject) => ({ ...subject, name: event.target.value.slice(0, 80) }))} className="mt-1.5 w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm" /></label><button type="button" onClick={removeSubject} className="rounded-full px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30">删除学科</button></div>
        <h3 className="mt-5 text-sm font-semibold">资料最新位置</h3><p className="mt-1 text-xs text-[var(--muted-foreground)]">自由填写当前位置，例如 1.2、P18、Q1–8；清空输入框即可移除。</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">{LEARNING_MATERIALS.map((material) => <label key={material.code} className="text-xs font-medium"><span className="font-mono">{material.code}</span> · {material.label}<input value={selected.materialProgress[material.code] ?? ''} onChange={(event) => updateSelected((subject) => { const materialProgress = { ...subject.materialProgress }; const value = event.target.value.slice(0, 200); if (value) materialProgress[material.code] = value; else delete materialProgress[material.code]; return { ...subject, materialProgress }; })} placeholder="尚未记录" className="mt-1.5 w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm" /></label>)}</div>
      </div>
      <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900 dark:bg-amber-950/20"><div className="flex items-start gap-3"><span aria-hidden="true" className="material-icons-round text-amber-600">merge</span><div><h3 className="text-sm font-semibold">合并重复单元</h3><p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">明确选择删除哪个、保留哪个。两个单元的小章节会合并，原单元关联的 CUE 会在保存时迁移到保留单元。</p></div></div><div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto]"><label className="text-xs font-medium">被合并（删除）<select value={mergeSourceIndex} onChange={(event) => { setMergeSourceIndex(event.target.value); if (event.target.value === mergeTargetIndex) setMergeTargetIndex(''); }} className="mt-1.5 w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm"><option value="">请选择</option>{selected.units.map((unit, index) => <option key={`source-${index}`} value={index}>{index + 1}. {unit.name}</option>)}</select></label><span className="hidden self-end pb-2 text-[var(--muted-foreground)] sm:block">→</span><label className="text-xs font-medium">保留<select value={mergeTargetIndex} onChange={(event) => setMergeTargetIndex(event.target.value)} className="mt-1.5 w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm"><option value="">请选择</option>{selected.units.map((unit, index) => <option key={`target-${index}`} value={index} disabled={String(index) === mergeSourceIndex}>{index + 1}. {unit.name}</option>)}</select></label><button type="button" disabled={mergeSourceIndex === '' || mergeTargetIndex === '' || mergeSourceIndex === mergeTargetIndex} onClick={mergeUnits} className="self-end rounded-full bg-amber-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">确认合并</button></div></div>
      <div className="space-y-3">{selected.units.map((unit, unitIndex) => <article key={`${selected.id}-${unitIndex}`} className="rounded-2xl border border-[var(--card-border)] p-4"><div className="flex items-center gap-2"><input value={unit.name} onChange={(event) => updateUnit(unitIndex, (current) => ({ ...current, renameFrom: current.renameFrom ?? current.name, name: event.target.value.slice(0, 120) }))} aria-label={`第 ${unitIndex + 1} 个大单元名称`} className="min-w-0 flex-1 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm font-semibold" /><button type="button" onClick={async () => { if ((await siteConfirm(`删除大单元「${unit.name}」吗？`))) updateSelected((subject) => ({ ...subject, units: subject.units.filter((_, index) => index !== unitIndex) })); }} aria-label={`删除大单元 ${unit.name}`} className="grid h-9 w-9 place-items-center rounded-lg text-rose-600 hover:bg-rose-50"><span aria-hidden="true" className="material-icons-round text-lg">delete</span></button></div>{unit.renameFrom && unit.renameFrom !== unit.name && <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-200">保存时会把现有 Cue 的单元“{unit.renameFrom}”同步改为“{unit.name}”。</p>}{unit.mergeFrom?.length ? <p className="mt-2 text-xs text-amber-700 dark:text-amber-200">等待保存：将 {unit.mergeFrom.map((name) => `“${name}”`).join('、')} 的 CUE 合并到“{unit.name}”。</p> : null}{unit.subsections.length > 0 && <p className="mt-2 text-xs text-[var(--muted-foreground)]">已保留 {unit.subsections.length} 个旧小章节数据，无需继续维护。</p>}</article>)}<div className="flex gap-2 rounded-2xl border border-dashed border-[var(--card-border)] p-3"><input value={newUnitName} onChange={(event) => setNewUnitName(event.target.value)} placeholder="新增大单元" maxLength={120} className="min-w-0 flex-1 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm" /><button type="button" onClick={addUnit} className="rounded-full bg-[var(--brand)] px-4 py-2 text-xs font-semibold text-white dark:text-[#202124]">添加大单元</button></div></div>
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
  return <section className="mt-4 rounded-2xl border border-dashed border-[var(--card-border)] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-semibold">快速增加或重命名大单元</h3><p className="mt-1 text-xs text-[var(--muted-foreground)]">新增时每行写一个名称；修正错名时写“旧名称 -&gt; 新名称”。未写到的单元都会保留。</p></div><select value={subjectId} onChange={(event) => setSubjectId(event.target.value)} aria-label="批量添加目标学科" className="rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm"><option value="">选择学科</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></div><textarea value={outline} onChange={(event) => setOutline(event.target.value)} rows={4} placeholder={'Mechanics\nWave Moton -> Wave Motion\nElectricity'} className="mt-3 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 font-mono text-xs leading-5" /><div className="mt-3 flex flex-wrap items-center justify-between gap-3">{message ? <p role="status" className="text-xs text-[var(--muted-foreground)]">{message}</p> : <span />}<button type="button" disabled={!subjectId || !outline.trim()} onClick={apply} className="rounded-full bg-[var(--brand)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-40 dark:text-[#202124]">增量应用</button></div></section>;
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
  const parseSource = (value: string) => { try { const parsed = parseLearningCatalogImport(parseAiJson(value)); setPreview(parsed.subjects); setMessage(`识别到 ${parsed.subjects.length} 个科目。加载后仍可手动修改。`); } catch (error) { setPreview(null); setMessage(error instanceof Error ? error.message : '分类配置无法读取。'); } };
  const copyFormat = async () => {
    const instructions = [
      '根据用户要求修改 JackYun 学科配置，仅输出严格 JSON；保留真实 ID 和未要求修改的数据，不猜测分类。',
      '1. version 固定为 1；subjects 是学科数组。',
      '2. 每个学科只需填写 name；id 可保留原值，新增学科也可省略。',
      '3. units 是大单元数组，每项只需填写 name；不再需要填写小章节。',
      '4. 修正大单元名称时，在单元对象中同时填写 renameFrom（旧名称）和 name（新名称）。',
      '5. materialProgress 记录资料当前位置，例如 B: "1.2"、N: "P18"；不需要更新的字段可省略。',
      '6. 可以只保留本次需要新增或修改的部分，导入时选择“合并”不会删除其他数据。',
      '7. 只有批量删除或整体调整时，才复制当前完整 JSON、修改后选择“替换全部”。',
      '',
      'JSON 示例：',
      JSON.stringify(learningCatalogImportTemplate(), null, 2),
      '当前数据：',
      JSON.stringify({ version: 1, subjects: draft }, null, 2),
    ].join('\n');
    await navigator.clipboard.writeText(instructions);
    setMessage('提示词、格式及当前数据已复制。');
  };
  const runAi = async () => {
    if (!source.trim()) return;
    setBusy(true); setMessage('AI 正在整理学科层级…');
    try {
      const currentJson = JSON.stringify({ version: 1, subjects: draft }, null, 2);
      const userContent = aiUseCurrent
        ? `下面是当前完整数据，请按照修改要求返回修改后的完整 JSON。不要遗漏未要求修改的数据。\n\n当前数据：\n${currentJson.slice(0, 30_000)}\n\n修改要求：\n${source.slice(0, 9_000)}`
        : source.slice(0, 40_000);
      const response = await fetch('/api/llm-proxy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feature: 'chat', stream: false, temperature: 0.1, _no_thinking: true, messages: [{ role: 'system', content: `把用户要求转换成严格 JSON，不要解释或补充不存在的知识。格式：${JSON.stringify(learningCatalogImportTemplate())}。subjects 是学科；units 是大单元；每个大单元需要 name，subsections 一律输出空数组。局部重命名单元时必须同时返回 renameFrom（旧名称）和 name（新名称），这样合并模式只改名而不会新增重复单元。materialProgress 只记录明确的资料位置，例如 B:"1.2"。${aiUseCurrent ? '用户会提供当前完整数据和修改要求；必须返回修改后的完整数据，并保留所有未要求改变的字段、学科和单元。' : '允许只返回用户提供的局部学科、单元或资料位置。'}` }, { role: 'user', content: userContent }] }) });
      const parsed = parseLearningCatalogImport(parseAiJson(await readAiResponseContent(response)));
      setPreview(parsed.subjects); setMessage(`AI 整理出 ${parsed.subjects.length} 个科目。${aiUseCurrent ? '这是完整修改结果，建议核对后选择“替换全部”。' : '可选择增量合并。'}`);
    } catch (error) { setPreview(null); setMessage(error instanceof Error ? error.message : 'AI 导入失败。'); }
    finally { setBusy(false); }
  };
  const loadPreview = async (strategy: 'merge' | 'replace') => {
    if (!preview) return;
    if (strategy === 'replace' && !(await siteConfirm('替换会移除当前编辑器中未包含在导入结果里的学科和单元，确定继续吗？'))) return;
    setDraft(strategy === 'merge' ? mergeLearningCatalog(draft, preview) : preview);
    setMode('manual');
    setMessage(strategy === 'merge' ? '已增量合并到现有配置；未导入的内容均已保留。' : '已用导入结果替换编辑器内容，确认无误后再保存。');
  };
  const save = () => { try { onApply(parseLearningCatalogImport({ version: 1, subjects: draft }).subjects); } catch (error) { setMessage(error instanceof Error ? error.message : '请检查分类配置。'); } };
  if (mode !== 'manual') return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="catalog-dialog-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="max-h-[94dvh] w-full max-w-6xl overflow-y-auto rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3"><div><h2 id="catalog-dialog-title" className="text-xl font-semibold">学科、大单元与资料位置</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">小章节已取消；旧数据仍兼容，但新建和导入只需维护学科与大单元。</p></div><button type="button" onClick={onClose} aria-label="关闭" className="grid h-10 w-10 place-items-center rounded-full hover:bg-black/5"><span aria-hidden="true" className="material-icons-round">close</span></button></div>
        <div className="mt-5 inline-flex flex-wrap rounded-full bg-black/5 p-1 dark:bg-white/10">{([['manual', '手动编辑'], ['json', 'JSON 导入'], ['ai', 'AI 批量修改']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => { setMode(value); setMessage(''); setPreview(null); }} className={`rounded-full px-4 py-2 text-sm ${mode === value ? 'bg-[var(--card)] font-semibold shadow-sm' : ''}`}>{label}</button>)}</div>
        <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50/70 p-4 text-sm leading-6 text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
          {mode === 'json' ? '先复制填写说明或当前全部数据，在任意文本编辑器中批量修改后粘贴回来。局部 JSON 选择“合并”；完整修改后的 JSON 选择“替换全部”。' : '写出想增加、重命名、删除或修改的内容。开启读取当前数据后，AI 会在现有完整配置上修改，并生成可核对的预览。'}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={copyFormat} className="rounded-full border border-[var(--card-border)] px-4 py-2 text-sm font-medium"><span aria-hidden="true" className="material-icons-round mr-1 align-middle text-base">content_copy</span>复制提示词及数据</button>
          <button type="button" onClick={() => downloadStudyJson({ version: 1, subjects: draft }, 'learning-catalog.json')} className="rounded-full border border-[var(--card-border)] px-4 py-2 text-sm font-medium"><span aria-hidden="true" className="material-icons-round mr-1 align-middle text-base">data_object</span>导出当前数据</button>
          {mode === 'json' && <label className="cursor-pointer rounded-full border border-[var(--card-border)] px-4 py-2 text-sm font-medium">选择 JSON 文件<input type="file" accept="application/json,.json" className="hidden" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; const text = await file.text(); setSource(text); parseSource(text); }} /></label>}
        </div>
        {mode === 'ai' && <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-[var(--card-border)] p-4"><input type="checkbox" checked={aiUseCurrent} onChange={(event) => setAiUseCurrent(event.target.checked)} className="mt-1 h-4 w-4 accent-[var(--brand)]" /><span><strong className="block text-sm">让 AI 读取当前配置并批量修改</strong><span className="mt-1 block text-xs leading-5 text-[var(--muted-foreground)]">默认开启。适合批量重命名、删除、合并学科或更新多个资料位置；AI 会返回完整数据供你预览。</span></span></label>}
        <textarea value={source} onChange={(event) => setSource(event.target.value)} rows={14} placeholder={mode === 'ai' ? (aiUseCurrent ? '例如：把 Pure Math 改名为 Mathematics；删除旧单元；Physics 的 B 改到 2.3；其余数据保持不变。' : '输入要新增或更新的局部内容…') : '粘贴修改后的 JSON，或只粘贴需要增量导入的部分 JSON…'} className="mt-4 w-full rounded-2xl border border-[var(--card-border)] bg-[var(--background)] p-4 font-mono text-xs leading-5" />
        <button type="button" disabled={busy || !source.trim()} onClick={() => mode === 'json' ? parseSource(source) : runAi()} className="mt-3 rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:text-[#202124]">{busy ? '处理中…' : mode === 'json' ? '检查 JSON 并预览' : aiUseCurrent ? 'AI 修改当前数据并预览' : 'AI 整理局部数据并预览'}</button>
        {preview && <div className="mt-4 rounded-2xl border border-[var(--card-border)] p-4"><p className="text-sm font-semibold">导入预览：{preview.length} 个学科、{preview.reduce((total, subject) => total + subject.units.length, 0)} 个大单元</p><p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">{mode === 'ai' && aiUseCurrent ? 'AI 返回的是完整修改结果；核对无误后选择“替换全部”。' : '局部数据建议增量合并；只有输入确实包含完整数据时才替换全部。'}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={async () => (await loadPreview('merge'))} className="rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white dark:text-[#202124]">合并到现有配置</button><button type="button" onClick={async () => (await loadPreview('replace'))} className="rounded-full border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-600">替换全部</button></div></div>}
        {message && <p role="status" className="mt-4 rounded-xl bg-black/5 px-3 py-2 text-sm dark:bg-white/10">{message}</p>}
        <div className="mt-6 flex justify-end gap-3 border-t border-[var(--card-border)] pt-5"><button type="button" onClick={onClose} className="rounded-full border border-[var(--card-border)] px-5 py-2.5 text-sm">取消</button><button type="button" onClick={save} className="rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white dark:text-[#202124]">保存全部修改</button></div>
      </div>
    </div>
  );
  return <div className="fixed inset-0 z-[70] grid place-items-center bg-black/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="catalog-dialog-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="max-h-[94dvh] w-full max-w-6xl overflow-y-auto rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><h2 id="catalog-dialog-title" className="text-xl font-semibold">学科、单元与资料位置</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">可以完整手动维护；JSON 和 AI 默认增量合并，也支持明确替换。</p></div><button type="button" onClick={onClose} aria-label="关闭" className="grid h-10 w-10 place-items-center rounded-full hover:bg-black/5"><span aria-hidden="true" className="material-icons-round">close</span></button></div><div className="mt-5 inline-flex flex-wrap rounded-full bg-black/5 p-1 dark:bg-white/10">{([['manual', '手动编辑'], ['json', 'JSON 导入'], ['ai', 'AI 导入']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => { setMode(value); setMessage(''); }} className={`rounded-full px-4 py-2 text-sm ${mode === value ? 'bg-[var(--card)] font-semibold shadow-sm' : ''}`}>{label}</button>)}</div>{mode === 'manual' ? <ManualCatalogEditor subjects={draft} onChange={setDraft} /> : <div className="mt-5"><div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-3 text-xs leading-5 text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">支持只导入一个学科、一个单元、小单元列表或几项资料位置。默认合并，不会删除没有出现在本次导入中的已有内容。</div><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={copyFormat} className="rounded-full border border-[var(--card-border)] px-4 py-2 text-sm font-medium"><span aria-hidden="true" className="material-icons-round mr-1 align-middle text-base">content_copy</span>复制格式</button>{mode === 'json' && <label className="cursor-pointer rounded-full border border-[var(--card-border)] px-4 py-2 text-sm font-medium">选择 JSON<input type="file" accept="application/json,.json" className="hidden" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; const text = await file.text(); setSource(text); parseSource(text); }} /></label>}</div><textarea value={source} onChange={(event) => setSource(event.target.value)} rows={12} placeholder={mode === 'ai' ? '可只粘贴需要新增或更新的局部内容…' : '可只粘贴部分学科或单元的 JSON…'} className="mt-4 w-full rounded-2xl border border-[var(--card-border)] bg-[var(--background)] p-4 font-mono text-xs leading-5" /><button type="button" disabled={busy || !source.trim()} onClick={() => mode === 'json' ? parseSource(source) : runAi()} className="mt-3 rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:text-[#202124]">{busy ? '处理中…' : mode === 'json' ? '检查并预览' : 'AI 整理并预览'}</button>{preview && <div className="mt-4 rounded-2xl border border-[var(--card-border)] p-4"><p className="text-sm font-semibold">导入预览：{preview.length} 个学科、{preview.reduce((total, subject) => total + subject.units.length, 0)} 个大单元</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">建议使用增量合并；只有确实想清空未导入内容时才使用替换。</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={async () => (await loadPreview('merge'))} className="rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white dark:text-[#202124]">合并到现有配置</button><button type="button" onClick={async () => (await loadPreview('replace'))} className="rounded-full border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-600">替换全部</button></div></div>}</div>}{message && <p role="status" className="mt-4 rounded-xl bg-black/5 px-3 py-2 text-sm dark:bg-white/10">{message}</p>}<div className="mt-6 flex justify-end gap-3 border-t border-[var(--card-border)] pt-5"><button type="button" onClick={onClose} className="rounded-full border border-[var(--card-border)] px-5 py-2.5 text-sm">取消</button><button type="button" onClick={save} className="rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white dark:text-[#202124]">保存全部修改</button></div></div></div>;
}

function ImportDialog({ currentTimetable, onClose, onApply }: { currentTimetable: TimetableImport | null; onClose: () => void; onApply: (timetable: TimetableImport) => void }) {
  const [mode, setMode] = useState<'json' | 'ai'>('json');
  const [source, setSource] = useState('');
  const [preview, setPreview] = useState<TimetableImport | null>(null);
  const [previewInput, setPreviewInput] = useState<unknown>(null);
  const [temporaryDate, setTemporaryDate] = useState('');
  const [previewRole, setPreviewRole] = useState<'primary' | 'temporary'>('primary');
  const [reviewCourseIds, setReviewCourseIds] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const showPreview = (parsed: TimetableImport, prefix: string, input: unknown, role: 'primary' | 'temporary') => {
    const selected = preservedReviewCourseIds(parsed, currentTimetable);
    setPreview(parsed);
    setPreviewInput(input);
    setPreviewRole(role);
    setReviewCourseIds(selected);
    setMessage(`${prefix}${role === 'temporary' ? '临时换课：只更新指定日期，不会覆盖主课表。' : '主课表：可更新或整体替换常规课程。'} ${parsed.courses.length} 门课程、${parsed.courses.reduce((total, course) => total + course.sessions.length, 0)} 个常规时段、${parsed.dateOverrides?.length ?? 0} 个调课日期。`);
  };
  const parseJson = (text: string) => {
    try {
      const input = JSON.parse(text) as Record<string, unknown>;
      const role = input.scheduleRole === 'temporary' ? 'temporary' : 'primary';
      const parsed = role === 'temporary' ? applyTemporaryTimetableUpdate(input, currentTimetable) : applyTimetableUpdate(input, currentTimetable);
      showPreview(parsed, '识别到 ', input, role);
    } catch (error) { setPreview(null); setPreviewInput(null); setReviewCourseIds([]); setMessage(error instanceof Error ? error.message : 'JSON 无法读取。'); }
  };
  const runAiImport = async () => {
    if (!source.trim()) return;
    setBusy(true); setMessage('AI 正在整理课表，只会生成导入预览…'); setPreview(null); setReviewCourseIds([]);
    try {
      const response = await fetch('/api/llm-proxy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feature: 'chat', stream: false, temperature: 0.1, _no_thinking: true, messages: [{ role: 'system', content: `把用户提供的课表文本转换成严格 JSON，不要解释，不要添加原文没有的课程。先判断 scheduleRole：常规学期/每周课表填写 "primary"；明确写着临时换课、调课、补课、某一天改课或只影响一个日期时填写 "temporary"。primary 可使用 mode:"replace" 整体替换主课表，或只返回增量课程字段。temporary 必须填写 temporaryDate（若只有一天）或 dateOverrides，且只能用 dateOverrides 表示指定日期的课程，不得覆盖 courses 的常规安排。首次导入格式：${JSON.stringify(timetableImportTemplate())}。已有课程必须沿用以下 id 与名称：${JSON.stringify(currentTimetable?.courses.map((course) => ({ id: course.id, name: course.name, shortName: course.shortName })) ?? [])}。指定日期调课用 dateOverrides，格式为 [{date:"YYYY-MM-DD",sessions:[{courseId,start:"HH:mm",end:"HH:mm"}]}]；空 sessions 表示当天停课。day 使用 1=周一 到 7=周日；时间使用 HH:mm；无法确认的地点或教师省略；不要设置 review，沿用用户既有选择。weeks 仅在原文明确给出时填写。` }, { role: 'user', content: source.slice(0, 40_000) }] }) });
      const content = await readAiResponseContent(response);
      const input = parseAiJson(content) as Record<string, unknown>;
      const role = input.scheduleRole === 'temporary' ? 'temporary' : 'primary';
      const parsed = role === 'temporary' ? applyTemporaryTimetableUpdate(input, currentTimetable) : applyTimetableUpdate(input, currentTimetable);
      showPreview(parsed, 'AI 识别到 ', input, role);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'AI 导入失败。'); }
    finally { setBusy(false); }
  };
  const copyRules = async () => {
    const roleRules = '根据用户要求处理课表，仅输出严格 JSON；未知日期、时间或课程先询问，不猜测。scheduleRole 规则：常规学期/每周主课表填写 "primary"；临时换课、调课、补课或只影响某天填写 "temporary"，并提供 temporaryDate 或 dateOverrides。temporary 只更新指定日期，不覆盖主课表。\\n';
    const rules = `JackYun 课表 JSON 更新规则\n- 只填写要改的字段；未填写的课程、复习选择、颜色、学期日期和其他学习设置均保留。\n- 用现有课程 id 修改课程名称、时间、地点、教师或周次；sessions 为该课程的完整新时段。\n- 新课程须填写 name 和 sessions；deleteCourseIds 可删除课程。\n- dateOverrides 按 YYYY-MM-DD 替换当天全部课程；sessions: [] 表示当天停课。调休周末在这里写当天课程和 courseId。deleteOverrideDates 删除一次调课。\n- day 为 1=周一至 7=周日；时间为 HH:mm；weeks 仅在指定学期周次时使用。\n- mode: \"replace\" 可整体替换课程列表；常规更新不要填写。\n\n增量更新示例：\n${JSON.stringify({ version: 1, courses: [{ id: currentTimetable?.courses[0]?.id ?? 'existing-course-id', sessions: [{ day: 2, start: '08:00', end: '08:45' }] }], dateOverrides: [{ date: '2026-09-26', sessions: [{ courseId: currentTimetable?.courses[0]?.id ?? 'existing-course-id', start: '08:00', end: '08:45' }] }] }, null, 2)}\n\n首次导入完整格式：\n${JSON.stringify(timetableImportTemplate(), null, 2)}${currentTimetable ? `\n\n当前课表（保留课程 id 用于精准更新）：\n${JSON.stringify(currentTimetable, null, 2)}` : ''}`;
    await navigator.clipboard.writeText(roleRules + rules); setMessage('提示词、格式及当前课表数据已复制。');
  };
  const toggleReviewCourse = (courseId: string) => setReviewCourseIds((current) => current.includes(courseId) ? current.filter((id) => id !== courseId) : [...current, courseId]);
  const applyPreview = () => {
    if (!preview || !previewInput) return;
    if (previewRole === 'temporary') {
      onApply(applyTemporaryTimetableUpdate(previewInput, currentTimetable));
      return;
    }
    onApply(withReviewCourseSelection({ ...preview, scheduleRole: 'primary' }, reviewCourseIds));
  };
  const changePreviewRole = (role: 'primary' | 'temporary') => {
    if (!previewInput) return;
    try {
      const input = changeTimetableImportRole(previewInput, role, temporaryDate || undefined);
      const parsed = role === 'temporary' ? applyTemporaryTimetableUpdate(input, currentTimetable) : applyTimetableUpdate(input, currentTimetable);
      showPreview(parsed, '已切换：', input, role);
    } catch (error) { setMessage(error instanceof Error ? error.message : '无法切换导入用途。'); }
  };
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="import-dialog-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-[2rem] border border-[var(--card-border)] bg-[var(--card)] shadow-2xl">
        <div className="relative overflow-hidden border-b border-[var(--card-border)] p-6"><div className="pointer-events-none absolute -right-8 -top-16 h-40 w-40 rounded-full bg-blue-500/15 blur-3xl" /><div className="relative flex items-start gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-50 text-[var(--brand)] dark:bg-blue-950/50"><span aria-hidden="true" className="material-icons-round">calendar_month</span></div><div className="min-w-0 flex-1"><h2 id="import-dialog-title" className="text-xl font-semibold">导入课表</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">JSON 可增量更新课程与指定日期的调课；已有复习学科与学习设置会保留。</p></div><button type="button" onClick={onClose} aria-label="关闭" className="grid h-10 w-10 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"><span aria-hidden="true" className="material-icons-round">close</span></button></div></div>
        <div className="overflow-y-auto p-6">
          <div className="inline-flex rounded-full bg-black/5 p-1 dark:bg-white/10"><button type="button" onClick={() => { setMode('json'); setPreview(null); setReviewCourseIds([]); setMessage(''); }} className={`rounded-full px-4 py-2 text-sm font-medium ${mode === 'json' ? 'bg-[var(--card)] shadow-sm' : 'text-[var(--muted-foreground)]'}`}>JSON 导入</button><button type="button" onClick={() => { setMode('ai'); setPreview(null); setReviewCourseIds([]); setMessage(''); }} className={`rounded-full px-4 py-2 text-sm font-medium ${mode === 'ai' ? 'bg-[var(--card)] shadow-sm' : 'text-[var(--muted-foreground)]'}`}>AI 文本识别</button></div>
          {mode === 'json' ? <div className="mt-5"><div className="flex flex-wrap gap-3"><label className="cursor-pointer rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white dark:text-[#202124]">选择 JSON<input type="file" accept="application/json,.json" className="hidden" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; const text = await file.text(); setSource(text); parseJson(text); }} /></label><button type="button" onClick={copyRules} className="rounded-full border border-[var(--card-border)] px-4 py-2 text-sm font-medium"><span aria-hidden="true" className="material-icons-round mr-1 align-middle text-base">content_copy</span>复制提示词及数据</button><button type="button" disabled={!currentTimetable} onClick={() => downloadStudyJson({ ...currentTimetable, scheduleRole: 'primary', mode: 'replace' }, 'timetable.json')} className="rounded-full border border-[var(--card-border)] px-4 py-2 text-sm font-medium">导出当前数据</button></div><textarea value={source} onChange={(event) => { setSource(event.target.value); setPreview(null); setPreviewInput(null); }} rows={10} spellCheck={false} placeholder="也可以在这里粘贴 JSON…" className="mt-4 w-full resize-y rounded-2xl border border-[var(--card-border)] bg-[var(--background)] p-4 font-mono text-xs leading-5 outline-none focus:border-[var(--brand)]" /><button type="button" onClick={() => parseJson(source)} className="mt-3 rounded-full border border-[var(--card-border)] px-4 py-2 text-sm font-medium">检查并预览</button></div> : <div className="mt-5"><div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"><strong>隐私提醒：</strong>只有点击“AI 识别”后，下面的文本和现有课程名称及编号才会发送到你在 JackYun 中配置的 AI 服务。若不希望发送，请使用 JSON 导入。</div><textarea value={source} onChange={(event) => { setSource(event.target.value); setPreview(null); setPreviewInput(null); }} rows={10} maxLength={40_000} placeholder="粘贴课表文本、OCR 结果或从表格复制的内容…" className="mt-4 w-full resize-y rounded-2xl border border-[var(--card-border)] bg-[var(--background)] p-4 text-sm leading-6 outline-none focus:border-[var(--brand)]" /><button type="button" disabled={busy || !source.trim()} onClick={runAiImport} className="mt-3 rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:text-[#202124]"><span aria-hidden="true" className="material-icons-round mr-1 align-middle text-base">auto_awesome</span>{busy ? '识别中…' : 'AI 识别并预览'}</button></div>}
          {currentTimetable && <button type="button" onClick={() => { const text = JSON.stringify({ ...currentTimetable, scheduleRole: 'primary', mode: 'replace' }, null, 2); setMode('json'); setSource(text); parseJson(text); }} className="mt-4 rounded-full border border-[var(--card-border)] px-4 py-2 text-sm font-medium">编辑当前课表（含调休安排）</button>}
          {preview && <div className="mt-4 space-y-3 rounded-2xl border border-[var(--card-border)] p-4"><label className="flex items-center gap-3 text-sm">调休日期<input type="date" value={temporaryDate} onChange={(event) => setTemporaryDate(event.target.value)} className="rounded-lg border border-[var(--card-border)] bg-[var(--background)] p-2" /></label><p className="text-xs text-[var(--muted-foreground)]">将每周课表改为临时换课时，只使用所选日期对应星期的课程；其他安排请编辑 dateOverrides。</p>{previewRole === 'primary' && <button type="button" onClick={() => { try { const input = { ...(previewInput as Record<string, unknown>), mode: 'replace', scheduleRole: 'primary' }; showPreview(applyTimetableUpdate(input, currentTimetable), '替换预览：', input, 'primary'); } catch (error) { setMessage(error instanceof Error ? error.message : '无法替换。'); } }} className="rounded-full border border-rose-300 px-4 py-2 text-sm text-rose-600">改为整体替换主课表</button>}<p className="text-xs text-[var(--muted-foreground)]">整体替换会移除本次未包含的课程和调休日期；核对预览后点击保存生效。</p></div>}
          {message && <p role="status" className="mt-4 rounded-xl bg-black/5 px-4 py-3 text-sm dark:bg-white/10">{message}</p>}
          {preview && <div className="mt-4 overflow-hidden rounded-3xl border border-[var(--card-border)]"><div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 dark:from-blue-950/40 dark:to-indigo-950/30"><div><p className="font-semibold">{preview.name}</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">{previewRole === 'temporary' ? '临时换课 · 主课表不会被覆盖' : `${preview.courses.length} 门课程 · 已选择 ${reviewCourseIds.length} 门复习`}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => changePreviewRole('primary')} aria-pressed={previewRole === 'primary'} className={`rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm ${previewRole === 'primary' ? 'bg-[var(--brand)] text-white dark:text-[#202124]' : 'bg-[var(--card)]'}`}>主课表</button><button type="button" onClick={() => changePreviewRole('temporary')} aria-pressed={previewRole === 'temporary'} className={`rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm ${previewRole === 'temporary' ? 'bg-amber-500 text-white' : 'bg-[var(--card)]'}`}>临时换课</button>{previewRole === 'primary' && <><button type="button" onClick={() => setReviewCourseIds(preview.courses.map((course) => course.id))} className="rounded-full bg-[var(--card)] px-3 py-1.5 text-xs font-semibold shadow-sm">全选</button><button type="button" onClick={() => setReviewCourseIds([])} className="rounded-full bg-[var(--card)] px-3 py-1.5 text-xs font-semibold shadow-sm">清空</button></>}</div></div>{previewRole === 'temporary' ? <p className="p-4 text-sm leading-6 text-amber-800 dark:text-amber-200">确认保存后只写入指定日期的调课记录；你误把换课文件当主课表导入时，可在这里切回“临时换课”。</p> : <div className="grid max-h-72 gap-2 overflow-y-auto p-3 sm:grid-cols-2">{preview.courses.map((course) => { const checked = reviewCourseIds.includes(course.id); return <label key={course.id} className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-3 transition ${checked ? 'border-[var(--brand)] bg-blue-50/80 shadow-sm dark:bg-blue-950/30' : 'border-[var(--card-border)] hover:bg-black/[.025] dark:hover:bg-white/[.04]'}`}><span className="h-9 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: course.color }} /><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{course.shortName ?? course.name}</strong><span className="mt-0.5 block text-xs text-[var(--muted-foreground)]">{course.sessions.length} 个上课时段</span></span><input type="checkbox" checked={checked} onChange={() => toggleReviewCourse(course.id)} className="h-5 w-5 shrink-0 accent-[var(--brand)]" aria-label={`${course.name}需要复习`} /></label>; })}</div>}</div>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--card-border)] p-5"><p className="text-xs text-[var(--muted-foreground)]">复习科目选择会保存在本机；登录后随账号同步。</p><div className="flex gap-3"><button type="button" onClick={onClose} className="rounded-full border border-[var(--card-border)] px-5 py-2.5 text-sm font-medium">取消</button><button type="button" disabled={!preview} onClick={applyPreview} className="rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-40 dark:text-[#202124]">保存课表与复习科目</button></div></div>
      </div>
    </div>
  );
}

type MergedLearningTask = NonNullable<LearningTask['mergedTasks']>[number];

function subtaskActionLabel(item: MergedLearningTask): string {
  if (item.type === 'completeness-audit' || item.type === 'study') return '完成';
  if (item.type === 'cue-review' || item.type === 'unit-review' || item.type === 'cumulative-review') return '开始 CUE';
  return '记录';
}

function TaskList({ tasks, completions, cueCount, onStudyCue, onComplete, onSubtask, onPostpone, onCancel, didaAccount, didaAddedTaskKeys, sendingTaskKey, onSendToDida }: { tasks: LearningTask[]; completions: ScheduleControlState['completions']; cueCount: (task: LearningTask) => number; onStudyCue: (task: LearningTask) => void; onComplete: (task: LearningTask) => void; onSubtask: (task: LearningTask, item: MergedLearningTask) => void; onPostpone: (task: LearningTask) => void; onCancel: (task: LearningTask) => void; didaAccount?: DidaAccountView; didaAddedTaskKeys: ReadonlySet<string>; sendingTaskKey: string; onSendToDida: (task: LearningTask) => void }) {
  if (!tasks.length) {
    return <div className="rounded-2xl border border-dashed border-[var(--card-border)] px-5 py-10 text-center"><span aria-hidden="true" className="material-icons-round text-3xl text-emerald-500">task_alt</span><p className="mt-2 font-medium">今天的任务已经清空</p><p className="mt-1 text-sm text-[var(--muted-foreground)]">可以自己添加预习、专项学习、考试或普通待办。</p></div>;
  }
  return (
    <div className="space-y-3">
      {tasks.map((task) => {
        const meta = TYPE_META[task.type];
        return (
          <article key={task.key} className="group rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 transition hover:border-[color-mix(in_srgb,var(--brand)_45%,var(--card-border))] hover:shadow-sm">
            <div className={`${styles.taskBody} flex gap-3`}>
              <button type="button" aria-label={`完成 ${task.title}`} onClick={() => onComplete(task)} className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-[var(--card-border)] text-transparent transition hover:border-emerald-500 hover:bg-emerald-500 hover:text-white"><span aria-hidden="true" className="material-icons-round text-base">check</span></button>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${meta.tone}`}><span aria-hidden="true" className="material-icons-round text-sm">{meta.icon}</span>{meta.label}</span>
                  {task.overdue && <span className="rounded-full bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 dark:bg-rose-950/50 dark:text-rose-200">已逾期</span>}
                  {task.start && <span className="text-xs font-medium text-[var(--muted-foreground)]">{task.start} · {task.durationMinutes} 分钟</span>}
                </div>
                <h3 className="mt-2 font-semibold">{task.title}</h3>
                {task.mergedTasks?.length ? <div className="mt-3 rounded-2xl border border-blue-200 bg-blue-50/70 p-3 dark:border-blue-900 dark:bg-blue-950/25"><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-[var(--brand)]">联合任务 · 共 {task.mergedTasks.length} 项</p><span className="text-[11px] text-[var(--muted-foreground)]">已完成 {task.mergedTasks.filter((item) => completions[item.key]).length}/{task.mergedTasks.length}</span></div><div className="mt-2 space-y-2">{task.mergedTasks.map((item) => { const itemMeta = TYPE_META[item.type]; const completed = Boolean(completions[item.key]); return <div key={item.key} className={`rounded-xl border px-3 py-2 transition ${completed ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/25' : 'border-transparent bg-[var(--card)]'}`}><div className={`${styles.subtaskBody} flex items-start gap-2`}><button type="button" disabled={completed} onClick={() => onSubtask(task, item)} aria-label={`${completed ? '已完成' : subtaskActionLabel(item)} ${item.title}`} className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition ${completed ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-[var(--card-border)] text-transparent hover:border-emerald-500 hover:bg-emerald-500 hover:text-white'}`}><span aria-hidden="true" className="material-icons-round text-sm">check</span></button><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${completed ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200' : itemMeta.tone}`}>{completed ? '已完成' : itemMeta.label}</span><strong className={`text-xs ${completed ? 'text-[var(--muted-foreground)] line-through' : ''}`}>{item.title}</strong></div><p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">{item.detail}</p></div>{!completed && <button type="button" onClick={() => onSubtask(task, item)} className="shrink-0 rounded-full border border-[var(--card-border)] px-2.5 py-1 text-[11px] font-semibold text-[var(--brand)]">{subtaskActionLabel(item)}</button>}</div></div>; })}</div></div> : <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">{task.detail}</p>}
                {task.scope && <p className="mt-2 text-xs text-[var(--muted-foreground)]"><strong className="text-[var(--foreground)]">范围：</strong>{[task.subjectName, task.scope.unit, task.scope.subsection].filter(Boolean).join(' → ') || `${task.cueIds?.length ?? 0} 条 Cue`}</p>}
                {task.materials?.length ? <div className="mt-2 flex flex-wrap gap-1.5">{task.materials.map((material) => <span key={material.code} className="rounded-full bg-black/5 px-2.5 py-1 text-[11px] dark:bg-white/10"><strong className="font-mono">{material.code}</strong>{material.progress ? ` · ${material.progress}` : ''}</span>)}</div> : null}
                <div className="mt-3 flex flex-wrap gap-2">{cueCount(task) > 0 && <button type="button" onClick={() => onStudyCue(task)} className="inline-flex items-center gap-1 rounded-full bg-[var(--brand)] px-3 py-1.5 text-xs font-semibold text-white dark:text-[#202124]"><span aria-hidden="true" className="material-icons-round text-base">psychology_alt</span>开始学习 · {cueCount(task)} 项</button>}{task.guide && <Link href={`/study-guide?tab=${encodeURIComponent(task.guide.tab)}&subTab=${encodeURIComponent(task.guide.subTab)}`} className="inline-flex items-center gap-1 rounded-full border border-[var(--card-border)] px-3 py-1.5 text-xs font-semibold text-[var(--brand)]"><span aria-hidden="true" className="material-icons-round text-base">menu_book</span>查看怎么做</Link>}</div>
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
              <div className={`${styles.taskActions} flex shrink-0 flex-col gap-1`}>{didaAccount && <button type="button" disabled={sendingTaskKey === task.key} onClick={() => onSendToDida(task)} aria-label={`将 ${task.title} 添加到 ${didaAccount.displayName}`} title={didaAddedTaskKeys.has(didaSourceKey(task)) ? `已添加；点击可更新 ${didaAccount.displayName} 中的任务` : `添加到 ${didaAccount.displayName}`} className={`inline-flex h-9 items-center gap-1 rounded-full px-2.5 text-xs font-medium hover:bg-blue-50 disabled:opacity-50 dark:hover:bg-blue-950/40 ${didaAddedTaskKeys.has(didaSourceKey(task)) ? 'text-emerald-600' : 'text-[#1a73e8]'}`}><span aria-hidden="true" className="material-icons-round text-lg">{didaAddedTaskKeys.has(didaSourceKey(task)) ? 'task_alt' : 'playlist_add'}</span>{sendingTaskKey === task.key ? '添加中' : didaAddedTaskKeys.has(didaSourceKey(task)) ? '已添加' : '滴答清单'}</button>}<button type="button" onClick={() => onPostpone(task)} aria-label={`将 ${task.title} 延至明天`} title="延至明天" className="inline-flex h-9 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-[var(--muted-foreground)] hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/40"><span aria-hidden="true" className="material-icons-round text-lg">next_plan</span>明天</button><button type="button" onClick={() => onCancel(task)} aria-label={`取消 ${task.title}`} title="取消任务" className="inline-flex h-9 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-[var(--muted-foreground)] hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"><span aria-hidden="true" className="material-icons-round text-lg">cancel</span>取消</button></div>
            </div>
          </article>
        );
      })}
    </div>
  );
}


function StudyTaskPreview({ task, cues, bank, onClose, onStart }: { task: LearningTask; cues: StudyCue[]; bank: QuestionBankState; onClose: () => void; onStart: (items: StudyItemRef[]) => void }) {
  const [excluded, setExcluded] = useState<string[]>([]);
  const questionIds = new Set(task.questionIds ?? task.scope?.questionIds ?? []);
  const selectedCues = task.cueIds?.length || task.scope?.cueIds?.length ? cuesForLearningTask(cues, task) : [];
  const queue = buildStudyQueue(selectedCues, bank.questions.filter((question) => questionIds.has(question.id)));
  const selected = queue.filter((item) => !excluded.includes(itemKey(item)));
  return createPortal(<div className="fixed inset-0 z-[90] overflow-y-auto bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="本次学习预览"><div className="mx-auto my-6 max-w-2xl space-y-4 rounded-3xl bg-[var(--background)] p-5"><h2 className="text-xl font-semibold">本次学习预览</h2><p className="text-sm">{task.title} · 已选 {selected.length} 项 · 预计 {estimatedStudyMinutes(selected)} 分钟</p><p className="text-xs text-[var(--muted-foreground)]">可以取消本次不学习的内容；未完成内容继续留在复习队列。</p><div className="space-y-2">{queue.map((item) => { const content = item.kind === 'cue' ? cues.find((cue) => cue.id === item.id) : bank.questions.find((question) => question.id === item.id); return <label key={itemKey(item)} className="flex items-start gap-3 rounded-xl border border-[var(--card-border)] p-3"><input type="checkbox" className="mt-1" checked={!excluded.includes(itemKey(item))} onChange={(event) => setExcluded((current) => event.target.checked ? current.filter((key) => key !== itemKey(item)) : [...current, itemKey(item)])} /><span className="min-w-0 text-sm">{item.kind === 'cue' ? '知识 CUE' : '题目'} · {content?.unit} · {content?.prompt}</span></label>; })}</div><div className="flex gap-2"><button type="button" disabled={!selected.length} className="rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-40" onClick={() => onStart(selected)}>开始学习</button><button type="button" className="rounded-xl border border-[var(--card-border)] px-4 py-3 text-sm" onClick={onClose}>返回</button></div></div></div>, document.body);
}

export default function ScheduleControl({ personalIeltsPlan = false }: { personalIeltsPlan?: boolean }) {
  const { cueShuffle } = useCueStudyPreferences();
  const universeEnabled = useCueUniverseEnabled();
  const [standaloneShopOpen, setStandaloneShopOpen] = useState(false);
  const [starSummary, setStarSummary] = useState<'summary' | 'album' | null>(null);
  const { signedIn } = useAuthMode();
  const [state, setState] = useState<ScheduleControlState>(() => createEmptyScheduleState());
  const [questionBank, setQuestionBank] = useState<QuestionBankState>(emptyQuestionBank);
  const [questionBankError, setQuestionBankError] = useState('');
  const [learningResult, setLearningResult] = useState<LearningCompletionData | null>(null);
  const [activeStudyId, setActiveStudyId] = useState<string | null>(null);
  const [studyPreviewTask, setStudyPreviewTask] = useState<LearningTask | null>(null);
  const [ready, setReady] = useState(false);
  const gameAccount = useMemo(() => reconcileCueGameAccount(state.cueGameAccount, state.cueReviews), [state.cueGameAccount, state.cueReviews]);
  useEffect(() => { if (!ready) return; queueMicrotask(() => setState(current => { const account = reconcileCueGameAccount(current.cueGameAccount, current.cueReviews); return account === current.cueGameAccount ? current : { ...current, cueGameAccount: account }; })); }, [ready, state.cueReviews]);
  const shopAction = useCallback((action: CueShopAction) => setState(current => {
    const account = reconcileCueGameAccount(current.cueGameAccount, current.cueReviews);
    const next = action.kind === 'purchase' ? purchaseCueShopItem(account, action.itemId).account : action.kind === 'equip' ? equipCueShopItem(account, action.itemId) : { ...account, equipment: { ...account.equipment, [action.category]: undefined } };
    return { ...current, cueGameAccount: next };
  }), []);
  const [guideOpen, setGuideOpen] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const entryParams = useSearchParams().toString();
  const [view, setView] = useState<'today' | 'week' | 'cue' | 'questions' | 'records' | 'memos' | 'settings'>('today');
  const [reviewTask, setReviewTask] = useState<LearningTask | null>(null);
  const [cueStudyTask, setCueStudyTask] = useState<LearningTask | null>(null);
  const [taskDialog, setTaskDialog] = useState(false);
  const [cueManager, setCueManager] = useState(false);
  const [cueManagerSubject, setCueManagerSubject] = useState('');
  const [importDialog, setImportDialog] = useState(false);

  const [catalogDialog, setCatalogDialog] = useState(false);
  const [notice, setNotice] = useState('');
  const [didaAccounts, setDidaAccounts] = useState<DidaAccountView[]>([]);
  const [seiueReviewTasks, setSeiueReviewTasks] = useState<LearningTask[]>([]);
  const [didaTaskCount, setDidaTaskCount] = useState(0);
  const [selectedDidaAccountId, setSelectedDidaAccountId] = useState('');
  const [didaAddedTaskKeys, setDidaAddedTaskKeys] = useState<Set<string>>(() => new Set());
  const [sendingTaskKey, setSendingTaskKey] = useState('');
  const autoDidaAttemptedRef = useRef(new Set<string>());
  const skipInitialEmptySaveRef = useRef(false);
  const scheduleBaseRef = useRef<unknown>(undefined);
  const questionBaseRef = useRef<unknown>(undefined);
  const localWritersRef=useRef(new Map<string,ReturnType<typeof createLocalEditWriter>>());
  const localWriter=useCallback((key:string)=>{
    let writer=localWritersRef.current.get(key);
    if(!writer){writer=createLocalEditWriter(localStorage,key,navigator.locks ? async (name,work)=>await navigator.locks.request(name,work) : undefined);localWritersRef.current.set(key,writer);}
    return writer;
  },[]);
  const [persistenceError, setPersistenceError] = useState('');
  const [aiReportBusyId, setAiReportBusyId] = useState('');
  const [reminderTitle, setReminderTitle] = useState('');
  const [reminderDate, setReminderDate] = useState('');
  const [reminderSubjectId, setReminderSubjectId] = useState('');
  const selected = useMemo(() => selectedDate ? dateFromKey(selectedDate) : new Date(2000, 0, 1), [selectedDate]);
  const todayKey = now ? dateKey(now) : '';

  useEffect(() => {
    queueMicrotask(() => {
      try {
      const current = new Date();
      setNow(current);
      setSelectedDate(dateKey(current));
      skipInitialEmptySaveRef.current = localStorage.getItem(STORAGE_KEY) === null;
      scheduleBaseRef.current = parseLocalValue(localStorage.getItem(STORAGE_KEY));
      questionBaseRef.current = parseLocalValue(localStorage.getItem(QUESTION_BANK_KEY));
      const loadedState = readScheduleState(localStorage, current);
      setState(loadedState);
      setGuideOpen((loadedState.settings.tutorialSeenVersion ?? 0) < 1);
      const storedQuestions = localStorage.getItem(QUESTION_BANK_KEY);
      if (storedQuestions) {
        try { setQuestionBank(readQuestionBank(JSON.parse(storedQuestions))); }
        catch (error) { setQuestionBankError(`题库读取失败，原数据已保留：${error instanceof Error ? error.message : '格式错误'}`); }
      }
      const requestedView = new URLSearchParams(window.location.search).get('view');
      if (requestedView === 'cue') { setView('cue'); setGuideOpen(false); }
      setReady(true);
      } catch (error) { setPersistenceError(error instanceof Error ? error.message : '学习数据读取失败'); }
    });
  }, []);
  useEffect(() => {
    if (!ready) return;
    if (skipInitialEmptySaveRef.current && !scheduleHasContent(state)) {
      skipInitialEmptySaveRef.current = false;
      return;
    }
    skipInitialEmptySaveRef.current = false;
    const candidate = state;
    void localWriter(STORAGE_KEY).write(scheduleBaseRef.current,candidate).then(merged=>{
      scheduleBaseRef.current=merged;
      setPersistenceError('');
      if(canonicalJson(merged)!==canonicalJson(candidate))setState(current=>threeWayMerge(candidate,current,merged).merged as ScheduleControlState);
      if(signedIn)window.dispatchEvent(new Event('jackyun-sync-edit'));
    }).catch(error=>setPersistenceError(error instanceof Error?error.message:'页面保存失败，原始内容已保留。'));
  }, [ready, signedIn, state,localWriter]);
  useEffect(() => {
    const reload = (keys?: string[]) => {
      if(!keys || keys.includes(STORAGE_KEY)) {
        const incoming=parseLocalValue(localStorage.getItem(STORAGE_KEY));
        const base=scheduleBaseRef.current;
        setState(current=>{const result=threeWayMerge(base,current,incoming);if(!result.conflicts.length){scheduleBaseRef.current=incoming;localWriter(STORAGE_KEY).reset(incoming);}return (result.merged ?? readScheduleState(localStorage)) as ScheduleControlState;});
      }
      if(!keys || keys.includes(QUESTION_BANK_KEY)) {
        try {
          const incoming=parseLocalValue(localStorage.getItem(QUESTION_BANK_KEY));
          const base=questionBaseRef.current;
          setQuestionBank(current=>{const result=threeWayMerge(base,current,incoming);if(!result.conflicts.length){questionBaseRef.current=incoming;localWriter(QUESTION_BANK_KEY).reset(incoming);}return readQuestionBank(result.merged ?? emptyQuestionBank());});setQuestionBankError('');
        } catch(error){setQuestionBankError(error instanceof Error?error.message:'题库读取失败，原始内容已保留。');}
      }
    };
    const cloud=(event:Event)=>reload((event as CustomEvent<{keys?:string[]}>).detail?.keys);
    const storage=(event:StorageEvent)=>{if(event.storageArea===localStorage && (event.key===STORAGE_KEY || event.key===QUESTION_BANK_KEY))reload([event.key]);};
    window.addEventListener(CLOUD_STATE_APPLIED_EVENT,cloud);
    window.addEventListener('storage',storage);
    return()=>{window.removeEventListener(CLOUD_STATE_APPLIED_EVENT,cloud);window.removeEventListener('storage',storage);};
  }, [localWriter]);
  useEffect(() => {
    if (ready && new URLSearchParams(entryParams).get('view') === 'cue') queueMicrotask(() => { setView('cue'); setGuideOpen(false); });
  }, [entryParams, ready]);
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
  useEffect(() => {
    if (!selectedDidaAccountId) { queueMicrotask(() => setDidaAddedTaskKeys(new Set())); return; }
    let cancelled = false;
    fetch(`/api/integrations/dida365/tasks?accountId=${encodeURIComponent(selectedDidaAccountId)}`, { cache: 'no-store' }).then(async (response) => {
      if (!response.ok) return;
      const data = await response.json() as { sourceKeys?: string[] };
      if (!cancelled) setDidaAddedTaskKeys(new Set(data.sourceKeys ?? []));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [selectedDidaAccountId]);

  const todaySessions = useMemo(() => sessionsForDate(state.timetable, selected), [selected, state.timetable]);
  const tasks = useMemo(() => {
    const scheduled = tasksForDate(state, selected, questionReviewTasks(questionBank, selected));
    return [...scheduled, ...seiueReviewTasks.filter(task => task.date === selectedDate && !state.completions[task.key] && !state.cancellations[task.key])];
  }, [selectedDate, selected, state, questionBank, seiueReviewTasks]);
  const updateSeiueReviewTasks = useCallback((next: LearningTask[]) => setSeiueReviewTasks(next), []);
  const week = useMemo(() => weekDates(selected), [selected]);
  const completedToday = now ? Object.values(state.completions).filter((completion) => dateKey(new Date(completion.completedAt)) === todayKey).length : 0;
  const reviewDue = tasks.filter((task) => REVIEW_TYPES.has(task.type)).length;
  const reviewCues = state.cues;
  const cueStudyIdsKey = JSON.stringify(cueStudyTask ? Object.values(allCueStudyDrafts(state)).find((draft) => draft.task.key === cueStudyTask.key)?.cueIds : undefined);
  const cueStudyCues = useMemo(() => {
    if (!cueStudyTask) return [];
    const ids = cueStudyIdsKey ? new Set(JSON.parse(cueStudyIdsKey) as string[]) : undefined;
    return ids ? state.cues.filter((cue) => ids.has(cue.id)) : cuesForLearningTask(state.cues, cueStudyTask);
  }, [cueStudyTask, state.cues, cueStudyIdsKey]);
  const selectedDidaAccount = didaAccounts.find((account) => account.id === selectedDidaAccountId);
  const sendToDida = async (task: LearningTask) => {
    if (!selectedDidaAccount) return;
    setSendingTaskKey(task.key);
    try {
      const response = await fetch('/api/integrations/dida365/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId: selectedDidaAccount.id, task }) });
      const data = await response.json().catch(() => ({})) as { error?: string; created?: boolean };
      if (!response.ok) throw new Error(data.error || '添加失败。');
      setDidaAddedTaskKeys((current) => new Set(current).add(didaSourceKey(task)));
      setNotice(data.created ? `已添加到 ${selectedDidaAccount.displayName}。` : `已更新 ${selectedDidaAccount.displayName} 中的同一任务。`);
    } catch (error) { setNotice(error instanceof Error ? error.message : '添加到滴答清单失败。'); }
    finally { setSendingTaskKey(''); }
  };
  useEffect(() => {
    if (!ready || !signedIn || !now || !selectedDidaAccount || !state.settings.didaAutoSyncPostClass) return;
    const postClassTasks = tasksForDate(state, now, questionReviewTasks(questionBank, now)).filter((task) => (task.mergedTaskKeys ?? [task.key]).some((key) => key.startsWith('course-review:')));
    const pending = postClassTasks.filter((task) => {
      const sourceKey = didaSourceKey(task);
      const attemptKey = `${selectedDidaAccount.id}:${sourceKey}`;
      return !didaAddedTaskKeys.has(sourceKey) && !autoDidaAttemptedRef.current.has(attemptKey);
    });
    if (!pending.length) return;
    for (const task of pending) autoDidaAttemptedRef.current.add(`${selectedDidaAccount.id}:${didaSourceKey(task)}`);
    void Promise.all(pending.map(async (task) => {
      const response = await fetch('/api/integrations/dida365/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId: selectedDidaAccount.id, task }) });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || '自动同步失败。');
      return didaSourceKey(task);
    })).then((sourceKeys) => {
      setDidaAddedTaskKeys((current) => new Set([...current, ...sourceKeys]));
      setNotice(`已自动把 ${sourceKeys.length} 项课后学习闭环同步到 ${selectedDidaAccount.displayName}。`);
    }).catch((error) => setNotice(error instanceof Error ? `滴答清单自动同步：${error.message}` : '滴答清单自动同步失败。'));
  }, [didaAddedTaskKeys, now, ready, selectedDidaAccount, signedIn, state, questionBank]);
  const saveCueStudyProgress = useCallback((draft: CueStudyDraft) => {
    setState((current) => saveCueStudyDraft(current, draft));
  }, []);
  const saveCueStudyAssessment = useCallback((task: LearningTask, cueId: string, status: LearningStatus, practice = false, editPractice = false) => {
    setState((current) => recordCueStudyAssessment(current, { cueId, status }, new Date(), task.key, practice, editPractice));
  }, []);
  const saveCueMemo = useCallback((cueId: string, content: string) => {
    setState((current) => {
      const remaining = current.cueMemos.filter((memo) => memo.cueId !== cueId);
      return {
        ...current,
        cueMemos: content ? [...remaining, { cueId, content, updatedAt: new Date().toISOString() }] : remaining,
      };
    });
  }, []);
  const startCueStudy = async (task: LearningTask, shuffled = cueShuffle) => {
    setStarSummary(null);
    if (task.questionIds?.length || task.scope?.questionIds?.length) { setStudyPreviewTask(task); return; }
    const cueIds = cuesForLearningTask(state.cues, task).map((cue) => cue.id);
    if (!cueIds.length) { setNotice('当前范围没有到期 Cue；熟练掌握的内容将在到期后重新出现。'); return; }
    const sameSubjectDraft = Object.values(allCueStudyDrafts(state)).find((draft) => (
      (task.subjectId && draft.task.subjectId === task.subjectId)
      || (Boolean(task.subjectName) && draft.task.subjectName === task.subjectName)
    ));
    if (sameSubjectDraft && (sameSubjectDraft.task.key === task.key || (sameSubjectDraft.cueIds.length === cueIds.length && sameSubjectDraft.cueIds.every((id) => cueIds.includes(id))))) {
      setCueStudyTask(sameSubjectDraft.task);
      setNotice('已恢复这项 Cue 学习的上次进度。');
      return;
    }
    if (sameSubjectDraft && !(await siteConfirm('这个学科已有未完成的 Cue 学习进度。开始新的学习会替换该学科的进度，是否继续？', { title: '替换学习进度？', confirmLabel: '开始新的学习', cancelLabel: '保留原进度' }))) return;
    const orderedIds = shuffled ? shuffleCueIds(cueIds, Math.random, state.cues) : cueIds;
    const draft: CueStudyDraft = {
      id: task.key, task: { ...task, cueIds }, cueIds: orderedIds, index: 0, revealed: false,
      assessments: {}, shuffled, startedAt: new Date().toISOString(),
      priorStatuses: Object.fromEntries(state.cues.filter((cue) => cueIds.includes(cue.id)).map((cue) => [cue.id, cue.status ?? null])),
      updatedAt: new Date().toISOString(),
    };
    setState((current) => saveCueStudyDraft(current, draft));
    setCueStudyTask(draft.task);
  };
  const startSpecialCueStudy = async (subjectName: string, unit: string, cueIds: string[], shuffled: boolean) => {
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
    (await startCueStudy(task, shuffled));
  };

  const openLearningSubtask = async (task: LearningTask, item: MergedLearningTask) => {
    if (state.completions[item.key]) return;
    if (item.type === 'completeness-audit' || item.type === 'study') {
      setState((current) => completeLearningSubtask(current, task, item.key, new Date()));
      setNotice(item.type === 'completeness-audit' ? '课堂笔记已标记为补全并上传。' : 'CUE 生成 / 修订步骤已完成。');
      return;
    }
    const subtask: LearningTask = {
      ...task,
      key: item.key,
      title: item.title,
      detail: item.detail,
      type: item.type,
      mergedTaskKeys: item.type === 'cue-review'
        ? [...new Set([item.key, ...(task.mergedTaskKeys ?? []).filter((key) => key.startsWith('cue-review:'))])]
        : [item.key],
      mergedTasks: undefined,
    };
    const cueReview = item.type === 'cue-review' || item.type === 'unit-review' || item.type === 'cumulative-review';
    if (subtask.questionIds?.length) { setStudyPreviewTask(subtask); return; }
    if (cueReview && cuesForLearningTask(state.cues, subtask).length) {
      (await startCueStudy(subtask));
      setNotice('已进入这个小任务对应的 CUE 学习。');
      return;
    }
    setReviewTask(subtask);
    setNotice(cueReview ? '当前没有可直接学习的 CUE，请先补充内容或记录本次情况。' : '请记录这个小任务的实际内容和证据。');
  };

  const completeTask = async (task: LearningTask) => {
    if (task.key.startsWith('cue-maintenance:')) {
      setCueManagerSubject('');
      setCueManager(true);
      setNotice('请按到期科目分别执行一次“批量创建 / 修改 Cue”；完成导入后会自动记录日期并重排提醒。');
      return;
    }
    if (task.questionIds?.length || task.scope?.questionIds?.length) { setStudyPreviewTask(task); return; }
    if (cuesForLearningTask(state.cues, task).length) { (await startCueStudy(task)); return; }
    setReviewTask(task);
  };
  const postponeTask = (task: LearningTask) => {
    const tomorrow = addCalendarDays(selectedDate, 1);
    setState((current) => postponeLearningTask(current, task, tomorrow));
    setNotice(`任务已延至${formatLongDate(dateFromKey(tomorrow))}。`);
  };
  const cancelTask = async (task: LearningTask) => {
    if (!(await siteConfirm(`确定取消任务「${task.title}」吗？`))) return;
    const cancelledAt = new Date().toISOString();
    setState((current) => cancelLearningTask(current, task, cancelledAt));
    setNotice('任务已取消。');
  };
  const navigateDate = (offset: number) => { const date = new Date(selected); date.setDate(date.getDate() + offset); setSelectedDate(dateKey(date)); };
  const submitReview = async (task: LearningTask, details: ReviewDetails, evidence: LearningSessionEvidence) => {
    const completedAt = new Date();
    const subjectName = evidence.subjectName?.trim() || task.subjectName || '';
    const subject = state.learningCatalog.find((item) => item.name === subjectName);
    const progressChanges = evidence.materials.filter((material) => material.progress?.trim() && subject?.materialProgress[material.code] !== material.progress.trim());
    const updateMaterials = Boolean(subject && progressChanges.length && (await siteConfirm(`要更新 ${subject.name} 的资料位置吗？\n${progressChanges.map((material) => `${material.code}: ${subject.materialProgress[material.code] ?? '未记录'} → ${material.progress}`).join('\n')}`)));
    const status = deriveLearningStatus(evidence.cueIds, evidence.assessments);
    let updated = completeLearningSession(state, task, details, evidence, completedAt);
    const activeDraft = Object.values(allCueStudyDrafts(updated)).find(draft => draft.task.key === task.key);
    if (activeDraft) updated = removeCueStudyDraft(updated, activeDraft);
    if (updateMaterials) updated = { ...updated, learningCatalog: updateSubjectMaterialProgress(updated.learningCatalog, subjectName, progressChanges) };
    const saved = await localWriter(STORAGE_KEY).write(scheduleBaseRef.current, updated) as ScheduleControlState;
    scheduleBaseRef.current = saved;
    setState(current => threeWayMerge(state, current, saved).merged as ScheduleControlState);
    setLearningResult(summarizeLearningCompletion(saved, evidence.cueIds, evidence.questionAttempts?.length ?? 0, evidence.assessments.map(item => item.status), completedAt));
    setReviewTask(null);
    setCueStudyTask(null);
    if (universeEnabled && evidence.cueIds.length) setStarSummary('summary');
    const syncMessage = signedIn ? ' · 正在同步到账号' : ' · 当前保存在本机';
    if (status === 'unclear') {
      setNotice(`○ 未通过，问题已记录；修复后请重新判定${syncMessage}`);
      return;
    }
    if (!task.subjectId) {
      const reviewed = evidence.assessments.length;
      setNotice(`完成记录已保存${reviewed ? ` · 已更新 ${reviewed} 条 Cue` : ''}${syncMessage}`);
      return;
    }
    setNotice(`${statusMark(status)} 已提交 · 复习间隔已更新${syncMessage}`);
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
            { role: 'system', content: '你是严格遵循 JackYun StudyGuide 的学习报告教练。只根据提供的学习记录和 Cue 证据分析，不虚构表现。用中文输出 Markdown 文档，不要包裹在代码围栏中。使用清晰的二级标题、列表、加粗和必要的表格，结构为：本次证据概览；按学科与大单元分析；根据 √/△/○ 识别最小缺口；下一次可执行动作。遵循：先闭卷检索再看证据；Definition/State 检查必要得分点；Explain 检查完整 marking-point chain；只做 minimal repair；稳定的 Cue 不机械重做。' },
            { role: 'user', content: JSON.stringify({ task: record.taskTitle, content: record.studiedContent, issue: record.issue, scope: record.scope, materials: record.materials, cues: record.cues, questionAttempts: record.questionAttempts, systemReport: record.systemReport }) },
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

  const commitQuestionBank = async (next: QuestionBankState) => {
    if (questionBankError) throw new Error(questionBankError);
    const drafts = Object.fromEntries(Object.entries(next.drafts).map(([id, draft]) => [id, reconcileStudyDraft(draft, state.cues, next.questions)]));
    const reconciled = { ...next, drafts };
    setQuestionBank(reconciled);
    let saved: QuestionBankState;
    try { saved = await localWriter(QUESTION_BANK_KEY).write(questionBaseRef.current,reconciled) as QuestionBankState;questionBaseRef.current=saved; }
    catch (error) { setPersistenceError(error instanceof Error?error.message:'题库保存失败，原始数据保留。');return false; }
    setQuestionBank(current=>threeWayMerge(reconciled,current,saved).merged as QuestionBankState);
    if (signedIn) window.dispatchEvent(new Event('jackyun-sync-edit'));
    return true;
  };
  const changeQuestionBank = (next: QuestionBankState) => {
    commitQuestionBank(next);
    setState((current) => ({ ...current, learningCatalog: current.learningCatalog.map((subject) => {
      const added = [...new Set(next.questions.filter((question) => question.subjectId === subject.id).map((question) => question.unit))].filter((unit) => !subject.units.some((item) => item.name === unit));
      return added.length ? { ...subject, units: [...subject.units, ...added.map((name) => ({ name, subsections: [] }))] } : subject;
    }) }));
  };
  const startUnifiedStudy = async (mode: StudyMode, subjectId: string, unit: string, items: StudyItemRef[], sourceTask?: LearningTask, shuffled = cueShuffle) => {
    const subjectName = !subjectId && mode === 'cue' ? jointCueSubjectName(items.flatMap((item) => { const cue = state.cues.find((cue) => item.kind === 'cue' && cue.id === item.id); return cue ? [cue] : []; })) : state.learningCatalog.find((subject) => subject.id === subjectId)?.name ?? state.cues.find((cue) => cue.subjectId === subjectId)?.subjectName ?? questionBank.questions.find((question) => question.subjectId === subjectId)?.subjectName;
    const id = `study-${taskId()}`;
    const task: LearningTask = sourceTask ?? { key: id, title: `学习 · ${subjectName ?? ''}${unit ? ` · ${unit}` : ''}`, detail: '独立检索与作答，分别保存评价。', type: 'special', date: todayKey, durationMinutes: estimatedStudyMinutes(items), subjectId, subjectName, scope: { ...(unit ? { unit } : {}) } };
    if (mode === 'cue') { (await startCueStudy({ ...task, cueIds: items.map((item) => item.id), scope: { ...task.scope, cueIds: items.map((item) => item.id) } }, shuffled)); return; }
    const cueIds = items.filter((item) => item.kind === 'cue').map((item) => item.id);
    const questionIds = items.filter((item) => item.kind === 'question').map((item) => item.id);
    const batchSize = items.length > 20 && cueIds.length > 0 && mode === 'mixed' ? 20 : undefined;
    const draft: StudyDraft = { id, mode, task: { ...task, cueIds, questionIds, scope: { ...task.scope, cueIds, questionIds } }, items, ...(batchSize ? { batchSize } : {}), index: 0, revealed: {}, responses: {}, assessments: {}, updatedAt: new Date().toISOString() };
    commitQuestionBank({ ...questionBank, drafts: { ...questionBank.drafts, [id]: draft } });
    setActiveStudyId(id); setStudyPreviewTask(null);
  };
  const resumeUnifiedStudy = async (id: string) => {
    const saved = questionBank.drafts[id];
    if (!saved) return;
    const migrated = legacyCueStudyDraft(saved, state.cues);
    if (!migrated) { setActiveStudyId(id); return; }
    const existing = allCueStudyDrafts(state)[migrated.task.subjectId || migrated.task.subjectName || '未分类'];
    if (existing && existing.task.key !== migrated.task.key && !(await siteConfirm('这个范围已有未完成的 Cue 学习进度。恢复旧进度会替换它，是否继续？'))) return;
    const nextState = saveCueStudyDraft(state, migrated);
    // Save the destination before removing the old resumable draft.
    const savedState = await localWriter(STORAGE_KEY).write(scheduleBaseRef.current,nextState) as ScheduleControlState;
    scheduleBaseRef.current=savedState;setState(savedState);
    const drafts = { ...questionBank.drafts }; delete drafts[id];
    if (!await commitQuestionBank({ ...questionBank, drafts })) return;
    setCueStudyTask(migrated.task);
  };
  const scheduleCueBudget = async (cueIds: string[]) => {
    const result = addCueBudgetTask(state, cueIds, new Date(), `manual-${taskId()}`);
    if (!result.created) { setNotice(result.count ? '同范围任务已在今日日程中。' : '这些内容当前不再待学，请刷新范围。'); return; }
    const saved = await localWriter(STORAGE_KEY).write(scheduleBaseRef.current, result.state) as ScheduleControlState;
    scheduleBaseRef.current = saved;
    setState(current => threeWayMerge(state, current, saved).merged as ScheduleControlState);
    if (signedIn) window.dispatchEvent(new Event('jackyun-sync-edit'));
    setNotice(`已加入今日日程 · ${result.count} 条 CUE`);
  };
  const changeCueDifficulty = (id: string, userDifficulty?: CueDifficulty) => setState((current) => {
    const cues = current.cues.map((cue) => cue.id === id ? { ...cue, userDifficulty } : cue);
    const change = createCueChangeRecord(current.cues, cues, 'manual', new Date().toISOString(), taskId());
    return recalculateLegacyCueSchedules({ ...current, cueScheduleRevision: 0, cues, cueChangeHistory: [...(current.cueChangeHistory ?? []), ...(change ? [change] : [])] });
  });
  const rateStudyItem = (draft: StudyDraft, item: StudyItemRef, status: LearningStatus) => {
    const at = new Date();
    const nextDraft = { ...draft, assessments: { ...draft.assessments, [itemKey(item)]: status }, updatedAt: at.toISOString() };
    const next = item.kind === 'question' ? recordQuestionAttempt(questionBank, item.id, draft.id, draft.responses[itemKey(item)], status, at.toISOString(), draft.questionSnapshots?.[itemKey(item)]) : questionBank;
    commitQuestionBank({ ...next, drafts: { ...next.drafts, [draft.id]: nextDraft } });
    if (item.kind === 'cue') setState((current) => recordCueStudyAssessment(current, { cueId: item.id, status }, at, draft.id));
  };
  const finishUnifiedStudy = async (draft: StudyDraft) => {
    const live = reconcileStudyDraft(draft, state.cues, questionBank.questions);
    if (!live.items.length || live.items.some((item) => !live.assessments[itemKey(item)])) throw new Error('请完成本次全部内容的评价。');
    const cueIds = live.items.filter((item) => item.kind === 'cue').map((item) => item.id);
    const questionIds = live.items.filter((item) => item.kind === 'question').map((item) => item.id);
    const attempts = questionIds.map((id) => questionBank.attempts.find((attempt) => attempt.sessionId === draft.id && attempt.questionId === id));
    if (attempts.some((attempt) => !attempt)) throw new Error('题目评价记录尚未保存。');
    const evidence: LearningSessionEvidence = { subjectName: draft.task.subjectName, scope: { ...draft.task.scope, cueIds, questionIds }, materials: draft.task.materials ?? [], cueIds, newCues: [], assessments: cueIds.map((id) => ({ cueId: id, status: live.assessments[`cue:${id}`] })), cueReviewsAlreadyRecorded: true, questionAttempts: attempts.filter((attempt): attempt is NonNullable<typeof attempt> => Boolean(attempt)), sessionId: draft.id };
    const taskForRecord = { ...draft.task, cueIds, questionIds, scope: { ...draft.task.scope, cueIds, questionIds } };
    const updated = completeLearningSession(state, taskForRecord, { studiedContent: '', issue: '', note: '' }, evidence, new Date());
    // Persist the record before removing the resumable draft. Retrying uses sessionId.
    const savedState = await localWriter(STORAGE_KEY).write(scheduleBaseRef.current,updated) as ScheduleControlState;
    scheduleBaseRef.current=savedState;setState(savedState);
    const drafts = { ...questionBank.drafts }; delete drafts[draft.id];
    if (!await commitQuestionBank({ ...questionBank, drafts })) return;
    setActiveStudyId(null);
    setLearningResult(summarizeLearningCompletion(savedState, cueIds, questionIds.length, Object.values(live.assessments)));
    setNotice(`学习记录已保存 · ${cueIds.length} 条 CUE、${questionIds.length} 题；未掌握内容按各自历史继续安排。`);
  };
  const activeStudyDraft = activeStudyId && questionBank.drafts[activeStudyId] ? reconcileStudyDraft(questionBank.drafts[activeStudyId], state.cues, questionBank.questions) : null;

  if (!ready || !now || !selectedDate) return <div className="mx-auto max-w-[1500px]">{persistenceError && <p role="alert" className="mb-4 rounded-xl border border-amber-500 p-4">{persistenceError} 原数据已保留，请检查同步中心或导出备份。</p>}<div className="h-28 rounded-3xl bg-black/5 dark:bg-white/5" /><div className="mt-5 grid gap-5 lg:grid-cols-3"><div className="h-80 rounded-3xl bg-black/5 dark:bg-white/5 lg:col-span-2" /><div className="h-80 rounded-3xl bg-black/5 dark:bg-white/5" /></div></div>;
  const cueDrafts = Object.values(allCueStudyDrafts(state));
  const activeCueDraft = cueStudyTask ? cueDrafts.find((draft) => draft.task.key === cueStudyTask.key) : undefined;

  return (
    <div className={`${styles.root} mx-auto min-w-0 max-w-[1500px] break-words pb-10`}>
      {persistenceError && <div role="alert" className="mb-4 rounded-xl border border-amber-500 p-4"><p>{persistenceError}</p><button type="button" className="mt-2 underline" onClick={()=>downloadStudyJson({schedule:parseLocalValue(localStorage.getItem(LOCAL_CONFLICT_PREFIX+STORAGE_KEY))??state,questions:parseLocalValue(localStorage.getItem(LOCAL_CONFLICT_PREFIX+QUESTION_BANK_KEY))??questionBank},'jackyun-unsaved-edits.json')}>下载两份内容与未保存修改</button></div>}
      <header className={`${styles.header} overflow-hidden rounded-3xl border border-[var(--card-border)] bg-[var(--card)] shadow-[var(--surface-shadow)]`}>
        <div className="relative px-4 py-4 sm:px-7 sm:py-6">
          <div className="pointer-events-none absolute -right-12 -top-20 h-56 w-56 rounded-full bg-blue-500/10 blur-3xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-3 sm:gap-5"><div><div className="hidden items-center gap-2 text-xs font-semibold uppercase sm:flex tracking-[.12em] text-[var(--brand)]"><span className="h-2 w-2 rounded-full bg-emerald-500" />Personal learning control</div><h1 className="mt-2 text-2xl font-semibold tracking-[-.035em] sm:text-3xl">{state.settings.mode === 'holiday' ? '假日学习控制台' : '今日学习与课表'}</h1><p className="mt-2 text-sm text-[var(--muted-foreground)]">{formatLongDate(selected)}{selectedDate !== todayKey ? ' · 正在查看其他日期' : ''}</p></div><div data-feature="schedule-management" className={`${styles.headerActions} grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto sm:flex-wrap`}><Button type="button" variant="outline" onClick={() => setCueManager(true)} className={`${styles.managementAction} rounded-full border border-[var(--card-border)] bg-[var(--card)] px-2 py-2.5 text-xs font-semibold sm:px-4 sm:text-sm hover:bg-black/[.035] dark:hover:bg-white/[.06]`}><span aria-hidden="true" className="material-icons-round mr-1 align-middle text-lg">quiz</span>Cue 管理</Button><Button type="button" variant="outline" onClick={() => setTaskDialog(true)} className="rounded-full border border-[var(--card-border)] bg-[var(--card)] px-2 py-2.5 text-xs font-semibold sm:px-4 sm:text-sm hover:bg-black/[.035] dark:hover:bg-white/[.06]"><span aria-hidden="true" className="material-icons-round mr-1 align-middle text-lg">add</span>添加任务</Button><Button type="button" onClick={() => setImportDialog(true)} className={`${styles.managementAction} rounded-full bg-[var(--brand)] px-2 py-2.5 text-xs font-semibold sm:px-4 sm:text-sm text-white dark:text-[#202124]`}><span aria-hidden="true" className="material-icons-round mr-1 align-middle text-lg">upload_file</span>导入课表</Button></div></div>

          <div data-feature="today-statistics" className={`${styles.stats} relative mt-4 grid grid-cols-4 gap-2 sm:mt-6 sm:gap-3`}><div className="rounded-2xl bg-black/[.035] p-2 sm:p-4 dark:bg-white/[.06]"><p className="text-xs text-[var(--muted-foreground)]">今日课程</p><strong className="mt-1 block text-xl sm:text-2xl">{state.settings.mode === 'holiday' ? '—' : todaySessions.length}</strong></div><div className="rounded-2xl bg-black/[.035] p-2 sm:p-4 dark:bg-white/[.06]"><p className="text-xs text-[var(--muted-foreground)]">待复习</p><strong className="mt-1 block text-xl sm:text-2xl">{reviewDue}</strong></div><div className="rounded-2xl bg-black/[.035] p-2 sm:p-4 dark:bg-white/[.06]"><p className="text-xs text-[var(--muted-foreground)]">今日完成</p><strong className="mt-1 block text-xl sm:text-2xl">{completedToday}</strong></div><div className="rounded-2xl bg-black/[.035] p-2 sm:p-4 dark:bg-white/[.06]"><p className="text-xs text-[var(--muted-foreground)]">当前模式</p><strong className="mt-1 block text-base sm:text-lg">{state.settings.mode === 'term' ? '学期' : '假日'}</strong></div></div>
        </div>
        <nav className={`${styles.viewNav} grid grid-cols-3 gap-1 border-t border-[var(--card-border)] px-2 pt-2 sm:flex sm:flex-wrap sm:px-6`} aria-label="日程视图">{([['today', 'today', '今日'], ['week', 'calendar_view_week', '周课表'], ['cue', 'psychology_alt', '学习'], ['questions', 'quiz', '题库'], ['records', 'history_edu', '学习记录'], ['memos', 'edit_note', '备忘录'], ['settings', 'tune', '设置']] as const).map(([key, icon, label]) => <Button key={key} type="button" variant="ghost" onClick={() => setView(key)} aria-current={view === key ? 'page' : undefined} className={`flex min-h-11 items-center justify-center gap-1 border-b-2 px-1 py-2 text-xs font-semibold sm:gap-2 sm:px-4 sm:py-3 sm:text-sm ${view === key ? 'border-[var(--brand)] text-[var(--brand)]' : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`}><span aria-hidden="true" className="material-icons-round text-lg">{icon}</span>{label}</Button>)}</nav>
        <ScheduleTouchNav view={view} onChange={setView} />
      </header>

      {(view === 'today' || view === 'week') && <div className="mt-5 flex items-center justify-between rounded-2xl border border-[var(--card-border)] bg-[var(--card)] px-3 py-2"><button type="button" onClick={() => navigateDate(view === 'week' ? -7 : -1)} aria-label="上一日期" className="grid h-10 w-10 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"><span aria-hidden="true" className="material-icons-round">chevron_left</span></button><button type="button" onClick={() => setSelectedDate(todayKey)} className="rounded-full px-4 py-2 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10">{selectedDate === todayKey ? formatShortDate(selected) : '回到今天'}</button><button type="button" onClick={() => navigateDate(view === 'week' ? 7 : 1)} aria-label="下一日期" className="grid h-10 w-10 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"><span aria-hidden="true" className="material-icons-round">chevron_right</span></button></div>}

      {(view === 'today' || view === 'week' || view === 'questions' || view === 'records') && <><ExamDiagnosisPanel state={state} bank={questionBank} date={selectedDate} onChange={setState} /><TimedPracticePanel state={state} date={selectedDate} onChange={setState} /></>}

      {view === 'today' && <div className={`${styles.todayLayout} mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,.65fr)]`}>
        <section className="min-w-0"><div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--muted-foreground)]">Today</p><h2 className="mt-1 text-xl font-semibold">今天要完成</h2></div><div className="flex items-center gap-2">{didaAccounts.length > 1 && <label className="text-xs text-[var(--muted-foreground)]">发送到 <select value={selectedDidaAccountId} onChange={(event) => setSelectedDidaAccountId(event.target.value)} className="ml-1 rounded-full border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-xs text-[var(--foreground)]">{didaAccounts.map((account) => <option key={account.id} value={account.id}>{account.displayName}</option>)}</select></label>}{signedIn && !didaAccounts.length && <Link href="/settings?section=connections" className="text-xs font-semibold text-[var(--brand)]">关联滴答清单</Link>}<span className="text-sm text-[var(--muted-foreground)]">{tasks.length + didaTaskCount} 项</span></div></div><DidaScheduleSync accounts={didaAccounts} selectedDate={selectedDate} onTaskCount={setDidaTaskCount} />{!didaAccounts.length && !state.timetable && !state.manualTasks.length && !state.cues.length && !seiueReviewTasks.length ? <EmptyState onImport={() => setImportDialog(true)} /> : (!didaTaskCount || tasks.length > 0) && <TaskList tasks={tasks} completions={state.completions} cueCount={(task) => cuesForLearningTask(state.cues, task).length + (task.questionIds?.length ?? task.scope?.questionIds?.length ?? 0)} onStudyCue={startCueStudy} onComplete={completeTask} onSubtask={openLearningSubtask} onPostpone={postponeTask} onCancel={cancelTask} didaAccount={selectedDidaAccount} didaAddedTaskKeys={didaAddedTaskKeys} sendingTaskKey={sendingTaskKey} onSendToDida={sendToDida} />}</section>
        <aside className={`${styles.todaySidebar} min-w-0`}><ClassTimeline sessions={todaySessions} selectedDate={selectedDate} mode={state.settings.mode} name={state.timetable?.name} initialNow={now} />
          <div className="mt-5 rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5"><h2 className="font-semibold">StudyGuide 提醒</h2><div className="mt-3 space-y-3 text-sm leading-6 text-[var(--muted-foreground)]"><p><span className="mr-2 font-semibold text-[var(--brand)]">每日</span>先必交作业与固定限时新题，再处理相关红/黄 Cue/PQ；每条 Cue 独立记录 √ / △ / ○。</p><p><span className="mr-2 font-semibold text-teal-600">Friday</span>检查 Notes → 对照资料补缺口 → 补 Cue。</p><p><span className="mr-2 font-semibold text-amber-600">Weekend</span>固定新题训练 → 首次 ✓ / △ / ○ → 最高影响卡点修复 → 换新题复测。</p></div><Link href="/study-guide?tab=learn&subTab=review" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[var(--brand)]">打开完整方法<span aria-hidden="true" className="material-icons-round text-base">arrow_forward</span></Link></div>
          {personalIeltsPlan && <div className="mt-5 rounded-3xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-5 dark:border-blue-900 dark:from-blue-950/40 dark:to-indigo-950/30"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.12em] text-blue-700 dark:text-blue-200">Private · Admin · IELTS Plan v6</p><h2 className="mt-1 font-semibold">IELTS 备考计划 v6</h2></div><span aria-hidden="true" className="material-icons-round text-blue-600">lock</span></div><p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">五个模块不固定星期；当前阶段和模考日期以管理员 StudyGuide 中的完整计划为准。</p><p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">日程页只负责给学习留出时间；五模块状态、顺延和证据统一在 IELTS 工作台管理。</p><div className="mt-4 flex flex-wrap gap-2"><Link href="/ielts" className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white">打开五模块工作台</Link><Link href="/study-guide?tab=ielts&subTab=overview" className="rounded-full border border-blue-300 px-4 py-2 text-sm font-semibold text-blue-800 dark:border-blue-800 dark:text-blue-200">查看完整计划</Link></div></div>}
        </aside>
      </div>}
      {(view === 'today' || view === 'week') && <div className="mt-5"><SeiueScheduleSync selectedDate={selectedDate} onReviewTasks={updateSeiueReviewTasks} /></div>}
      {view === 'settings' && <section className="mt-5 rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--muted-foreground)]">Cue collection maintenance</p><h2 className="mt-1 text-xl font-semibold">整批 Cue 更新提醒</h2><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">用于“把一科全部 Cue 和笔记交给 AI 再统一导回”的维护流程。单次实际新增或修改至少 5 条时自动记录；也可在导入时手动标记，之后到期只生成一张合并提醒。</p></div><span aria-hidden="true" className="material-icons-round text-3xl text-amber-500">update</span></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--card-border)] p-4"><span><strong className="text-sm">启用整批更新提醒</strong><small className="mt-1 block text-[var(--muted-foreground)]">关闭后保留历史，但不生成 Schedule 提醒。</small></span><input type="checkbox" checked={state.settings.cueCollectionReminderEnabled} onChange={(event) => setState((current) => ({ ...current, settings: { ...current.settings, cueCollectionReminderEnabled: event.target.checked } }))} className="h-5 w-5 accent-[var(--brand)]" /></label><div className="rounded-2xl border border-[var(--card-border)] p-4 text-sm font-medium"><label htmlFor="cue-reminder-range">每次整批更新后 · {state.settings.cueCollectionReminderDays} 天提醒</label><input id="cue-reminder-range" type="range" min={1} max={365} step={1} value={state.settings.cueCollectionReminderDays} onChange={(event) => setState((current) => ({ ...current, settings: { ...current.settings, cueCollectionReminderDays: Number(event.target.value) } }))} className="mt-3 w-full accent-[var(--brand)]" /><div className="mt-2 flex items-center justify-between gap-3 text-xs text-[var(--muted-foreground)]"><span>1 天</span><label className="flex items-center gap-2">精确天数<input type="number" min={1} max={365} value={state.settings.cueCollectionReminderDays} onChange={(event) => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 1 && value <= 365) setState((current) => ({ ...current, settings: { ...current.settings, cueCollectionReminderDays: value } })); }} className="w-20 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)]" /></label><span>365 天</span></div></div></div><div className="mt-5 space-y-2">{state.learningCatalog.map((subject) => { const update = state.cueCollectionUpdates.filter((item) => (item.subjectId === subject.id || item.subjectName === subject.name) && isRecordedCueCollectionBatch(item)).toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]; const cueCount = state.cues.filter((cue) => cue.subjectId === subject.id || cue.subjectName === subject.name).length; if (!cueCount) return null; return <div key={subject.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-black/[.035] px-4 py-3 text-sm dark:bg-white/[.06]"><strong className="min-w-32 flex-1">{subject.name}</strong><span className="text-xs text-[var(--muted-foreground)]">{cueCount} 条 Cue</span><span className="text-xs text-[var(--muted-foreground)]">{update ? `上次 ${formatReviewTimestamp(update.updatedAt)} · 新增 ${update.createdCount} / 修改 ${update.modifiedCount} · 下次 ${nextCueCollectionReminderDate(update.updatedAt, state.settings.cueCollectionReminderDays)}` : '尚未记录整批更新'}</span></div>; })}</div></section>}

      {view === 'week' && <section className="mt-5 overflow-x-auto rounded-3xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--card-border)] p-5"><div><p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--muted-foreground)]">Week</p><h2 className="mt-1 text-xl font-semibold">{formatShortDate(week[0])} — {formatShortDate(week[6])}</h2></div><p className="text-sm text-[var(--muted-foreground)]">课程和学习任务会一起显示</p></div>{!state.timetable && !state.manualTasks.length && !state.cues.length && !seiueReviewTasks.length ? <div className="p-5"><EmptyState onImport={() => setImportDialog(true)} /></div> : <div data-week-agenda className={`${styles.weekAgenda} grid min-w-[980px] grid-cols-7 divide-x divide-[var(--card-border)] overflow-x-auto`}>{week.map((day, index) => { const daySessions = state.settings.mode === 'term' ? sessionsForDate(state.timetable, day) : []; const key = dateKey(day); const dayTasks = [...tasksForDate(state, day, questionReviewTasks(questionBank, day)), ...seiueReviewTasks.filter(task => task.date === key && !state.completions[task.key] && !state.cancellations[task.key])]; return <button key={key} type="button" onClick={() => { setSelectedDate(key); setView('today'); }} className={`min-h-[520px] p-3 text-left hover:bg-black/[.02] dark:hover:bg-white/[.03] ${key === todayKey ? 'bg-blue-50/70 dark:bg-blue-950/20' : ''}`}><div className="text-center"><p className={`text-xs font-semibold ${key === todayKey ? 'text-[var(--brand)]' : 'text-[var(--muted-foreground)]'}`}>周{WEEKDAY_LABELS[index]}</p><span className={`mt-1 inline-grid h-8 w-8 place-items-center rounded-full text-sm font-semibold ${key === todayKey ? 'bg-[var(--brand)] text-white dark:text-[#202124]' : ''}`}>{day.getDate()}</span></div><div className="mt-4 space-y-2">{daySessions.map((session, sessionIndex) => <div key={`${session.course.id}-${session.start}-${sessionIndex}`} className="rounded-xl border-l-4 bg-black/[.035] p-2.5 dark:bg-white/[.06]" style={{ borderLeftColor: session.course.color }}><p className="text-[11px] font-semibold">{session.start}–{session.end}</p><p className="mt-1 line-clamp-2 text-xs font-medium leading-5">{session.course.shortName ?? session.course.name}</p>{session.location && <p className="mt-1 truncate text-[10px] text-[var(--muted-foreground)]">{session.location}</p>}</div>)}{dayTasks.slice(0, 5).map((task) => <div key={task.key} className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-2.5"><span className="text-[10px] font-semibold text-[var(--brand)]">{TYPE_META[task.type].label}</span><p className="mt-1 line-clamp-2 text-xs font-medium leading-5">{task.title}</p></div>)}{!daySessions.length && !dayTasks.length && <p className="pt-8 text-center text-xs text-[var(--muted-foreground)]">{state.settings.mode === 'holiday' ? '假日模式' : '无安排'}</p>}{dayTasks.length > 5 && <p className="text-center text-[10px] text-[var(--muted-foreground)]">另有 {dayTasks.length - 5} 项</p>}</div></button>; })}</div>}</section>}

      {view === 'records' && <StudyInsights state={state} bank={questionBank} signedIn={signedIn} onChange={setState} />}
      <LearningAssistant state={state} signedIn={signedIn} visible={view === 'records'} onChange={setState} />
      {view === 'cue' && ready && <CueEntryPreview key={entryParams} state={state} bank={questionBank} onStart={(items, subject, unit) => startUnifiedStudy(items.some(item => item.kind === 'question') ? items.some(item => item.kind === 'cue') ? 'mixed' : 'question' : 'cue', subject, unit, items)} onResumeCue={(draft) => setCueStudyTask(draft.task)} onResumeMixed={resumeUnifiedStudy} onSchedule={scheduleCueBudget} />}
      {view === 'cue' && !questionBankError && <>
        <button data-cue-shop-open type="button" onClick={() => setStandaloneShopOpen(true)} className="mt-4 min-h-11 rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white">✦ CUE 星空商店</button>
        {universeEnabled && <button type="button" onClick={() => setStarSummary('album')} className="mt-4 rounded-xl border border-[var(--card-border)] px-4 py-2 text-sm">✦ 我的星空收藏</button>}
        <div className="mt-4">      <CueStudyDashboard cues={state.cues} reviews={state.cueReviews} drafts={cueDrafts} onStart={startSpecialCueStudy} onResume={(draft) => setCueStudyTask(draft.task)} onDiscard={async (draft) => { if (!(await siteConfirm(`确定放弃 ${draft.task.subjectName || '未分类'} 的这次 Cue 学习进度吗？`))) return; setState((current) => removeCueStudyDraft(current, draft)); setNotice('该学科未完成的 Cue 学习进度已放弃。'); }} /></div>
        <LearningWorkspace cues={state.cues} reviews={state.cueReviews} bank={{ ...questionBank, drafts: Object.fromEntries(Object.entries(questionBank.drafts).map(([id, draft]) => [id, reconcileStudyDraft(draft, state.cues, questionBank.questions)])) }} catalog={state.learningCatalog} onStart={startUnifiedStudy} onResume={resumeUnifiedStudy} onDiscard={(id) => { const drafts = { ...questionBank.drafts }; delete drafts[id]; commitQuestionBank({ ...questionBank, drafts }); }} onManage={() => setView('questions')} />
      </>}
      {view === 'questions' && !questionBankError && <QuestionBankManager bank={questionBank} catalog={state.learningCatalog} cues={state.cues} onChange={changeQuestionBank} onCatalog={() => setCatalogDialog(true)} />}
      {questionBankError && <p role="alert" className="mt-4 rounded-xl border border-rose-300 p-4 text-sm text-rose-600">{questionBankError}。请通过备份中心检查或恢复题库数据。</p>}


      {view === 'memos' && <CueMemoBoard cues={state.cues} memos={state.cueMemos} onChange={saveCueMemo} />}
      {view === 'records' && <div className="mt-5"><LearningRecordsView records={state.learningRecords} catalog={state.learningCatalog} reminders={state.settings.recordReminderEnabled ? state.learningReminders : []} defaultMode={state.settings.defaultRecordView} aiBusyId={aiReportBusyId} onGenerateAi={generateAiReport} /></div>}

      {view === 'settings' && <section className="mt-5 rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5"><h2 className="text-lg font-semibold">新手教程与功能介绍</h2><button className="mt-3 rounded-xl border border-[var(--card-border)] px-4 py-3 text-sm" onClick={() => setGuideOpen(true)}>重新打开教程</button></section>}
      {view === 'settings' && <div className="mt-5 grid gap-5 lg:grid-cols-2"><section className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6"><p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--muted-foreground)]">Mode</p><h2 className="mt-1 text-xl font-semibold">运行模式</h2><div className="mt-5 grid gap-3 sm:grid-cols-2"><button type="button" onClick={() => setState((current) => ({ ...current, settings: { ...current.settings, mode: 'term' } }))} aria-pressed={state.settings.mode === 'term'} className={`rounded-2xl border p-4 text-left ${state.settings.mode === 'term' ? 'border-[var(--brand)] bg-blue-50 dark:bg-blue-950/30' : 'border-[var(--card-border)]'}`}><span aria-hidden="true" className="material-icons-round text-[var(--brand)]">school</span><strong className="ml-2">学期模式</strong><p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">显示课程，并生成已选科目的每日复习和周末集中复习。</p></button><button type="button" onClick={() => setState((current) => ({ ...current, settings: { ...current.settings, mode: 'holiday' } }))} aria-pressed={state.settings.mode === 'holiday'} className={`rounded-2xl border p-4 text-left ${state.settings.mode === 'holiday' ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30' : 'border-[var(--card-border)]'}`}><span aria-hidden="true" className="material-icons-round text-amber-600">beach_access</span><strong className="ml-2">假日模式</strong><p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">暂停课程相关自动任务，保留到期复习、专项、考试和待办。</p></button></div><div className="mt-5 space-y-4 border-t border-[var(--card-border)] pt-5"><label className="flex items-center justify-between gap-4"><span><strong className="text-sm">可选预习提示（默认关闭）</strong><span className="mt-1 block text-xs text-[var(--muted-foreground)]">只有你主动开启时才会自动生成；也可在“添加任务”中单独添加预习。</span></span><input type="checkbox" checked={state.settings.previewEnabled} onChange={(event) => setState((current) => ({ ...current, settings: { ...current.settings, previewEnabled: event.target.checked, previewPreferenceSet: true } }))} className="h-5 w-5 accent-[var(--brand)]" /></label><label className="flex items-center justify-between gap-4"><span><strong className="text-sm">周末集中复习日</strong><span className="mt-1 block text-xs text-[var(--muted-foreground)]">每周只生成一次集中复习。</span></span><select value={state.settings.weekendReviewDay} onChange={(event) => setState((current) => ({ ...current, settings: { ...current.settings, weekendReviewDay: Number(event.target.value) as 6 | 7 } }))} className="rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm"><option value={6}>周六</option><option value={7}>周日</option></select></label></div></section>
        <section className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6"><p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--muted-foreground)]">Timetable</p><div className="flex items-start justify-between gap-3"><div><h2 className="mt-1 text-xl font-semibold">课表、同步与隐私</h2><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">数据优先保存在浏览器；登录后，课表、复习状态、内容、问题、备注和下次复习日期会同步到你的账号。每位用户只能读取自己的数据。</p></div><span aria-hidden="true" className="material-icons-round text-emerald-600">lock</span></div><div className="mt-5 rounded-2xl bg-black/[.035] p-4 dark:bg-white/[.06]"><p className="font-semibold">{state.timetable?.name ?? '尚未导入课表'}</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">{state.timetable ? `${state.timetable.courses.length} 门课程 · ${state.timetable.courses.reduce((total, course) => total + course.sessions.length, 0)} 个时段` : '导入后可单独选择哪些科目需要课程复习。'}</p></div><div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={() => setImportDialog(true)} className="rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white dark:text-[#202124]">导入或更新</button><Link href="/timetable-hub" className="rounded-full border border-[var(--card-border)] px-4 py-2 text-sm font-medium">高级排程编辑器</Link><Link href="/control/focus" className="rounded-full border border-[var(--card-border)] px-4 py-2 text-sm font-medium">旧版专注执行</Link></div>{state.timetable && <div className="mt-5 border-t border-[var(--card-border)] pt-5"><p className="text-sm font-semibold">生成每日复习的科目</p><div className="mt-3 space-y-2">{state.timetable.courses.map((course) => <label key={course.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-black/[.025] dark:hover:bg-white/[.04]"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: course.color }} /><span className="min-w-0 flex-1 truncate text-sm">{course.name}</span><input type="checkbox" checked={course.review} onChange={(event) => setState((current) => current.timetable ? { ...current, timetable: { ...current.timetable, courses: current.timetable.courses.map((item) => item.id === course.id ? { ...item, review: event.target.checked } : item) } } : current)} className="h-5 w-5 accent-[var(--brand)]" /></label>)}</div></div>}</section>
        <section className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6"><p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--muted-foreground)]">Learning taxonomy</p><h2 className="mt-1 text-xl font-semibold">学科、大单元与资料位置</h2><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">统一配置学科 → 大单元，不再要求填写小章节。可随时手动增删改，也可导出当前 JSON 后一次批量修改；资料位置是自由文本，例如 Textbook 1.2、Notebook P18。</p><button type="button" onClick={() => setCatalogDialog(true)} className="mt-4 rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white dark:text-[#202124]">手动编辑 / AI 批量修改 / JSON 导入</button><div className="mt-4 space-y-3">{state.learningCatalog.map((subject) => <div key={subject.id} className="rounded-2xl bg-black/[.035] p-4 dark:bg-white/[.06]"><div className="flex justify-between gap-3"><strong>{subject.name}</strong><span className="text-xs text-[var(--muted-foreground)]">{subject.units.length} 个大单元</span></div><div className="mt-2 flex flex-wrap gap-1.5">{Object.entries(subject.materialProgress).map(([code, progress]) => <span key={code} className="rounded-full bg-[var(--card)] px-2.5 py-1 text-xs"><strong>{code}</strong> · {progress}</span>)}{!Object.keys(subject.materialProgress).length && <span className="text-xs text-[var(--muted-foreground)]">暂无资料位置</span>}</div></div>)}</div></section>
        <section className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6"><p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--muted-foreground)]">Post-class review</p><h2 className="mt-1 text-xl font-semibold">课后复习单与滴答清单</h2><label className="mt-5 flex items-center justify-between gap-4"><span><strong className="text-sm">自动生成每日学习任务</strong><small className="mt-1 block text-[var(--muted-foreground)]">关闭后保留手动任务与同步清单，不再自动安排每日、间隔、周末复习或预习；学习记录与到期 CUE 仍保留。</small></span><input aria-label="自动生成每日学习任务" type="checkbox" checked={state.settings.automaticTasksEnabled !== false} onChange={event => setState(current => ({ ...current, settings: { ...current.settings, automaticTasksEnabled: event.target.checked } }))} className="h-5 w-5 accent-[var(--brand)]" /></label><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">课表中勾选的科目，每次上课后生成“补全并上传笔记 → 生成或修订 Cue → 复习 Cue”三步复习单；到期 Cue、黄红 Cue 和今日新增 Cue 会合并进 Cue 复习。</p><div className="mt-5 space-y-4"><label className="flex items-center justify-between gap-4"><span><strong className="text-sm">生成课后复习单</strong><small className="mt-1 block text-[var(--muted-foreground)]">关闭后不再按课表生成三步复习单；独立的到期 Cue 复习仍保留。</small></span><input type="checkbox" checked={state.settings.postClassTasksEnabled} onChange={(event) => setState((current) => ({ ...current, settings: { ...current.settings, postClassTasksEnabled: event.target.checked } }))} className="h-5 w-5 accent-[var(--brand)]" /></label><label className="flex items-center justify-between gap-4"><span><strong className="text-sm">自动同步复习单到滴答清单</strong><small className="mt-1 block text-[var(--muted-foreground)]">同步课后复习单和三步清单；Cue 判定与更新记录仍在 JackYun 内完成。</small></span><input type="checkbox" disabled={!selectedDidaAccount || !state.settings.postClassTasksEnabled} checked={state.settings.didaAutoSyncPostClass} onChange={(event) => setState((current) => ({ ...current, settings: { ...current.settings, didaAutoSyncPostClass: event.target.checked } }))} className="h-5 w-5 accent-[var(--brand)] disabled:opacity-40" /></label></div>{selectedDidaAccount ? <p className="mt-4 rounded-2xl bg-emerald-50 p-3 text-xs leading-5 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">当前同步到：{selectedDidaAccount.displayName}。相同课程复习单会更新，不会重复创建。</p> : <Link href="/settings?section=connections" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[var(--brand)]">先关联滴答清单<span aria-hidden="true" className="material-icons-round text-base">arrow_forward</span></Link>}</section>
        <section className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6"><p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--muted-foreground)]">Records & reminders</p><h2 className="mt-1 text-xl font-semibold">记录、Cue 与提醒偏好</h2><Link href="/settings?section=learning" className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--brand)]">CUE 宇宙冒险与默认乱序设置<span aria-hidden="true" className="material-icons-round text-base">arrow_forward</span></Link><div className="mt-5 space-y-4"><label className="flex items-center justify-between gap-3 text-sm"><span><strong>默认学习记录视图</strong><small className="mt-1 block text-[var(--muted-foreground)]">打开学习记录时优先显示的方式</small></span><select value={state.settings.defaultRecordView} onChange={(event) => setState((current) => ({ ...current, settings: { ...current.settings, defaultRecordView: event.target.value as 'calendar' | 'subjects' } }))} className="rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2"><option value="calendar">日历记录</option><option value="subjects">各科记录</option></select></label><label className="flex items-center justify-between gap-3 text-sm"><span><strong>显示已稳定 Cue</strong><small className="mt-1 block text-[var(--muted-foreground)]">关闭后 Cue 工作台只聚焦未验证、△和○</small></span><input type="checkbox" checked={state.settings.cueShowMastered} onChange={(event) => setState((current) => ({ ...current, settings: { ...current.settings, cueShowMastered: event.target.checked } }))} className="h-5 w-5 accent-[var(--brand)]" /></label><label className="flex items-center justify-between gap-3 text-sm"><span><strong>学习记录提醒</strong><small className="mt-1 block text-[var(--muted-foreground)]">在记录页显示到期提醒</small></span><input type="checkbox" checked={state.settings.recordReminderEnabled} onChange={(event) => setState((current) => ({ ...current, settings: { ...current.settings, recordReminderEnabled: event.target.checked } }))} className="h-5 w-5 accent-[var(--brand)]" /></label><label className="flex items-center justify-between gap-3 text-sm"><span><strong>默认提醒时间</strong></span><input type="time" value={state.settings.recordReminderTime} onChange={(event) => setState((current) => ({ ...current, settings: { ...current.settings, recordReminderTime: event.target.value } }))} className="rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2" /></label></div><div className="mt-5 border-t border-[var(--card-border)] pt-5"><h3 className="text-sm font-semibold">新增提醒</h3><div className="mt-3 grid gap-2 sm:grid-cols-3"><input value={reminderTitle} onChange={(event) => setReminderTitle(event.target.value)} placeholder="例如：复查 Mechanics Cue" className="rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm" /><input type="date" value={reminderDate} onChange={(event) => setReminderDate(event.target.value)} className="rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm" /><select value={reminderSubjectId} onChange={(event) => setReminderSubjectId(event.target.value)} className="rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm"><option value="">不限定科目</option>{state.learningCatalog.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></div><button type="button" disabled={!reminderTitle.trim() || !reminderDate} onClick={() => { setState((current) => ({ ...current, learningReminders: [...current.learningReminders, { id: taskId(), title: reminderTitle.trim().slice(0, 160), date: reminderDate, ...(reminderSubjectId ? { subjectId: reminderSubjectId } : {}), completed: false }] })); setReminderTitle(''); setReminderDate(''); setReminderSubjectId(''); }} className="mt-3 rounded-full border border-[var(--card-border)] px-4 py-2 text-sm font-semibold disabled:opacity-40">添加提醒</button><div className="mt-3 space-y-2">{state.learningReminders.map((reminder) => <div key={reminder.id} className="flex items-center gap-2 rounded-xl bg-black/[.035] px-3 py-2 text-sm dark:bg-white/[.06]"><input type="checkbox" checked={reminder.completed} onChange={(event) => setState((current) => ({ ...current, learningReminders: current.learningReminders.map((item) => item.id === reminder.id ? { ...item, completed: event.target.checked } : item) }))} className="h-4 w-4 accent-[var(--brand)]" /><span className={`min-w-0 flex-1 ${reminder.completed ? 'line-through opacity-60' : ''}`}>{reminder.title}</span><span className="text-xs text-[var(--muted-foreground)]">{reminder.date} · {state.settings.recordReminderTime}</span><button type="button" onClick={() => setState((current) => ({ ...current, learningReminders: current.learningReminders.filter((item) => item.id !== reminder.id) }))} className="text-[var(--muted-foreground)] hover:text-rose-600"><span aria-hidden="true" className="material-icons-round text-lg">delete</span></button></div>)}</div></div></section>
      </div>}

      {studyPreviewTask && <StudyTaskPreview task={studyPreviewTask} cues={state.cues} bank={questionBank} onClose={() => setStudyPreviewTask(null)} onStart={async (items) => (await startUnifiedStudy(items.some((item) => item.kind === 'cue') && items.some((item) => item.kind === 'question') ? 'mixed' : items.some((item) => item.kind === 'question') ? 'question' : 'cue', studyPreviewTask.subjectId ?? '', studyPreviewTask.scope?.unit ?? '', items, studyPreviewTask))} />}
      {standaloneShopOpen && <StandaloneCueShop account={gameAccount} onAction={shopAction} animations={universeEnabled} onClose={() => { setStandaloneShopOpen(false); document.querySelector<HTMLButtonElement>('[data-cue-shop-open]')?.focus(); }} />}
      {starSummary && universeEnabled && !cueStudyTask && !activeStudyDraft && <CueGamePanel account={gameAccount} onShopAction={shopAction} key={starSummary} initialAlbumOpen={starSummary === 'album'} summary reviews={state.cueReviews} cues={state.cues} records={state.learningRecords} onDismiss={() => setStarSummary(null)} />}
      {activeStudyDraft && <LearningSession gameAccount={gameAccount} onShopAction={shopAction} starRecords={state.learningRecords} reviews={state.cueReviews} draft={activeStudyDraft} onDifficulty={changeCueDifficulty} cues={state.cues} bank={questionBank} onDraft={(draft) => commitQuestionBank({ ...questionBank, drafts: { ...questionBank.drafts, [draft.id]: draft } })} onRate={rateStudyItem} onMemo={saveCueMemo} memos={state.cueMemos} onClose={() => { setActiveStudyId(null); if (universeEnabled && activeStudyDraft.items.some((item) => item.kind === 'cue' && activeStudyDraft.assessments[itemKey(item)])) setStarSummary('summary'); }} onComplete={finishUnifiedStudy} />}
      {learningResult && <LearningCompletion result={learningResult} onClose={() => setLearningResult(null)} />}
      {cueStudyTask && activeCueDraft && <CueStudyPage gameAccount={gameAccount} onShopAction={shopAction} starCues={state.cues} starRecords={state.learningRecords} reviews={state.cueReviews} task={cueStudyTask} onDifficulty={changeCueDifficulty} cues={cueStudyCues} draft={activeCueDraft} memos={state.cueMemos} onProgress={saveCueStudyProgress} onMastered={(cueId) => setState(current => markCueMastered(current, cueId, new Date(), cueStudyTask.key))} onAssessment={(cueId, status, practice, editPractice) => saveCueStudyAssessment(cueStudyTask, cueId, status, practice, editPractice)} answerCards={state.cueAnswerCards} onAnswerText={(cueId, text) => setState((current) => ({ ...current, cueAnswerCards: editCueAnswerCard(current.cueAnswerCards, activeCueDraft.id, cueId, text, new Date().toISOString()) }))} onAnswerCompare={(cue) => setState((current) => ({ ...current, cueAnswerCards: compareCueAnswerCard(current.cueAnswerCards, activeCueDraft.id, cue, new Date().toISOString()) }))} onAnswerCheck={(id, index, checked) => setState((current) => ({ ...current, cueAnswerCards: checkCueAnswerPoint(current.cueAnswerCards, id, index, checked, new Date().toISOString()) }))} onClose={() => { setCueStudyTask(null); if (universeEnabled && Object.keys(activeCueDraft.assessments).length) setStarSummary('summary'); setNotice('Cue 状态、学习进度和答题卡均已保存，可随时恢复。'); }} onComplete={async (details, evidence) => (await submitReview(cueStudyTask, details, evidence))} />}
      {reviewTask && <ReviewDialog task={reviewTask} cues={reviewCues} catalog={state.learningCatalog} signedIn={signedIn} onClose={() => setReviewTask(null)} onComplete={async (details, evidence) => (await submitReview(reviewTask, details, evidence))} />}
      {taskDialog && <TaskDialog date={selectedDate} cues={state.cues} catalog={[...state.learningCatalog, ...(state.timetable?.courses ?? []).filter((course) => !matchLearningCatalogSubject(state.learningCatalog, course.name)).map((course) => ({ id: course.id, name: course.name, units: [], materialProgress: {} }))]} onClose={() => setTaskDialog(false)} onSave={(tasks) => { setState((current) => ({ ...current, manualTasks: [...current.manualTasks, ...tasks] })); setTaskDialog(false); setNotice(`已添加 ${tasks.length} 项任务。`); }} />}
      {cueManager && <CueManagerDialog cues={state.cues} reviews={state.cueReviews} catalog={state.learningCatalog} collectionUpdates={state.cueCollectionUpdates} changeHistory={state.cueChangeHistory} similarityDecisions={state.cueSimilarityDecisions} onSimilarityDecisionsChange={(update) => setState((current) => ({ ...current, cueSimilarityDecisions: update(current.cueSimilarityDecisions ?? []) }))} reminderDays={state.settings.cueCollectionReminderDays} initialSubjectName={cueManagerSubject} showMastered={state.settings.cueShowMastered} onClose={() => setCueManager(false)} onChange={(cues, learningCatalog, batchUpdate, source = 'manual') => setState((current) => { const change = createCueChangeRecord(current.cues, cues, source, new Date().toISOString(), taskId()); const cueIds = new Set(cues.map((cue) => cue.id)); return recalculateLegacyCueSchedules({ ...current, cueScheduleRevision: 0, cues, cueChangeHistory: [...(current.cueChangeHistory ?? []), ...(change ? [change] : [])], cueMemos: current.cueMemos.filter((memo) => cueIds.has(memo.cueId)), cueSimilarityDecisions: (current.cueSimilarityDecisions ?? []).filter((decision) => cueIds.has(decision.leftCueId) && cueIds.has(decision.rightCueId)), ...(learningCatalog ? { learningCatalog } : {}), ...(batchUpdate ? { cueCollectionUpdates: [...current.cueCollectionUpdates, batchUpdate].slice(-100) } : {}) }); })} />}
      {importDialog && <ImportDialog currentTimetable={state.timetable} onClose={() => setImportDialog(false)} onApply={(timetable) => { setState((current) => reconcileScheduleSubjects({ ...current, timetable, importedAt: new Date().toISOString() })); setImportDialog(false); setNotice(signedIn ? '课表已导入；已保留你的手动复习科目设置，正在同步到账号。' : '课表已导入；已保留你的手动复习科目设置。'); }} />}
      {catalogDialog && <LearningCatalogDialog current={state.learningCatalog} onClose={() => setCatalogDialog(false)} onApply={async (subjects) => { if (!(await siteConfirm('保存新的学科分类配置吗？系统会按关键词合并课表科目引用；现有学习记录和 Cue 不会删除。'))) return; commitQuestionBank(reconcileQuestionSubjects(questionBank, subjects)); setState((current) => reconcileScheduleSubjects({ ...current, learningCatalog: subjects })); setCatalogDialog(false); setNotice('学科分类已保存；课表科目、复习进度和记录已自动归并。'); }} />}
      {guideOpen && <ScheduleGuide onNavigate={setView} onClose={() => { setGuideOpen(false); setState((current) => ({ ...current, settings: { ...current.settings, tutorialSeenVersion: 1 } })); }} />}
      <Notice message={notice} />
    </div>
  );
}
