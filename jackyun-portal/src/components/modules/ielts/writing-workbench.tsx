'use client';

import { siteConfirm } from '@/lib/site-dialog';
import Link from 'next/link';
import { ArchiveTitleEditor } from './archive-title-editor';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { parseLocalValue, persistLocalEditNow } from '@/lib/sync/local-edit';
import {canonicalJson} from '@/lib/sync/hash';
import {threeWayMerge} from '@/lib/sync/merge';
import {
  buildWritingFeedbackRepairPrompt, buildWritingReviewPrompt, coerceWritingStage, countWords, createWritingArchiveEntry, diffWriting, findQuotedTextRange, highlightWritingRanges, trackWritingQuotes, isWritingArchiveEntry, parseWritingFeedback, readFirstValidJson, recurringRuleKeys, targetWords, taskLabel, updateErrorHistory, upsertWritingArchive, writeRedundantJson, splitWritingParagraphs,
  type ErrorHistoryEntry, type ReviewMode, type WritingArchiveEntry, type WritingFeedback, type WritingGuidanceMode, type WritingStage, type WritingTask,
} from '@/lib/ielts-writing';

const DRAFT_KEY = 'jackyun_ielts_writing_draft_v1';
const MIRROR_KEY = 'jackyun_ielts_writing_draft_mirror_v1';
const SNAPSHOTS_KEY = 'jackyun_ielts_writing_snapshots_v1';
const HISTORY_KEY = 'jackyun_ielts_writing_error_history_v1';
const LANGUAGE_KEY = 'jackyun_ielts_writing_language';
const LAYOUT_KEY = 'jackyun_ielts_writing_layout';
const HIGHLIGHT_KEY = 'jackyun_ielts_writing_highlights';
const STAGE_KEY = 'jackyun_ielts_writing_stage_v1';
const GUIDANCE_KEY = 'jackyun_ielts_writing_guidance_v1';
const ARCHIVE_KEY = 'jackyun_ielts_writing_archive_v1';
const WORKSPACES_KEY = 'jackyun_ielts_writing_workspaces_v1';
const WORKSPACES_MIRROR_KEY = 'jackyun_ielts_writing_workspaces_mirror_v1';
const RESPONSE_FORMAT_KEY = 'jackyun_ielts_writing_response_format_v1';
type UiLanguage = 'en' | 'zh';
type SaveState = 'saved' | 'error';
type WorkspaceLayout = 'split' | 'stacked';
type WritingView = 'workbench' | 'library' | 'reader';
type ReaderTheme = 'paper' | 'mint' | 'night';

interface DraftState { essayId: string; task: WritingTask; question: string; essay: string; originalEssay: string; secondsLeft: number; timerStarted: boolean; }
interface DraftSnapshot { savedAt: string; draft: DraftState; }
interface FeedbackHistoryEntry { source: { essayId: string; essay: string }; feedback: WritingFeedback | null; previousRuleKeys: string[]; resolved: string[]; stage: WritingStage; }
interface WritingWorkspace { id: string; draft: DraftState; feedback: WritingFeedback | null; feedbackSource: { essayId: string; essay: string }; feedbackHistory: FeedbackHistoryEntry[]; previousRuleKeys: string[]; resolved: string[]; stage: WritingStage; externalFallbackMode: ReviewMode | null; externalReply: string; externalPanelOpen: boolean; savedAt: string; markdownReport?: string; }
const defaultDraft: DraftState = { essayId: 'draft-current', task: 'task2', question: '', essay: '', originalEssay: '', secondsLeft: 2400, timerStarted: false };

const COPY = {
  en: {
    title: 'Writing Correction Studio', newEssay: 'New essay', newEssayStarted: 'New essay ready. Your previous revision stays in progress.', inProgress: 'In progress', continueRevision: 'Continue revising', currentEssay: 'Current essay', subtitle: 'Keep the real first attempt. Let AI locate the problems, revise them yourself, then prove the improvement on a new question.',
    timer: 'exam timer', pause: 'Pause timer', start: 'Start timer', reset: 'Reset timer', language: '中文', taskGroup: 'Choose an IELTS Writing task', words: 'words',
    saved: 'Saved now · primary + mirror', saveError: 'Local save failed', question: 'Question', questionPlaceholder: 'Paste the IELTS Writing task here…', essay: 'Your essay', originalLink: 'View original', essayPlaceholder: 'Write your real first attempt independently. Do not ask AI for a model answer first…',
    layout: 'Workspace layout', split: 'Side by side', stacked: 'Top and bottom',
    highlights: 'Editor highlights', highlightsOn: 'Editor highlights on', highlightsOff: 'Editor highlights off', highlightedDraft: 'Quoted issues in your current draft', noQuotedIssues: 'No quoted issue can be matched to the current draft.', locateIssue: 'Show this issue in the editor',
    originalEyebrow: 'Original attempt', originalTitle: 'Locked evidence of your starting point', loop: 'Correction loop', round: 'What to do this round', stageHint: 'Choose any step. Your choice is saved for the next visit.', stages: ['Original', 'Self-revise', 'Upgrade', 'Transfer'],
    diagnose: 'Find my key issues', recheck: 'Check my revision', analysing: 'Analysing…', upgrading: 'Upgrading…', upgrade: 'Language Upgrade', back: 'Previous step', priority: 'Fix first', undo: 'Undo', resolved: 'Mark revised', think: 'Revise it yourself:', corrected: 'Correct version:', upgrades: 'Language upgrades', guidance: 'AI response', hintMode: 'Hints', correctionMode: 'Correct answers',
    emptyTitle: 'Use an external AI for feedback', emptyBody: 'The site does not send your essay to its built-in AI. Copy the prepared prompt to ChatGPT, Claude, Gemini, or another model, then import its reply. Your first attempt is locked when analysis begins.',
    transfer: 'Transfer test', transferTitle: 'The next essay proves mastery', recurring: 'Seen in at least two independent essays:', recurringEmpty: 'An issue in one essay is not automatically a recurring error. It is promoted only after appearing in two independent new essays.', transferButton: 'Start a new transfer essay',
    revision: 'Revision map', revisionTitle: 'What changed since the first attempt', added: 'added', removed: 'removed', noRevision: 'Make a revision to see additions and deletions highlighted here.', currentOnly: 'Run the first analysis to lock an original version for comparison.',
    external: 'External LLM', externalTitle: 'Use ChatGPT, Claude, Gemini, or another model', externalBody: 'Copy a complete prompt containing the task, original attempt, current draft, method, and exact response contract. Paste the model reply back here.', responseFormat: 'Response format', reviewMode: 'Review mode', json: 'Structured JSON · importable', markdown: 'Markdown · readable', modes: ['Diagnose', 'Recheck', 'Upgrade'], copyPrompt: 'Copy complete prompt', copied: 'Prompt copied', promptPreview: 'Preview full prompt', pasteReply: 'Paste the external AI reply here…', importReply: 'Import AI reply', imported: 'External feedback imported.', markdownImported: 'Markdown report saved below.', invalidReply: 'The reply does not match the requested format.', report: 'Imported Markdown report',
    fallbackTitle: 'External AI is ready', fallbackBody: 'The prepared prompt has been copied automatically. Send it to an external model, then paste its JSON reply below.',
    safety: 'Draft safety', safetyTitle: 'Three-layer local protection', safetyBody: 'Every edit is written immediately to the primary draft and a mirror copy. Rolling recovery snapshots add another layer.', restore: 'Restore snapshot', export: 'Download backup', noSnapshot: 'No recovery snapshot yet.', restored: 'Latest recovery snapshot restored.',
    tooShort: 'Write at least 80 characters of a real first attempt before asking AI to analyse it.', reviseFirst: 'Revise the essay yourself before requesting another check.', upgradeDone: 'Language upgrades are ready. Keep only expressions that are natural and preserve your meaning.', feedbackDone: 'Feedback is ready. Revise it yourself, then ask AI to check again.', failed: 'AI analysis failed. Please try again.', transferStarted: 'New transfer essay started. Write independently and see whether the old errors decrease.', settings: 'Open settings',
  },
  zh: {
    title: '雅思写作修复工作台', newEssay: '新建文章', newEssayStarted: '新文章已就绪，上一篇修订仍保留在进行中。', inProgress: '进行中的修订', continueRevision: '继续修订', currentEssay: '当前文章', subtitle: '保留真实原稿，让 AI 定位问题；你自己修改，再用一道新题证明这次进步能够迁移。',
    timer: '考试计时', pause: '暂停计时', start: '开始计时', reset: '重置计时', language: 'EN', taskGroup: '选择雅思写作题型', words: '词',
    saved: '刚刚保存 · 主草稿 + 镜像', saveError: '本地保存失败', question: '题目', questionPlaceholder: '粘贴雅思写作题目…', essay: '你的作文', originalLink: '查看原稿', essayPlaceholder: '先独立完成真实写作，不要让 AI 预先生成范文…',
    layout: '工作台布局', split: '左右分栏', stacked: '上下排列',
    highlights: '编辑框高亮', highlightsOn: '编辑框高亮已开启', highlightsOff: '编辑框高亮已关闭', highlightedDraft: '当前稿中被引用的问题', noQuotedIssues: '当前反馈的引用无法在作文中精确匹配。', locateIssue: '在编辑框中定位这个问题',
    originalEyebrow: '真实原稿', originalTitle: '不可覆盖的起点证据', loop: '修复循环', round: '本轮怎么做', stageHint: '可以自由选择任意阶段，刷新后仍会保留。', stages: ['原稿', '自己修改', '语言升级', '新文迁移'],
    diagnose: '让 AI 找关键问题', recheck: '检查我的修改', analysing: '分析中…', upgrading: '升级中…', upgrade: '语言升级', back: '返回上一步', priority: '本轮优先', undo: '撤销', resolved: '标记已改', think: '请自己修改：', corrected: '正确改法：', upgrades: '表达升级', guidance: 'AI 回复方式', hintMode: '只给提示', correctionMode: '给出正确项',
    emptyTitle: '使用外部 AI 获取反馈', emptyBody: '网站不会把作文发给站内 AI。复制准备好的提示词到 ChatGPT、Claude、Gemini 或其他模型，再导入回复。首次分析时会锁定你的真实原稿。',
    transfer: '迁移验证', transferTitle: '下一篇才是掌握证明', recurring: '已在至少两篇独立作文出现：', recurringEmpty: '本篇错误不会自动算作反复错误。同类问题至少在两篇独立新作文再次出现才会升级。', transferButton: '开始新题迁移',
    revision: '修订地图', revisionTitle: '原稿到当前稿改了什么', added: '新增', removed: '删除', noRevision: '修改作文后，这里会高亮显示新增与删除的内容。', currentOnly: '首次分析会锁定原稿，之后即可进行版本对比。',
    external: '外部 LLM', externalTitle: '使用 ChatGPT、Claude、Gemini 或其他模型', externalBody: '复制包含题目、原稿、当前稿、方法与精确回复规范的完整提示词，再把外部模型的回复粘贴回来。', responseFormat: '回复格式', reviewMode: '检查模式', json: '结构化 JSON · 可导入', markdown: 'Markdown · 易阅读', modes: ['问题诊断', '修改复查', '语言升级'], copyPrompt: '复制完整提示词', copied: '提示词已复制', promptPreview: '查看完整提示词', pasteReply: '把外部 AI 的回复粘贴到这里…', importReply: '导入 AI 回复', imported: '外部反馈已导入。', markdownImported: 'Markdown 报告已保存在下方。', invalidReply: '回复不符合指定格式。', report: '已导入的 Markdown 报告',
    fallbackTitle: '外部 AI 已准备就绪', fallbackBody: '当前步骤对应的提示词已自动复制。发送给外部模型后，把它返回的 JSON 粘贴到下方。',
    safety: '草稿安全', safetyTitle: '三层本地保护', safetyBody: '每次输入都会立即写入主草稿和镜像副本，并定期保留轮换恢复快照。', restore: '恢复快照', export: '下载备份', noSnapshot: '还没有可恢复的快照。', restored: '已恢复最新快照。',
    tooShort: '请先输入至少 80 个字符的真实原稿，再让 AI 分析。', reviseFirst: '先根据反馈自己修改作文，再进行复查。', upgradeDone: '语言升级建议已生成，只选择自然且不改变原意的表达。', feedbackDone: '反馈已生成。请先自己修改，再让 AI 复查。', failed: 'AI 分析失败，请稍后重试。', transferStarted: '已开始一篇新作文。独立完成后，检查旧错误是否真正减少。', settings: '打开设置',
  },
} as const;

function formatTime(seconds: number) { return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
function newEssayId() { return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `essay-${Date.now()}`; }
function validDraft(value: unknown): value is DraftState {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<DraftState>;
  return typeof draft.essayId === 'string' && typeof draft.essay === 'string' && typeof draft.question === 'string' && typeof draft.originalEssay === 'string' && ['task1-academic', 'task1-general', 'task2'].includes(draft.task ?? '') && typeof draft.secondsLeft === 'number' && typeof draft.timerStarted === 'boolean';
}
function readStoredDraft(): DraftState | null {
  return readFirstValidJson(localStorage, [DRAFT_KEY, MIRROR_KEY], validDraft);
}
function validFeedback(value: unknown): value is WritingFeedback {
  if (!value || typeof value !== 'object') return false;
  const feedback = value as Partial<WritingFeedback>;
  return typeof feedback.bandEstimate === 'string' && typeof feedback.summary === 'string' &&
    Array.isArray(feedback.priorities) && feedback.priorities.every((item) => typeof item === 'string') &&
    Array.isArray(feedback.issues) && feedback.issues.every((item) => item && typeof item.id === 'string' && typeof item.quote === 'string' && typeof item.explanation === 'string' && typeof item.ruleKey === 'string') &&
    Array.isArray(feedback.upgrades) && feedback.upgrades.every((item) => item && typeof item.original === 'string' && typeof item.suggestion === 'string' && typeof item.why === 'string') &&
    typeof feedback.readyForUpgrade === 'boolean';
}
function validWritingWorkspace(value: unknown): value is WritingWorkspace {
  if (!value || typeof value !== 'object') return false;
  const workspace = value as Partial<WritingWorkspace>;
  const source = workspace.feedbackSource as WritingWorkspace['feedbackSource'] | undefined;
  return typeof workspace.id === 'string' && validDraft(workspace.draft) && workspace.id === workspace.draft.essayId &&
    (workspace.feedback === null || validFeedback(workspace.feedback)) && Boolean(source && typeof source.essayId === 'string' && typeof source.essay === 'string') &&
    Array.isArray(workspace.feedbackHistory) && workspace.feedbackHistory.every((item) => item && typeof item.source?.essayId === 'string' && typeof item.source?.essay === 'string' && (item.feedback === null || validFeedback(item.feedback)) && Array.isArray(item.previousRuleKeys) && Array.isArray(item.resolved) && coerceWritingStage(String(item.stage)) !== null) &&
    Array.isArray(workspace.previousRuleKeys) && workspace.previousRuleKeys.every((item) => typeof item === 'string') &&
    Array.isArray(workspace.resolved) && workspace.resolved.every((item) => typeof item === 'string') &&
    coerceWritingStage(String(workspace.stage)) !== null && (workspace.externalFallbackMode === null || ['diagnose', 'recheck', 'upgrade'].includes(workspace.externalFallbackMode ?? '')) &&
    typeof workspace.externalReply === 'string' && typeof workspace.externalPanelOpen === 'boolean' && typeof workspace.savedAt === 'string' && (workspace.markdownReport === undefined || typeof workspace.markdownReport === 'string');
}
function workspaceHasWork(workspace: WritingWorkspace) {
  return Boolean(workspace.draft.question.trim() || workspace.draft.essay.trim() || workspace.draft.originalEssay.trim() || workspace.feedback);
}
function matchesSavedFinal(workspace: WritingWorkspace, archive: WritingArchiveEntry[]) {
  return archive.some((entry) => entry.essayId === workspace.id && entry.task === workspace.draft.task && entry.question === workspace.draft.question.trim() && entry.content === workspace.draft.essay.trim());
}
function upsertWritingWorkspace(workspaces: WritingWorkspace[], entry: WritingWorkspace) {
  const remaining = workspaces.filter((workspace) => workspace.id !== entry.id);
  return workspaceHasWork(entry) ? [entry, ...remaining] : remaining;
}
function writingWorkspaceTitle(workspace: WritingWorkspace, index: number) {
  const { draft } = workspace;
  const text = draft.question.trim().split(/\r?\n/u)[0] || draft.essay.trim().split(/\r?\n/u)[0] || draft.originalEssay.trim().split(/\r?\n/u)[0];
  return text ? text.slice(0, 56) : `文章 ${index + 1}`;
}

export default function WritingWorkbench() {
  const [view, setView] = useState<WritingView>('workbench');
  const [focusMode, setFocusMode] = useState(false);
  const workspaceRef = useRef<HTMLElement>(null);
  const [draft, setDraft] = useState<DraftState>(defaultDraft);
  const [workspaces, setWorkspaces] = useState<WritingWorkspace[]>([]);
  const workspacesRef = useRef<WritingWorkspace[]>([]);
  const deferredEssay = useDeferredValue(draft.essay);
  const [hydrated, setHydrated] = useState(false);
  const [uiLanguage, setUiLanguage] = useState<UiLanguage>('en');
  const [workspaceLayout, setWorkspaceLayout] = useState<WorkspaceLayout>('split');
  const [highlightIssues, setHighlightIssues] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [feedback, setFeedback] = useState<WritingFeedback | null>(null);
  const [feedbackSource, setFeedbackSource] = useState({ essayId: '', essay: '' });
  const [feedbackHistory, setFeedbackHistory] = useState<FeedbackHistoryEntry[]>([]);
  const [stage, setStageState] = useState<WritingStage>(0);
  const [guidanceMode, setGuidanceMode] = useState<WritingGuidanceMode>('hint');
  const [previousRuleKeys, setPreviousRuleKeys] = useState<string[]>([]);
  const [history, setHistory] = useState<ErrorHistoryEntry[]>([]);
  const [resolved, setResolved] = useState<string[]>([]);
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);
  const [loadingMode] = useState<ReviewMode | null>(null);
  const [message, setMessage] = useState('');
  const [externalReply, setExternalReply] = useState('');
  const [externalPanelOpen, setExternalPanelOpen] = useState(true);
  const [promptCopied, setPromptCopied] = useState(false);
  const [repairPromptMode, setRepairPromptMode] = useState(false);
  const [responseFormat, setResponseFormat] = useState<'json' | 'markdown'>('json');
  const [markdownReport, setMarkdownReport] = useState('');
  const [cloudSyncReady, setCloudSyncReady] = useState(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'local' | 'syncing' | 'synced' | 'error'>('local');
  const [externalFallbackMode, setExternalFallbackMode] = useState<ReviewMode | null>(null);
  const [archive, setArchive] = useState<WritingArchiveEntry[]>([]);
  const [currentArchiveId, setCurrentArchiveId] = useState<string | null>(null);
  const [archiveQuery, setArchiveQuery] = useState('');
  const [readerFontSize, setReaderFontSize] = useState(19);
  const [readerLineHeight, setReaderLineHeight] = useState(1.9);
  const [readerTheme, setReaderTheme] = useState<ReaderTheme>('paper');
  const draftBase = useRef<unknown>(undefined);
  const historyBase = useRef<unknown>(undefined);
  const archiveBase = useRef<unknown>(undefined);
  const editCount = useRef(0);
  const originalRef = useRef<HTMLDivElement>(null);
  const essayRef = useRef<HTMLTextAreaElement>(null);
  const highlightLayerRef = useRef<HTMLDivElement>(null);
  const c = COPY[uiLanguage];

  function persistDraft(next: DraftState, keepSnapshot = false, reportState = true, failOnError = false) {
    let saved=next;
    try {
      const merged = persistLocalEditNow(localStorage,DRAFT_KEY,draftBase.current,next) as DraftState;
      saved=merged;draftBase.current=merged;
      writeRedundantJson(localStorage, DRAFT_KEY, MIRROR_KEY, merged);
      if (keepSnapshot) {
        const existing = JSON.parse(localStorage.getItem(SNAPSHOTS_KEY) || '[]') as DraftSnapshot[];
        const snapshots = [{ savedAt: new Date().toISOString(), draft: merged }, ...(Array.isArray(existing) ? existing : [])].slice(0, 5);
        localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(snapshots));
      }
      if (reportState) setSaveState('saved');
      return merged;
    } catch (error) { if (reportState) setSaveState('error');setMessage(error instanceof Error?error.message:'保存失败，草稿已保留。');if(failOnError)throw error;return saved; }
  }
  function commitDraft(next: DraftState, keepSnapshot = false) { setDraft(hydrated ? persistDraft(next,keepSnapshot) : next); }
  function editField(field: 'question' | 'essay', value: string) { editCount.current += 1; commitDraft({ ...draft, [field]: value }, editCount.current % 25 === 0); }
  const currentWorkspaceSnapshot = useMemo<WritingWorkspace>(() => ({ id: draft.essayId, draft, feedback, feedbackSource, feedbackHistory, previousRuleKeys, resolved, stage, externalFallbackMode, externalReply, externalPanelOpen, savedAt: new Date().toISOString(), markdownReport }), [draft, feedback, feedbackSource, feedbackHistory, previousRuleKeys, resolved, stage, externalFallbackMode, externalReply, externalPanelOpen, markdownReport]);
  function persistWritingWorkspaces(next: WritingWorkspace[]) {
    try {
      writeRedundantJson(localStorage, WORKSPACES_KEY, WORKSPACES_MIRROR_KEY, next);
      workspacesRef.current = next;
      setWorkspaces(next);
      setSaveState('saved');
      return true;
    } catch (error) {
      setSaveState('error');
      setMessage(error instanceof Error ? error.message : '进行中的修订未能保存。');
      return false;
    }
  }
  function saveCurrentWritingWorkspace() {
    return persistWritingWorkspaces(upsertWritingWorkspace(workspacesRef.current, currentWorkspaceSnapshot));
  }

  useEffect(() => {
    let storedDraft: DraftState | null = null; let storedHistory: ErrorHistoryEntry[] = []; let storedArchive: WritingArchiveEntry[] = []; let storedWorkspaces: WritingWorkspace[] = []; let storedLanguage: UiLanguage = 'en'; let storedLayout: WorkspaceLayout = 'split'; let storedHighlights = true; let storedStage: WritingStage | null = null; let storedGuidance: WritingGuidanceMode = 'hint';
    try { storedDraft = readStoredDraft(); storedHistory = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') as ErrorHistoryEntry[]; const parsedArchive = JSON.parse(localStorage.getItem(ARCHIVE_KEY) || '[]') as unknown; if (Array.isArray(parsedArchive)) storedArchive = parsedArchive.filter(isWritingArchiveEntry); storedWorkspaces = readFirstValidJson(localStorage, [WORKSPACES_KEY, WORKSPACES_MIRROR_KEY], (value): value is WritingWorkspace[] => Array.isArray(value) && value.every(validWritingWorkspace)) ?? []; storedLanguage = localStorage.getItem(LANGUAGE_KEY) === 'zh' ? 'zh' : 'en'; storedLayout = localStorage.getItem(LAYOUT_KEY) === 'stacked' ? 'stacked' : 'split'; storedHighlights = localStorage.getItem(HIGHLIGHT_KEY) !== 'off'; storedStage = coerceWritingStage(localStorage.getItem(STAGE_KEY)); storedGuidance = localStorage.getItem(GUIDANCE_KEY) === 'correction' ? 'correction' : 'hint'; setResponseFormat(localStorage.getItem(RESPONSE_FORMAT_KEY) === 'markdown' ? 'markdown' : 'json'); } catch { /* Start clean when all local copies are unavailable. */ }
    try {draftBase.current=parseLocalValue(localStorage.getItem(DRAFT_KEY));historyBase.current=parseLocalValue(localStorage.getItem(HISTORY_KEY));archiveBase.current=parseLocalValue(localStorage.getItem(ARCHIVE_KEY));} catch { /* Corrupt originals remain untouched; guarded saves report conflicts. */ }
    const activeWorkspace = storedWorkspaces.find((workspace) => workspace.id === (storedDraft?.essayId ?? storedWorkspaces[0]?.id));
    const activeDraft = storedDraft ?? activeWorkspace?.draft ?? defaultDraft;
    const restoredWorkspace: WritingWorkspace = activeWorkspace ? { ...activeWorkspace, draft: activeDraft } : { id: activeDraft.essayId, draft: activeDraft, feedback: null, feedbackSource: { essayId: '', essay: '' }, feedbackHistory: [], previousRuleKeys: [], resolved: [], stage: storedStage ?? (activeDraft.originalEssay ? 1 : 0), externalFallbackMode: null, externalReply: '', externalPanelOpen: true, savedAt: new Date().toISOString() };
    const restoredWorkspaces = matchesSavedFinal(restoredWorkspace, storedArchive)
      ? storedWorkspaces.filter((workspace) => workspace.id !== restoredWorkspace.id)
      : upsertWritingWorkspace(storedWorkspaces, restoredWorkspace);
    workspacesRef.current = restoredWorkspaces;
    queueMicrotask(() => { setDraft(activeDraft); setWorkspaces(restoredWorkspaces); if (Array.isArray(storedHistory)) setHistory(storedHistory); setArchive(storedArchive); setFeedback(restoredWorkspace.feedback); setFeedbackSource(restoredWorkspace.feedbackSource); setFeedbackHistory(restoredWorkspace.feedbackHistory); setPreviousRuleKeys(restoredWorkspace.previousRuleKeys); setResolved(restoredWorkspace.resolved); setExternalFallbackMode(restoredWorkspace.externalFallbackMode); setExternalReply(restoredWorkspace.externalReply); setMarkdownReport(restoredWorkspace.markdownReport ?? ''); setExternalPanelOpen(restoredWorkspace.externalPanelOpen); setUiLanguage(storedLanguage); setWorkspaceLayout(storedLayout); setHighlightIssues(storedHighlights); setStageState(restoredWorkspace.stage); setGuidanceMode(storedGuidance); setHydrated(true); });
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    void fetch('/api/ielts-writing/workspaces', { cache: 'no-store' }).then(async (response) => {
      if (!response.ok) throw new Error('cloud unavailable');
      const data = await response.json() as { workspace?: { workspaces?: WritingWorkspace[]; error_history?: ErrorHistoryEntry[]; archive?: WritingArchiveEntry[]; learning_settings?: Record<string, unknown> } | null };
      if (cancelled) return;
      const remote = data.workspace;
      if (remote) {
        const byId = new Map<string, WritingWorkspace>();
        for (const item of [...(remote.workspaces ?? []), ...workspacesRef.current]) if (validWritingWorkspace(item) && (!byId.has(item.id) || item.savedAt >= byId.get(item.id)!.savedAt)) byId.set(item.id, item);
        const merged = [...byId.values()].sort((a, b) => b.savedAt.localeCompare(a.savedAt)).slice(0, 40);
        workspacesRef.current = merged; setWorkspaces(merged);
        const historyById = new Map<string, Set<string>>();
        for (const item of [...(remote.error_history ?? []), ...history]) if (item && typeof item.essayId === 'string' && Array.isArray(item.ruleKeys)) historyById.set(item.essayId, new Set([...(historyById.get(item.essayId) ?? []), ...item.ruleKeys]));
        setHistory([...historyById].map(([essayId, keys]) => ({ essayId, ruleKeys: [...keys] })));
        const archiveById = new Map<string, WritingArchiveEntry>();
        for (const item of [...(remote.archive ?? []), ...archive]) if (isWritingArchiveEntry(item)) archiveById.set(item.id, item);
        setArchive([...archiveById.values()].sort((a, b) => b.savedAt.localeCompare(a.savedAt)));
        const prefs = remote.learning_settings ?? {};
        if (prefs.uiLanguage === 'en' || prefs.uiLanguage === 'zh') setUiLanguage(prefs.uiLanguage);
        if (prefs.workspaceLayout === 'split' || prefs.workspaceLayout === 'stacked') setWorkspaceLayout(prefs.workspaceLayout);
        if (typeof prefs.highlightIssues === 'boolean') setHighlightIssues(prefs.highlightIssues);
        if (prefs.guidanceMode === 'hint' || prefs.guidanceMode === 'correction') setGuidanceMode(prefs.guidanceMode);
        if (prefs.responseFormat === 'json' || prefs.responseFormat === 'markdown') setResponseFormat(prefs.responseFormat);
        const selected = merged.find((item) => item.id === draft.essayId) ?? (!draft.essay.trim() ? merged[0] : undefined);
        if (selected) { setDraft(selected.draft); setFeedback(selected.feedback); setFeedbackSource(selected.feedbackSource); setFeedbackHistory(selected.feedbackHistory); setPreviousRuleKeys(selected.previousRuleKeys); setResolved(selected.resolved); setExternalFallbackMode(selected.externalFallbackMode); setExternalReply(selected.externalReply); setMarkdownReport(selected.markdownReport ?? ''); setExternalPanelOpen(selected.externalPanelOpen); setStageState(selected.stage); }
      }
      setCloudSyncReady(true); setCloudSyncStatus('synced');
    }).catch(() => { if (!cancelled) { setCloudSyncReady(false); setCloudSyncStatus('local'); } });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- Initial cloud restore runs once after hydration; editor changes must not restart it.
  }, [hydrated]);
  useEffect(() => {
    if (!hydrated || !cloudSyncReady) return;
    const timer = window.setTimeout(() => {
      setCloudSyncStatus('syncing');
      const body = { workspaces, errorHistory: history, archive, learningSettings: { uiLanguage, workspaceLayout, highlightIssues, guidanceMode, responseFormat } };
      void fetch('/api/ielts-writing/workspaces', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then((response) => { if (!response.ok) throw new Error('cloud save failed'); setCloudSyncStatus('synced'); })
        .catch(() => setCloudSyncStatus('error'));
    }, 900);
    return () => window.clearTimeout(timer);
  }, [archive, cloudSyncReady, guidanceMode, highlightIssues, history, hydrated, responseFormat, uiLanguage, workspaces, workspaceLayout]);
  useEffect(() => { if (!hydrated) return; try { localStorage.setItem(RESPONSE_FORMAT_KEY, responseFormat); } catch { /* Cloud sync remains available when local storage is full. */ } }, [hydrated, responseFormat]);
  useEffect(() => {
    if (!hydrated) return;
    try {
      const previous=draftBase.current as DraftState | undefined;
      if(previous && ['essayId','task','question','essay','originalEssay','timerStarted'].every(key=>previous[key as keyof DraftState]===draft[key as keyof DraftState]) && Math.floor(previous.secondsLeft/10)===Math.floor(draft.secondsLeft/10)) return;
      const merged=persistLocalEditNow(localStorage,DRAFT_KEY,draftBase.current,draft) as DraftState;
      writeRedundantJson(localStorage, DRAFT_KEY, MIRROR_KEY, merged);
      if(canonicalJson(merged)===canonicalJson(draft))draftBase.current=merged;
      else queueMicrotask(()=>setDraft(current=>{draftBase.current=merged;return threeWayMerge(draft,current,merged).merged as DraftState;}));
    } catch (error) { queueMicrotask(()=>{setSaveState('error');setMessage(error instanceof Error?error.message:'草稿保存失败。');}); }
    // Immediate event handlers are primary; this covers timer and programmatic updates.
  }, [draft, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    const current = currentWorkspaceSnapshot;
    const next = matchesSavedFinal(current, archive)
      ? workspacesRef.current.filter((workspace) => workspace.id !== current.id)
      : upsertWritingWorkspace(workspacesRef.current, current);
    try {
      writeRedundantJson(localStorage, WORKSPACES_KEY, WORKSPACES_MIRROR_KEY, next);
      if (canonicalJson(next) !== canonicalJson(workspacesRef.current)) setWorkspaces(next);
      workspacesRef.current = next;
    } catch (error) {
      queueMicrotask(() => { setSaveState('error'); setMessage(error instanceof Error ? error.message : '进行中的修订未能保存。'); });
    }
  }, [currentWorkspaceSnapshot, archive, hydrated]);
  useEffect(() => { if (!hydrated) return; try { const merged=persistLocalEditNow(localStorage,HISTORY_KEY,historyBase.current,history) as ErrorHistoryEntry[];if(canonicalJson(merged)===canonicalJson(history))historyBase.current=merged;else queueMicrotask(()=>setHistory(current=>{historyBase.current=merged;return threeWayMerge(history,current,merged).merged as ErrorHistoryEntry[];})); } catch (error) {queueMicrotask(()=>setMessage(error instanceof Error?error.message:'写作历史未保存，原历史已保留。'));} }, [history, hydrated]);
  useEffect(() => { if (!hydrated) return; try { const merged=persistLocalEditNow(localStorage,ARCHIVE_KEY,archiveBase.current,archive) as WritingArchiveEntry[];if(canonicalJson(merged)===canonicalJson(archive))archiveBase.current=merged;else queueMicrotask(()=>setArchive(current=>{archiveBase.current=merged;return threeWayMerge(archive,current,merged).merged as WritingArchiveEntry[];})); } catch (error) {queueMicrotask(()=>setMessage(error instanceof Error?error.message:'写作归档未保存，原归档已保留。'));} }, [archive, hydrated]);
  useEffect(() => {
    if (!draft.timerStarted || draft.secondsLeft <= 0) return;
    const interval = window.setInterval(() => setDraft((current) => ({ ...current, secondsLeft: Math.max(0, current.secondsLeft - 1), timerStarted: current.secondsLeft > 1 })), 1000);
    return () => window.clearInterval(interval);
  }, [draft.timerStarted, draft.secondsLeft]);

  useEffect(() => {
    const onFullscreenChange = () => setFocusMode(Boolean(document.fullscreenElement && document.fullscreenElement === workspaceRef.current));
    const onEscape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !document.fullscreenElement) setFocusMode(false); };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('keydown', onEscape);
    return () => { document.removeEventListener('fullscreenchange', onFullscreenChange); document.removeEventListener('keydown', onEscape); };
  }, []);
  useEffect(() => {
    if (!focusMode) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [focusMode]);
  useEffect(() => {
    const editor = essayRef.current;
    if (!editor) return;
    const syncWidth = () => highlightLayerRef.current?.parentElement?.style.setProperty('--editor-scrollbar-inset', `${Math.max(1, editor.offsetWidth - editor.clientWidth - 1)}px`);
    const observer = new ResizeObserver(syncWidth);
    observer.observe(editor);
    syncWidth();
    return () => observer.disconnect();
  }, [hydrated]);
  async function enterFocusMode() {
    setFocusMode(true);
    requestAnimationFrame(() => {
      if (workspaceRef.current) workspaceRef.current.scrollTop = 0;
      workspaceRef.current?.querySelectorAll<HTMLElement>('[data-scroll-region]').forEach((region) => { region.scrollTop = 0; });
    });
    try { await workspaceRef.current?.requestFullscreen?.(); } catch { /* Keep the viewport workspace when native fullscreen is unavailable. */ }
  }
  async function leaveFocusMode() {
    setFocusMode(false);
    if (document.fullscreenElement === workspaceRef.current) {
      try { await document.exitFullscreen(); } catch { /* The browser may already be leaving fullscreen. */ }
    }
  }

  const words = useMemo(() => countWords(draft.essay), [draft.essay]);
  const target = targetWords(draft.task);
  const recurring = useMemo(() => recurringRuleKeys(history), [history]);
  const hasChanged = Boolean(draft.originalEssay && draft.essay.trim() !== draft.originalEssay.trim());
  const revision = useMemo(() => draft.originalEssay ? diffWriting(draft.originalEssay, draft.essay) : [], [draft.originalEssay, draft.essay]);
  const addedWords = useMemo(() => revision.filter((part) => part.type === 'added').reduce((sum, part) => sum + countWords(part.text), 0), [revision]);
  const removedWords = useMemo(() => revision.filter((part) => part.type === 'removed').reduce((sum, part) => sum + countWords(part.text), 0), [revision]);
  const trackedQuotes = useMemo(() => feedbackSource.essayId === draft.essayId ? trackWritingQuotes(feedbackSource.essay, draft.essay, [
    ...(feedback?.issues.map((issue) => ({ id: issue.id, quote: issue.quote })) ?? []),
    ...(feedback?.upgrades.map((upgrade, index) => ({ id: `upgrade-${index}`, quote: upgrade.original })) ?? []),
  ]) : [], [draft.essayId, draft.essay, feedback, feedbackSource]);
  const highlightedEssay = useMemo(() => highlightWritingRanges(deferredEssay, trackedQuotes.filter((quote) => !resolved.includes(quote.id))), [deferredEssay, trackedQuotes, resolved]);
  const editorHighlightsReady = highlightIssues && deferredEssay === draft.essay && highlightedEssay.some((part) => part.highlighted);
  function currentQuote(id: string, original: string) {
    const range = trackedQuotes.find((quote) => quote.id === id);
    if (range) return draft.essay.slice(range.start, range.end);
    return feedbackSource.essayId === draft.essayId && findQuotedTextRange(feedbackSource.essay, original)
      ? (uiLanguage === 'en' ? 'This passage was removed or can no longer be located.' : '此处内容已删除或无法定位。') : original;
  }
  const activeExternalMode = externalFallbackMode ?? (!feedback ? 'diagnose' : hasChanged ? 'recheck' : 'upgrade');
  const recurringIssueRecords = useMemo(() => {
    const keys = new Set(recurringRuleKeys(history));
    return workspaces.flatMap((workspace) => workspace.feedback?.issues.filter((issue) => keys.has(issue.ruleKey)).map(({ quote, explanation, correction }) => ({ quote, explanation, ...(correction ? { correction } : {}) })) ?? []).slice(0, 12);
  }, [history, workspaces]);
  const currentIssueRecords = feedback?.issues.map(({ quote, explanation, correction }) => ({ quote, explanation, ...(correction ? { correction } : {}) })) ?? [];
  const promptIssueRecords = activeExternalMode === 'diagnose' ? recurringIssueRecords : currentIssueRecords;
  const currentArchive = archive.find((entry) => entry.id === currentArchiveId) ?? null;
  const archiveResults = archive.filter((entry) => `${entry.title} ${entry.question} ${entry.content}`.toLocaleLowerCase().includes(archiveQuery.toLocaleLowerCase()));
  const readerThemeClass = readerTheme === 'night' ? 'bg-[#111827] text-[#e5e7eb]' : readerTheme === 'mint' ? 'bg-[#effaf5] text-[#16372d]' : 'bg-[#fffdf7] text-[#29251f]';
  const externalPrompt = useMemo(() => repairPromptMode ? buildWritingFeedbackRepairPrompt(externalReply.slice(0, 40_000), guidanceMode, uiLanguage) : buildWritingReviewPrompt({ ...draft, mode: activeExternalMode, previousRuleKeys: [...new Set([...previousRuleKeys, ...recurringRuleKeys(history)])], recurringErrorKeys: recurringRuleKeys(history), previousIssues: promptIssueRecords, outputLanguage: uiLanguage, responseFormat, guidanceMode }), [activeExternalMode, draft, externalReply, guidanceMode, history, previousRuleKeys, promptIssueRecords, repairPromptMode, responseFormat, uiLanguage]);
  function toggleLanguage() { const next = uiLanguage === 'en' ? 'zh' : 'en'; setUiLanguage(next); try { localStorage.setItem(LANGUAGE_KEY, next); } catch { setSaveState('error'); } }
  function changeLayout(next: WorkspaceLayout) { setWorkspaceLayout(next); try { localStorage.setItem(LAYOUT_KEY, next); } catch { setSaveState('error'); } }
  function toggleHighlights() { const next = !highlightIssues; setHighlightIssues(next); try { localStorage.setItem(HIGHLIGHT_KEY, next ? 'on' : 'off'); } catch { setSaveState('error'); } }
  function changeStage(next: WritingStage) { setStageState(next); try { localStorage.setItem(STAGE_KEY, String(next)); } catch { setSaveState('error'); } }
  function changeGuidanceMode(next: WritingGuidanceMode) { setGuidanceMode(next); try { localStorage.setItem(GUIDANCE_KEY, next); } catch { setSaveState('error'); } }
  function syncEditorScroll() {
    const editor = essayRef.current;
    const layer = highlightLayerRef.current;
    if (!editor || !layer) return;
    layer.style.transform = `translate(${-editor.scrollLeft}px, ${-editor.scrollTop}px)`;
    layer.parentElement?.style.setProperty('--editor-scrollbar-inset', `${Math.max(1, editor.offsetWidth - editor.clientWidth - 1)}px`);
  }
  function locateIssue(issueId: string) {
    const range = trackedQuotes.find((item) => item.id === issueId) ?? null;
    if (!range) { setMessage(c.noQuotedIssues); return; }
    setActiveIssueId(issueId);
    if (!highlightIssues) toggleHighlights();
    requestAnimationFrame(() => {
      const editor = essayRef.current;
      if (!editor) return;
      editor.focus({ preventScroll: true });
      editor.setSelectionRange(range.start, range.end, 'forward');
      const activeMark = [...(highlightLayerRef.current?.querySelectorAll('mark') ?? [])].find((mark) => mark.getAttribute('data-issue-ids')?.split(' ').includes(issueId));
      if (activeMark instanceof HTMLElement) editor.scrollTop = Math.max(0, activeMark.offsetTop - editor.clientHeight / 2 + activeMark.offsetHeight / 2);
      syncEditorScroll();
      const scrollRegion = editor.closest<HTMLElement>('[data-scroll-region]');
      if (activeMark instanceof HTMLElement && scrollRegion) {
        const markRect = activeMark.getBoundingClientRect();
        const regionRect = scrollRegion.getBoundingClientRect();
        scrollRegion.scrollTop += markRect.top + markRect.height / 2 - regionRect.top - regionRect.height / 2;
      } else {
        editor.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }
  function updateTask(task: WritingTask) { commitDraft({ ...draft, task, secondsLeft: task === 'task2' ? 2400 : 1200, timerStarted: false }, true); }
  async function showExternalFallback(mode: ReviewMode) {
    const issues = mode === 'diagnose' ? recurringIssueRecords : currentIssueRecords;
    const prompt = buildWritingReviewPrompt({ ...draft, mode, previousRuleKeys: [...new Set([...previousRuleKeys, ...recurringRuleKeys(history)])], recurringErrorKeys: recurringRuleKeys(history), previousIssues: issues, outputLanguage: uiLanguage, responseFormat, guidanceMode });
    setExternalFallbackMode(mode); setExternalPanelOpen(true); setExternalReply(''); setPromptCopied(false); setRepairPromptMode(false);
    try { await navigator.clipboard.writeText(prompt); setPromptCopied(true); } catch { /* Prompt remains available in the preview. */ }
  }

  async function review(mode: ReviewMode) {
    if (draft.essay.trim().length < 80) { setMessage(c.tooShort); return; }
    if (mode === 'recheck' && !hasChanged) { setMessage(c.reviseFirst); return; }
    setMessage(''); setMarkdownReport('');
    if (!draft.originalEssay) commitDraft({ ...draft, originalEssay: draft.essay }, true);
    void showExternalFallback(mode);
  }
  function goBack() {
    if (externalFallbackMode) { setExternalFallbackMode(null); setExternalReply(''); setMessage(''); return; }
    const previous = feedbackHistory.at(-1);
    if (!previous) return;
    setFeedback(previous.feedback); setFeedbackSource(previous.source); setPreviousRuleKeys(previous.previousRuleKeys); setResolved(previous.resolved); changeStage(previous.stage); setHistory((current) => updateErrorHistory(current, draft.essayId, previous.previousRuleKeys)); setFeedbackHistory((current) => current.slice(0, -1)); setMessage('');
  }
  function switchWritingWorkspace(workspaceId: string) {
    if (!hydrated || loadingMode || workspaceId === draft.essayId) return;
    if (!saveCurrentWritingWorkspace()) return;
    const selected = workspacesRef.current.find((workspace) => workspace.id === workspaceId);
    if (!selected) return;
    try {
      writeRedundantJson(localStorage, DRAFT_KEY, MIRROR_KEY, selected.draft);
      draftBase.current = selected.draft;
    } catch (error) {
      setSaveState('error'); setMessage(error instanceof Error ? error.message : '无法切换到这篇文章。'); return;
    }
    setDraft(selected.draft); setFeedback(selected.feedback); setFeedbackSource(selected.feedbackSource); setFeedbackHistory(selected.feedbackHistory); setMarkdownReport(selected.markdownReport ?? '');
    setPreviousRuleKeys(selected.previousRuleKeys); setResolved(selected.resolved); changeStage(selected.stage);
    setActiveIssueId(null); setExternalFallbackMode(selected.externalFallbackMode); setExternalReply(selected.externalReply); setExternalPanelOpen(selected.externalPanelOpen); setPromptCopied(false);
    setCurrentArchiveId(null); setView('workbench'); editCount.current = 0; setMessage('');
  }
  function startNewEssay(transfer = false) {
    if (!hydrated || loadingMode) return;
    // Keep the complete outgoing repair workspace before replacing it.
    let saved: DraftState;
    try {
      const alreadyFinal = matchesSavedFinal(currentWorkspaceSnapshot, archive);
      if (!alreadyFinal && !saveCurrentWritingWorkspace()) return;
      if (draft.question.trim() || draft.essay.trim() || draft.originalEssay.trim()) persistDraft(draft, true, true, true);
      const next = { ...defaultDraft, essayId: newEssayId(), task: draft.task, secondsLeft: draft.task === 'task2' ? 2400 : 1200 };
      saved = persistDraft(next, false, true, true);
    } catch { return; }
    setDraft(saved); setFeedback(null); setFeedbackSource({ essayId: '', essay: '' }); setFeedbackHistory([]); setPreviousRuleKeys([]); setResolved([]); setMarkdownReport(''); setRepairPromptMode(false); setActiveIssueId(null);
    setExternalFallbackMode(null); setExternalPanelOpen(true); setExternalReply(''); setPromptCopied(false); setCurrentArchiveId(null); editCount.current = 0;
    changeStage(0); setView('workbench'); setMessage(transfer ? c.transferStarted : c.newEssayStarted);
    requestAnimationFrame(() => { essayRef.current?.focus(); essayRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); syncEditorScroll(); });
  }
  function restoreSnapshot() { try { const snapshots = JSON.parse(localStorage.getItem(SNAPSHOTS_KEY) || '[]') as DraftSnapshot[]; const latest = snapshots.find((item) => validDraft(item?.draft)); if (!latest) { setMessage(c.noSnapshot); return; } commitDraft(latest.draft); setMessage(c.restored); } catch { setMessage(c.noSnapshot); } }
  function exportBackup() { const payload = JSON.stringify({ exportedAt: new Date().toISOString(), draft, history }, null, 2); const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `ielts-writing-${draft.essayId}.json`; anchor.click(); URL.revokeObjectURL(url); }
  async function copyExternalPrompt() { try { await navigator.clipboard.writeText(externalPrompt); setPromptCopied(true); window.setTimeout(() => setPromptCopied(false), 1800); } catch { setMessage(uiLanguage === 'en' ? 'Clipboard access failed. Select the prompt preview and copy it manually.' : '无法访问剪贴板，请在提示词预览中手动复制。'); } }
  function importExternalReply() {
    if (!hydrated || loadingMode) return;
    if (!externalReply.trim()) { setMessage(c.invalidReply); return; }
    if (responseFormat === 'markdown') {
      setMarkdownReport(externalReply.trim()); setExternalPanelOpen(false); setExternalFallbackMode(null); setRepairPromptMode(false); setMessage(c.markdownImported); return;
    }
    try {
      const result = parseWritingFeedback(externalReply);
      const keys = result.issues.map((issue) => issue.ruleKey);
      setFeedbackHistory((current) => [...current, { source: feedbackSource, feedback, previousRuleKeys, resolved, stage }].slice(-10)); setFeedback(result); setExternalPanelOpen(false); setFeedbackSource({ essayId: draft.essayId, essay: draft.essay }); setResolved([]); setPreviousRuleKeys(keys); setHistory((current) => updateErrorHistory(current, draft.essayId, keys)); changeStage(result.readyForUpgrade ? 2 : 1); setExternalFallbackMode(null); setRepairPromptMode(false); setMessage(c.imported);
      if (!draft.originalEssay) commitDraft({ ...draft, originalEssay: draft.essay }, true);
    } catch {
      setExternalFallbackMode(externalFallbackMode ?? (feedback ? 'recheck' : 'diagnose'));
      setExternalPanelOpen(true);
      setMessage(uiLanguage === 'en' ? 'The reply could not be parsed. The repair prompt is ready to copy to the external model.' : '回复格式无法识别。已准备好修复提示词，可复制给外部模型重新整理。');
      setRepairPromptMode(true);
      setRepairPromptMode(true);
    }
  }
  function archiveCurrentEssay() {
    if (draft.essay.trim().length < 80) { setMessage(uiLanguage === 'en' ? 'Write at least 80 characters before saving a final version.' : '至少写满 80 个字符后再保存最终稿。'); return; }
    const entry = createWritingArchiveEntry({ essayId: draft.essayId, title: archive.find((item) => item.essayId === draft.essayId)?.title, task: draft.task, question: draft.question, content: draft.essay, savedAt: new Date().toISOString(), bandEstimate: feedback?.bandEstimate });
    setArchive((entries) => upsertWritingArchive(entries, entry)); persistWritingWorkspaces(workspacesRef.current.filter((workspace) => workspace.id !== draft.essayId)); setCurrentArchiveId(entry.id); void leaveFocusMode(); setView('reader'); setMessage(uiLanguage === 'en' ? 'Final version saved to your library.' : '最终稿已保存到文库。');
  }
  function openArchivedEssay(entryId: string) { setCurrentArchiveId(entryId); setView('reader'); }
  async function deleteArchivedEssay(entry: WritingArchiveEntry) {
    const prompt = uiLanguage === 'en' ? `Delete “${entry.title}” from the local library?` : `确定从本地文库删除《${entry.title}》吗？`;
    if (!(await siteConfirm(prompt))) return;
    setArchive((entries) => entries.filter((item) => item.id !== entry.id));
    if (currentArchiveId === entry.id) { setCurrentArchiveId(null); setView('library'); }
  }
  function speakArchivedEssay(text: string) {
    if (!('speechSynthesis' in window)) { setMessage(uiLanguage === 'en' ? 'Text-to-speech is not supported in this browser.' : '当前浏览器不支持朗读。'); return; }
    window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'en-US'; utterance.rate = 0.9; window.speechSynthesis.speak(utterance);
  }
  return <div data-ielts-writing-workbench className="relative mx-auto max-w-[1540px] space-y-5 text-[var(--foreground)]">
    <header className="relative isolate overflow-hidden rounded-[28px] bg-[linear-gradient(118deg,#071b33_0%,#0b3150_56%,#075985_100%)] px-5 py-6 text-white shadow-[0_24px_70px_rgba(7,27,51,.28)] sm:px-8 sm:py-7">
      <div className="pointer-events-none absolute -right-20 -top-32 -z-10 h-80 w-80 rounded-full bg-[#38bdf8]/20 blur-3xl" /><div className="pointer-events-none absolute bottom-0 left-1/3 -z-10 h-24 w-80 bg-[#f59e0b]/10 blur-3xl" />
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between"><div className="max-w-3xl"><div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[.22em] text-[#7dd3fc]"><span className="grid h-7 w-7 place-items-center rounded-lg bg-white/10"><span className="material-icons-round text-base">edit_note</span></span>IELTS Writing Lab</div><h1 className="text-3xl font-bold tracking-[-.035em] sm:text-[2.4rem]">{c.title}</h1><p className="mt-3 max-w-2xl text-[15px] leading-7 text-[#c7dff0]">{c.subtitle}</p></div>
        <div className="flex flex-wrap items-center gap-3"><button type="button" disabled={!hydrated || Boolean(loadingMode)} onClick={() => startNewEssay()} className="min-h-11 rounded-xl bg-white px-4 text-sm font-bold text-[#071b33] hover:bg-[#e0f2fe] disabled:opacity-50"><span aria-hidden="true" className="material-icons-round mr-2 align-middle text-lg">add</span>{c.newEssay}</button><button type="button" onClick={toggleLanguage} className="min-h-11 rounded-xl border border-white/20 bg-white/10 px-4 text-sm font-bold backdrop-blur hover:bg-white/15"><span className="material-icons-round mr-2 align-middle text-lg">translate</span>{c.language}</button><div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-3 py-2.5 backdrop-blur"><button type="button" onClick={() => commitDraft({ ...draft, timerStarted: !draft.timerStarted })} className="grid h-11 w-11 place-items-center rounded-xl bg-[#fbbf24] text-[#071b33] shadow-lg shadow-amber-950/20" aria-label={draft.timerStarted ? c.pause : c.start}><span className="material-icons-round">{draft.timerStarted ? 'pause' : 'play_arrow'}</span></button><div className="min-w-20"><p className="font-mono text-2xl font-bold tabular-nums">{formatTime(draft.secondsLeft)}</p><p className="text-[11px] uppercase tracking-wider text-[#a9cce1]">{c.timer}</p></div><button type="button" onClick={() => commitDraft({ ...draft, timerStarted: false, secondsLeft: draft.task === 'task2' ? 2400 : 1200 })} className="grid h-10 w-10 place-items-center rounded-xl text-[#d5e9f5] hover:bg-white/10" aria-label={c.reset}><span className="material-icons-round text-xl">restart_alt</span></button></div></div></div>
    </header>

    <nav className="grid grid-cols-3 gap-2 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-2" aria-label={uiLanguage === 'en' ? 'Writing tool views' : '写作工具视图'}>{([{ id: 'workbench', icon: 'edit_note', en: 'Workbench', zh: '写作工作台' }, { id: 'library', icon: 'local_library', en: `Final library ${archive.length}`, zh: `最终稿文库 ${archive.length}` }, { id: 'reader', icon: 'menu_book', en: 'Reader', zh: '阅读器' }] as const).map((item) => <button key={item.id} type="button" onClick={() => item.id === 'reader' && !currentArchive ? setView('library') : setView(item.id)} className={`min-h-12 rounded-xl px-2 text-sm font-bold transition ${view === item.id ? 'bg-[#0e7490] text-white shadow-md' : 'text-[var(--muted-foreground)] hover:bg-[var(--background)]'}`}><span className="material-icons-round mr-1.5 align-middle text-lg">{item.icon}</span>{uiLanguage === 'en' ? item.en : item.zh}</button>)}</nav>

    {view === 'workbench' && workspaces.length > 0 && <section data-writing-in-progress className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-3 sm:p-4"><div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-sm font-bold">{c.inProgress} <span className="ml-1 rounded-full bg-[#e0f2fe] px-2 py-0.5 text-xs text-[#075985] dark:bg-[#16384c] dark:text-[#7dd3fc]">{workspaces.length}</span></h2><p className="text-xs text-[var(--muted-foreground)]">{c.continueRevision}</p></div><div className="flex gap-2 overflow-x-auto pb-1">{workspaces.map((workspace, index) => { const active = workspace.id === draft.essayId; return <button key={workspace.id} type="button" aria-current={active ? 'true' : undefined} aria-label={`${active ? c.currentEssay : c.continueRevision}: ${writingWorkspaceTitle(workspace, index)}`} disabled={Boolean(loadingMode)} onClick={() => switchWritingWorkspace(workspace.id)} className={`min-w-48 max-w-72 flex-1 rounded-xl border px-3 py-2.5 text-left transition disabled:opacity-60 ${active ? 'border-[#0e7490] bg-[#ecfeff] ring-1 ring-[#0e7490]/20 dark:bg-[#123543]' : 'border-[var(--card-border)] hover:border-[#67b9cc] hover:bg-[var(--background)]'}`}><span className="block truncate text-sm font-semibold">{writingWorkspaceTitle(workspace, index)}</span><span className="mt-1 block truncate text-xs text-[var(--muted-foreground)]">{active ? c.currentEssay : c.stages[workspace.stage]} · {taskLabel(workspace.draft.task)} · {countWords(workspace.draft.essay)} {c.words}</span></button>; })}</div></section>}
    {view === 'workbench' && <section ref={workspaceRef} data-writing-workspace data-focus-mode={focusMode} className={`grid gap-5 ${focusMode ? 'fixed inset-0 z-[100] !m-0 h-[100dvh] w-full max-w-none overflow-y-auto bg-[var(--background)] p-3 sm:p-5' : ''} ${workspaceLayout === 'split' ? `${focusMode ? 'xl:grid-rows-[auto_minmax(0,1fr)]' : 'xl:h-[calc(100dvh-20rem)]'} xl:min-h-[360px] xl:grid-cols-[minmax(0,1.3fr)_minmax(440px,1fr)] xl:overflow-hidden` : 'grid-cols-1'}`}>
      {focusMode && <div className="sticky top-0 z-20 col-span-full flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-3 py-2"><span className="flex items-center gap-2 text-sm font-bold"><button type="button" onClick={() => commitDraft({ ...draft, timerStarted: !draft.timerStarted })} aria-label={draft.timerStarted ? c.pause : c.start} className="min-h-10 rounded-lg border border-[var(--card-border)] px-3">{draft.timerStarted ? c.pause : c.start}</button>{uiLanguage === 'en' ? 'Focused revision' : '专注修改'} <span className="ml-2 font-mono text-[var(--muted-foreground)]">{formatTime(draft.secondsLeft)}</span></span><div className="flex flex-wrap gap-2"><button type="button" onClick={archiveCurrentEssay} className="min-h-10 rounded-lg bg-[#147352] px-3 text-sm font-bold text-white">{uiLanguage === 'en' ? 'Save final version' : '保存最终稿'}</button><button type="button" onClick={() => void leaveFocusMode()} className="min-h-10 rounded-lg border border-[var(--card-border)] px-3 text-sm font-bold">{uiLanguage === 'en' ? 'Exit fullscreen' : '退出全屏'}</button></div></div>}
      <div className={`min-w-0 space-y-5 ${workspaceLayout === 'split' ? 'xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain xl:pr-1 xl:pb-6' : ''}`} data-scroll-region={workspaceLayout === 'split' ? true : undefined}>
      <article className="overflow-hidden rounded-3xl border border-[var(--card-border)] bg-[var(--card)] shadow-[0_14px_45px_rgba(15,23,42,.07)] dark:shadow-none"><div className="flex flex-col gap-4 border-b border-[var(--card-border)] bg-[linear-gradient(90deg,rgba(14,116,144,.06),transparent)] p-4 sm:px-6"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className={focusMode ? 'hidden' : 'flex flex-wrap gap-2'} role="group" aria-label={c.taskGroup}>{(['task1-academic', 'task1-general', 'task2'] as WritingTask[]).map((task) => <button type="button" key={task} onClick={() => updateTask(task)} className={`min-h-11 rounded-xl px-3.5 text-sm font-semibold transition ${draft.task === task ? 'bg-[#0e7490] text-white shadow-md shadow-cyan-950/15' : 'border border-transparent bg-[var(--background)] text-[var(--muted-foreground)] hover:border-[#67b9cc]'}`}>{taskLabel(task)}</button>)}</div><div className="flex items-center gap-3 text-sm"><span className={`rounded-full px-3 py-1.5 font-bold ${words >= target ? 'bg-[#dcfce7] text-[#166534] dark:bg-[#143f2a] dark:text-[#86efac]' : 'bg-[var(--background)] text-[var(--muted-foreground)]'}`}>{words} / {target}+ {c.words}</span><span title={cloudSyncStatus === 'synced' ? '已同步到账号' : cloudSyncStatus === 'syncing' ? '正在同步到账号' : cloudSyncStatus === 'error' ? '云端同步暂不可用，内容仍保存在本机' : '本机已保存'} className={`flex items-center gap-1.5 text-xs font-semibold ${saveState === 'error' ? 'text-[#dc2626]' : 'text-[#16845b]'}`}><span className="material-icons-round text-base">{saveState === 'error' ? 'cloud_off' : 'verified'}</span>{saveState === 'error' ? c.saveError : c.saved}</span></div></div><div className="flex flex-wrap items-center gap-2">{!focusMode && <><button type="button" onClick={() => void enterFocusMode()} className="min-h-10 rounded-xl bg-[#0e7490] px-3 text-xs font-bold text-white">{uiLanguage === 'en' ? 'Fullscreen revision' : '全屏修改'}</button><button type="button" onClick={archiveCurrentEssay} className="min-h-10 rounded-xl border border-[var(--card-border)] px-3 text-xs font-bold text-[#147352] dark:text-[#86efac]">{uiLanguage === 'en' ? 'Save final version' : '保存最终稿'}</button></>}<span className="mr-1 text-xs font-bold uppercase tracking-[.08em] text-[var(--muted-foreground)]">{c.layout}</span><button type="button" aria-pressed={workspaceLayout === 'split'} onClick={() => changeLayout('split')} className={`flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-bold ${workspaceLayout === 'split' ? 'bg-[#0e7490] text-white' : 'border border-[var(--card-border)] bg-[var(--background)] text-[var(--muted-foreground)]'}`}><span className="material-icons-round text-lg">view_sidebar</span>{c.split}</button><button type="button" aria-pressed={workspaceLayout === 'stacked'} onClick={() => changeLayout('stacked')} className={`flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-bold ${workspaceLayout === 'stacked' ? 'bg-[#0e7490] text-white' : 'border border-[var(--card-border)] bg-[var(--background)] text-[var(--muted-foreground)]'}`}><span className="material-icons-round text-lg">view_agenda</span>{c.stacked}</button></div></div>
        <div className="space-y-5 p-4 sm:p-6">
          <details open={!focusMode}><summary className={focusMode ? 'cursor-pointer text-sm font-bold text-[var(--muted-foreground)]' : 'hidden'}>{c.question}</summary><label className="block"><span className="mb-2 block text-sm font-bold uppercase tracking-[.08em] text-[var(--muted-foreground)]">{c.question}</span><textarea value={draft.question} onChange={(event) => editField('question', event.target.value)} rows={3} placeholder={c.questionPlaceholder} className="w-full resize-y rounded-2xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-3.5 text-base leading-7 outline-none transition focus:border-[#0e7490] focus:ring-4 focus:ring-[#0e7490]/10" /></label></details>
          <div className="block"><div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm font-bold uppercase tracking-[.08em] text-[var(--muted-foreground)]"><span id="ielts-essay-label">{c.essay}</span><span className="flex items-center gap-2"><button type="button" aria-pressed={highlightIssues} onClick={toggleHighlights} className={`flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold normal-case tracking-normal ${highlightIssues ? 'bg-[#fef3c7] text-[#92400e] dark:bg-[#4a2e0c] dark:text-[#fcd34d]' : 'border border-[var(--card-border)] text-[var(--muted-foreground)]'}`}><span className="material-icons-round text-base">highlight</span>{highlightIssues ? c.highlightsOn : c.highlightsOff}</button>{draft.originalEssay && <button type="button" onClick={() => originalRef.current?.scrollIntoView({ behavior: 'smooth' })} className="normal-case font-semibold tracking-normal text-[#0e7490] hover:underline">{c.originalLink}</button>}</span></div><div className="relative block overflow-hidden rounded-2xl bg-[var(--background)]"><div aria-hidden="true" style={{ right: 'var(--editor-scrollbar-inset, 1px)' }} className={`pointer-events-none absolute inset-y-px left-px overflow-hidden rounded-2xl ${editorHighlightsReady ? 'opacity-100' : 'opacity-0'}`}><div ref={highlightLayerRef} className="block min-h-full whitespace-pre-wrap break-words px-5 py-5 font-serif text-[18px] leading-[2] text-[var(--foreground)] sm:px-7">{highlightedEssay.map((part, index) => part.highlighted ? <mark key={index} data-issue-ids={part.issueIds.join(' ')} className={`rounded text-inherit ${activeIssueId && part.issueIds.includes(activeIssueId) ? 'bg-[#fb923c] ring-2 ring-[#ea580c]/60 dark:bg-[#c2410c]' : 'bg-[#fde68a] ring-1 ring-[#f59e0b]/35 dark:bg-[#854d0e]'}`}>{part.text}</mark> : <span key={index}>{part.text}</span>)}</div></div><textarea aria-labelledby="ielts-essay-label" ref={essayRef} value={draft.essay} onChange={(event) => { setActiveIssueId(null); editField('essay', event.target.value); }} onScroll={syncEditorScroll} rows={20} spellCheck lang="en" placeholder={c.essayPlaceholder} className={`relative min-h-[500px] w-full resize-y rounded-2xl border border-[var(--card-border)] bg-transparent px-5 py-5 font-serif text-[18px] leading-[2] caret-[var(--foreground)] outline-none transition selection:bg-[#38bdf8]/45 focus:border-[#0e7490] focus:ring-4 focus:ring-[#0e7490]/10 sm:px-7 ${editorHighlightsReady ? 'text-transparent' : 'text-[var(--foreground)]'}`} /></div></div>
          {feedback && <section className="rounded-2xl border border-[#f5c34f] bg-[#fffbeb] p-4 dark:border-[#755615] dark:bg-[#2f270f]"><div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[.1em] text-[#92400e] dark:text-[#fcd34d]"><span className="material-icons-round text-lg">format_ink_highlighter</span>{c.highlightedDraft}</div>{highlightedEssay.some((part) => part.highlighted) ? <p className="whitespace-pre-wrap font-serif text-[17px] leading-8 text-[var(--foreground)]">{highlightedEssay.map((part, index) => part.highlighted ? <mark key={index} className="rounded bg-[#fde68a] px-0.5 text-[#713f12] ring-1 ring-[#f59e0b]/35 dark:bg-[#854d0e] dark:text-[#fef3c7]">{part.text}</mark> : <span key={index}>{part.text}</span>)}</p> : <p className="text-sm text-[var(--muted-foreground)]">{c.noQuotedIssues}</p>}</section>}
        </div>
      </article>
      <article hidden={focusMode} className="overflow-hidden rounded-3xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm"><div className="flex flex-col gap-3 border-b border-[var(--card-border)] p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#7c3aed]">{c.revision}</p><h2 className="mt-1.5 text-lg font-semibold">{c.revisionTitle}</h2></div>{draft.originalEssay && <div className="flex gap-2"><span className="rounded-full bg-[#dcfce7] px-3 py-1 text-xs font-bold text-[#166534] dark:bg-[#143f2a] dark:text-[#86efac]">+{addedWords} {c.added}</span><span className="rounded-full bg-[#fee2e2] px-3 py-1 text-xs font-bold text-[#991b1b] dark:bg-[#471c1c] dark:text-[#fca5a5]">−{removedWords} {c.removed}</span></div>}</div><div className="min-h-28 p-5 font-serif text-[17px] leading-8">{!draft.originalEssay ? <p className="font-sans text-sm text-[var(--muted-foreground)]">{c.currentOnly}</p> : !hasChanged ? <p className="font-sans text-sm text-[var(--muted-foreground)]">{c.noRevision}</p> : <p className="whitespace-pre-wrap">{revision.map((part, index) => part.type === 'added' ? <ins key={index} className="rounded bg-[#bbf7d0] px-0.5 text-[#14532d] no-underline dark:bg-[#14532d] dark:text-[#bbf7d0]">{part.text}</ins> : part.type === 'removed' ? <del key={index} className="rounded bg-[#fecaca] px-0.5 text-[#7f1d1d] decoration-2 dark:bg-[#7f1d1d] dark:text-[#fecaca]">{part.text}</del> : <span key={index}>{part.text}</span>)}</p>}</div></article>
      {draft.originalEssay && <article ref={originalRef} className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm sm:p-6"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#0e7490]">{c.originalEyebrow}</p><h2 className="mt-1.5 text-lg font-semibold">{c.originalTitle}</h2></div><span className="rounded-full bg-[#e0f2fe] px-3 py-1 text-xs font-bold text-[#075985] dark:bg-[#16384c] dark:text-[#7dd3fc]">{countWords(draft.originalEssay)} {c.words}</span></div><p className="mt-5 whitespace-pre-wrap font-serif text-[17px] leading-8 text-[var(--muted-foreground)]">{draft.originalEssay}</p></article>}
    </div>

    <aside className={`flex min-w-0 flex-col gap-5 ${workspaceLayout === 'split' ? 'xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain xl:scroll-pb-8 xl:pb-8 xl:pl-1' : ''}`} data-scroll-region={workspaceLayout === 'split' ? true : undefined}>
      <article className="order-1 shrink-0 rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-[0_14px_45px_rgba(15,23,42,.07)] dark:shadow-none">
        <div className="mb-4 flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#d97706]">{c.loop}</p><h2 className="mt-1.5 text-xl font-semibold">{c.round}</h2><p className="mt-1 text-xs text-[var(--muted-foreground)]">{c.stageHint}</p></div><div className="flex items-center gap-2">{(feedbackHistory.length > 0 || externalFallbackMode) && <button type="button" onClick={goBack} className="flex min-h-9 items-center gap-1 rounded-xl border border-[var(--card-border)] px-3 text-xs font-bold text-[var(--muted-foreground)] hover:border-[#d97706] hover:text-[#b45309]"><span className="material-icons-round text-base">arrow_back</span>{c.back}</button>}{feedback && <span className="rounded-xl bg-[#fff1d6] px-3 py-1.5 text-sm font-bold text-[#92400e] dark:bg-[#4a2e0c] dark:text-[#fcd34d]">Band {feedback.bandEstimate}</span>}</div></div>
        <ol className="relative mb-5 grid grid-cols-4 gap-1 text-center text-[11px] font-bold"><span className="absolute left-[12%] right-[12%] top-4 h-px bg-[var(--card-border)]" />{c.stages.map((label, index) => <li key={label} className="relative"><button type="button" aria-pressed={index === stage} onClick={() => changeStage(index as WritingStage)} className={`group w-full rounded-xl px-1 py-1.5 transition hover:bg-[#ecfeff] focus:outline-none focus:ring-2 focus:ring-[#0e7490]/50 dark:hover:bg-[#123a42] ${index === stage ? 'text-[#0e7490]' : 'text-[var(--muted-foreground)]'}`}><span className={`relative mx-auto grid h-8 w-8 place-items-center rounded-full border-2 transition ${index <= stage ? 'border-[#0e7490] bg-[#0e7490] text-white' : 'border-[var(--card-border)] bg-[var(--card)] group-hover:border-[#0e7490]'}`}>{index + 1}</span><span className="mt-2 block">{label}</span></button></li>)}</ol>
        <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-1.5"><span className="pl-2 text-xs font-bold text-[var(--muted-foreground)]">{c.guidance}</span><div className="flex gap-1" role="group" aria-label={c.guidance}><button type="button" aria-pressed={guidanceMode === 'hint'} onClick={() => changeGuidanceMode('hint')} className={`min-h-9 rounded-lg px-3 text-xs font-bold transition ${guidanceMode === 'hint' ? 'bg-[#0e7490] text-white' : 'text-[var(--muted-foreground)] hover:bg-[var(--card)]'}`}>{c.hintMode}</button><button type="button" aria-pressed={guidanceMode === 'correction'} onClick={() => changeGuidanceMode('correction')} className={`min-h-9 rounded-lg px-3 text-xs font-bold transition ${guidanceMode === 'correction' ? 'bg-[#0e7490] text-white' : 'text-[var(--muted-foreground)] hover:bg-[var(--card)]'}`}>{c.correctionMode}</button></div></div>
        <div className="grid gap-2 sm:grid-cols-2"><button type="button" disabled={Boolean(loadingMode)} onClick={() => review(feedback ? 'recheck' : 'diagnose')} className="min-h-12 rounded-xl bg-[#0e7490] px-4 text-sm font-bold text-white shadow-md shadow-cyan-950/15 disabled:opacity-50">{loadingMode === 'diagnose' || loadingMode === 'recheck' ? c.analysing : feedback ? c.recheck : c.diagnose}</button><button type="button" disabled={Boolean(loadingMode)} onClick={() => review('upgrade')} className="min-h-12 rounded-xl border-2 border-[#0e7490] px-4 text-sm font-bold text-[#0e7490] disabled:opacity-40 dark:text-[#67e8f9]">{loadingMode === 'upgrade' ? c.upgrading : c.upgrade}</button></div>
        {message && <p role="status" className="mt-4 rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-3 text-sm leading-6 text-[var(--muted-foreground)]">{message} {/config|配置|API key/i.test(message) && <Link href="/settings" className="ml-1 font-bold text-[#0e7490] underline">{c.settings}</Link>}</p>}
        <details open={externalPanelOpen} onToggle={(event) => setExternalPanelOpen(event.currentTarget.open)} data-writing-external-ai className="mt-4 space-y-3 border-t border-[#f0b84b] pt-4"><summary className="cursor-pointer text-sm font-bold text-[#b45309] dark:text-[#fbbf24]">{c.external}</summary><div className="space-y-3 pt-3"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#d97706] text-white"><span className="material-icons-round">swap_horiz</span></span><div><h3 className="font-semibold">{externalFallbackMode ? c.fallbackTitle : c.externalTitle}</h3><p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">{externalFallbackMode ? c.fallbackBody : c.externalBody}</p></div></div><label className="flex items-center justify-between gap-3 rounded-xl bg-[var(--background)] px-3 py-2 text-xs font-semibold"><span>{c.responseFormat}</span><select value={responseFormat} onChange={(event) => { setResponseFormat(event.target.value as 'json' | 'markdown'); setRepairPromptMode(false); }} className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-2 py-1"><option value="json">{c.json}</option><option value="markdown">{c.markdown}</option></select></label><button type="button" onClick={copyExternalPrompt} className="min-h-11 w-full rounded-xl bg-[#d97706] px-4 text-sm font-bold text-white"><span className="material-icons-round mr-2 align-middle text-lg">content_copy</span>{promptCopied ? c.copied : c.copyPrompt}</button><details className="rounded-xl border border-[var(--card-border)]"><summary className="cursor-pointer px-3 py-3 text-xs font-bold text-[var(--muted-foreground)]">{c.promptPreview}</summary><textarea readOnly value={externalPrompt} rows={7} onFocus={(event) => event.currentTarget.select()} className="w-full resize-y border-t border-[var(--card-border)] bg-[var(--background)] p-3 font-mono text-xs leading-5 outline-none" /></details><textarea value={externalReply} onChange={(event) => setExternalReply(event.target.value)} rows={7} aria-label={c.pasteReply} placeholder={c.pasteReply} className="w-full resize-y rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-3 font-mono text-xs leading-5 outline-none focus:border-[#d97706] focus:ring-4 focus:ring-[#d97706]/10" /><button type="button" disabled={!hydrated || Boolean(loadingMode)} onClick={importExternalReply} className="min-h-11 w-full rounded-xl border-2 border-[#d97706] px-4 text-sm font-bold text-[#b45309] dark:text-[#fbbf24]">{c.importReply}</button></div></details>
      </article>

      {markdownReport && <article className="max-h-[calc(100dvh-300px)] overflow-y-auto rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5" data-writing-markdown-report><h3 className="mb-3 font-semibold">{c.report}</h3><pre className="whitespace-pre-wrap break-words text-sm leading-6">{markdownReport}</pre></article>}
      {feedback ? <article className="max-h-[calc(100dvh-300px)] overflow-y-auto rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-[0_14px_45px_rgba(15,23,42,.07)] dark:shadow-none" data-scroll-region>
        <p className="text-sm leading-6 text-[var(--muted-foreground)]">{feedback.summary}</p>
        {feedback.priorities.length > 0 && <div className="mt-4 rounded-2xl border border-[#a7e2ca] bg-[#effcf7] p-3.5 dark:border-[#24634d] dark:bg-[#123a2d]"><p className="text-xs font-bold uppercase tracking-[.12em] text-[#147352] dark:text-[#86efac]">{c.priority}</p><ul className="mt-2 space-y-1 text-sm">{feedback.priorities.map((priority) => <li key={priority}>• {priority}</li>)}</ul></div>}
        <div className="mt-4 space-y-3">{feedback.issues.map((issue) => <section key={issue.id} className={`rounded-2xl border p-3.5 transition ${activeIssueId === issue.id ? 'border-[#ea580c] bg-[#fff7ed] ring-2 ring-[#fb923c]/30 dark:bg-[#431407]' : resolved.includes(issue.id) ? 'border-[#8acbb3] bg-[#eefaf5] opacity-65 dark:bg-[#123a2d]' : 'border-[var(--card-border)]'}`}><div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${issue.severity === 'high' ? 'bg-[#dc2626]' : issue.severity === 'medium' ? 'bg-[#f59e0b]' : 'bg-[#0284c7]'}`} /><p className="text-[11px] font-bold uppercase tracking-[.08em]">{issue.category}</p><button type="button" onClick={() => setResolved((items) => items.includes(issue.id) ? items.filter((id) => id !== issue.id) : [...items, issue.id])} className="ml-auto text-xs font-bold text-[#0e7490]">{resolved.includes(issue.id) ? c.undo : c.resolved}</button></div><button type="button" onClick={() => locateIssue(issue.id)} className="mt-3 block w-full rounded-xl border-l-4 border-[#38bdf8] bg-[var(--background)] px-3 py-2 text-left font-serif text-sm italic leading-6 transition hover:bg-[#e0f2fe] focus:outline-none focus:ring-2 focus:ring-[#0e7490] dark:hover:bg-[#16384c]" title={c.locateIssue}>“{currentQuote(issue.id, issue.quote)}”<span className="material-icons-round ml-2 align-middle text-base not-italic text-[#0e7490]">my_location</span></button><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">{issue.explanation}</p><p className="mt-2 rounded-xl bg-[var(--background)] p-3 text-sm font-medium leading-6"><span className="font-bold text-[#0e7490]">{issue.correction ? c.corrected : c.think}</span> {issue.correction ?? issue.selfRevisionPrompt}</p></section>)}</div>
        {feedback.upgrades.length > 0 && <div className="mt-5 space-y-3"><h3 className="font-semibold">{c.upgrades}</h3>{feedback.upgrades.map((upgrade, index) => { const upgradeId = `upgrade-${index}`; return <button type="button" key={`${upgrade.original}-${index}`} onClick={() => locateIssue(upgradeId)} className={`block w-full rounded-2xl border p-3.5 text-left transition hover:border-[#0e7490] focus:outline-none focus:ring-2 focus:ring-[#0e7490]/50 ${activeIssueId === upgradeId ? 'border-[#ea580c] bg-[#fff7ed] ring-2 ring-[#fb923c]/30 dark:bg-[#431407]' : 'border-[var(--card-border)]'}`} title={c.locateIssue}><span className="flex items-center justify-between gap-2"><span className="rounded-full bg-[#fff1d6] px-2 py-1 text-[10px] font-bold uppercase text-[#92400e] dark:bg-[#4a2e0c] dark:text-[#fcd34d]">{upgrade.type}</span><span className="material-icons-round text-lg text-[#0e7490]">my_location</span></span><span className="mt-2 block text-sm line-through opacity-55">{currentQuote(upgradeId, upgrade.original)}</span><span className="mt-1 block text-sm font-semibold text-[#147352] dark:text-[#86efac]">{upgrade.suggestion}</span><span className="mt-1 block text-xs leading-5 text-[var(--muted-foreground)]">{upgrade.why}</span></button>; })}</div>}
      </article> : <article className="rounded-3xl border border-[#abd8e6] bg-[linear-gradient(145deg,#f0faff,#ffffff)] p-5 dark:border-[#24516a] dark:bg-[linear-gradient(145deg,#0b2639,#101820)]"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#0e7490] text-white shadow-lg"><span className="material-icons-round">psychology_alt</span></div><h2 className="mt-4 text-lg font-semibold">{c.emptyTitle}</h2><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">{c.emptyBody}</p></article>}

      <article hidden={focusMode} className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#7c3aed]">{c.transfer}</p><h2 className="mt-1.5 font-semibold">{c.transferTitle}</h2></div><span className="material-icons-round text-[#7c3aed]">north_east</span></div>{recurring.length > 0 ? <div className="mt-3"><p className="text-xs text-[var(--muted-foreground)]">{c.recurring}</p><div className="mt-2 flex flex-wrap gap-2">{recurring.map((key) => <span key={key} className="rounded-full bg-[#f2eafb] px-2.5 py-1 text-xs font-semibold text-[#6b3fa0] dark:bg-[#342347] dark:text-[#d7b8ff]">{key.replaceAll('_', ' ')}</span>)}</div></div> : <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">{c.recurringEmpty}</p>}<button type="button" disabled={!hydrated || Boolean(loadingMode)} onClick={() => startNewEssay(true)} className="mt-4 min-h-11 w-full rounded-xl bg-[#7c3aed] px-4 text-sm font-bold text-white shadow-md shadow-violet-950/15">{c.transferButton}</button></article>
      <article hidden={focusMode} className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e0f2fe] text-[#0369a1] dark:bg-[#16384c] dark:text-[#7dd3fc]"><span className="material-icons-round">shield</span></span><div><p className="text-xs font-bold uppercase tracking-[.12em] text-[#0369a1] dark:text-[#7dd3fc]">{c.safety}</p><h2 className="font-semibold">{c.safetyTitle}</h2></div></div><p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">{c.safetyBody}</p><div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={restoreSnapshot} className="min-h-11 rounded-xl border border-[var(--card-border)] px-3 text-xs font-bold hover:border-[#0e7490]">{c.restore}</button><button type="button" onClick={exportBackup} className="min-h-11 rounded-xl border border-[var(--card-border)] px-3 text-xs font-bold hover:border-[#0e7490]">{c.export}</button></div></article>
    </aside></section>}

    {view === 'library' && <section><div className="mb-4 flex flex-col gap-3 sm:flex-row"><label className="relative flex-1"><span className="material-icons-round absolute left-3 top-3 text-[var(--muted-foreground)]">search</span><input value={archiveQuery} onChange={(event) => setArchiveQuery(event.target.value)} className="min-h-12 w-full rounded-xl border border-[var(--card-border)] bg-[var(--card)] pl-11 pr-4 outline-none focus:border-[#0e7490]" placeholder={uiLanguage === 'en' ? 'Search title, question, or essay' : '搜索标题、题目或正文'} /></label><button type="button" onClick={() => setView('workbench')} className="min-h-12 rounded-xl bg-[#0e7490] px-4 text-sm font-bold text-white"><span className="material-icons-round mr-2 align-middle">edit_note</span>{uiLanguage === 'en' ? 'Back to writing' : '返回写作'}</button></div>{archiveResults.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{archiveResults.map((entry) => <article key={entry.id} className="group rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"><div className="flex items-start justify-between gap-3"><span className="rounded-full bg-[#e0f2fe] px-2.5 py-1 text-xs font-bold text-[#075985] dark:bg-[#16384c] dark:text-[#7dd3fc]">{taskLabel(entry.task)}</span><button type="button" onClick={async () => (await deleteArchivedEssay(entry))} className="grid h-9 w-9 place-items-center rounded-lg text-[var(--muted-foreground)] opacity-60 hover:bg-[#fee2e2] hover:text-[#b91c1c] group-hover:opacity-100" aria-label={`${uiLanguage === 'en' ? 'Delete' : '删除'} ${entry.title}`}><span className="material-icons-round text-lg">delete</span></button></div><h2 className="mt-4 line-clamp-3 font-serif text-xl font-bold leading-snug">{entry.title}</h2><ArchiveTitleEditor entry={entry} onSave={(title) => setArchive((entries) => entries.map((item) => item.id === entry.id ? { ...item, title } : item))} /><p className="mt-3 line-clamp-3 text-sm leading-6 text-[var(--muted-foreground)]">{entry.content}</p><div className="mt-5 flex flex-wrap gap-2 text-xs text-[var(--muted-foreground)]"><span>{entry.wordCount} {uiLanguage === 'en' ? 'words' : '词'}</span>{entry.bandEstimate && <><span>·</span><span>Band {entry.bandEstimate}</span></>}<span>·</span><span>{new Date(entry.savedAt).toLocaleDateString(uiLanguage === 'en' ? 'en-GB' : 'zh-CN')}</span></div><button type="button" onClick={() => openArchivedEssay(entry.id)} className="mt-5 min-h-11 w-full rounded-xl bg-[#0e7490] px-4 text-sm font-bold text-white">{uiLanguage === 'en' ? 'Open in reader' : '打开阅读器'}</button></article>)}</div> : <div className="rounded-3xl border border-dashed border-[var(--card-border)] bg-[var(--card)] p-12 text-center"><span className="material-icons-round text-5xl text-[#5ea9a0]">library_books</span><h2 className="mt-3 text-xl font-bold">{archive.length ? (uiLanguage === 'en' ? 'No matching essays' : '没有匹配的作文') : (uiLanguage === 'en' ? 'Your final library is empty' : '最终稿文库还是空的')}</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[var(--muted-foreground)]">{uiLanguage === 'en' ? 'Return to the workbench and save a finished revision. Saving the same essay again replaces its previous final version.' : '回到写作工作台，完成修改后保存最终稿。同一篇作文再次保存会更新原有最终版本。'}</p></div>}</section>}

    {view === 'reader' && currentArchive && <section className={`overflow-hidden rounded-3xl border border-[var(--card-border)] shadow-sm ${readerThemeClass}`}><div className="flex flex-wrap items-center gap-2 border-b border-black/10 px-4 py-3"><button type="button" onClick={() => setView('library')} className="grid h-10 w-10 place-items-center rounded-xl hover:bg-black/5" aria-label={uiLanguage === 'en' ? 'Back to library' : '返回文库'}><span className="material-icons-round">arrow_back</span></button><button type="button" onClick={() => setReaderFontSize((size) => Math.max(15, size - 1))} className="grid h-10 w-10 place-items-center rounded-xl border border-black/10 font-serif">A−</button><button type="button" onClick={() => setReaderFontSize((size) => Math.min(28, size + 1))} className="grid h-10 w-10 place-items-center rounded-xl border border-black/10 font-serif">A+</button><button type="button" onClick={() => setReaderLineHeight((value) => value >= 2.2 ? 1.5 : Number((value + .2).toFixed(1)))} className="min-h-10 rounded-xl border border-black/10 px-3 text-xs font-bold">{uiLanguage === 'en' ? 'Spacing' : '行距'} {readerLineHeight}</button>{(['paper', 'mint', 'night'] as ReaderTheme[]).map((theme) => <button key={theme} type="button" onClick={() => setReaderTheme(theme)} aria-label={`${theme} theme`} className={`h-8 w-8 rounded-full border-2 ${theme === 'paper' ? 'bg-[#fffdf7]' : theme === 'mint' ? 'bg-[#dff7ed]' : 'bg-[#111827]'} ${readerTheme === theme ? 'border-[#06b6d4]' : 'border-black/15'}`} />)}<button type="button" onClick={() => speakArchivedEssay(currentArchive.content)} className="ml-auto grid h-10 w-10 place-items-center rounded-xl hover:bg-black/5" aria-label={uiLanguage === 'en' ? 'Read aloud' : '朗读全文'}><span className="material-icons-round">volume_up</span></button></div><article className="mx-auto max-w-3xl px-5 py-9 sm:px-10 sm:py-12"><header className="mb-9 text-center"><span className="text-xs font-bold uppercase tracking-[.16em] opacity-60">{taskLabel(currentArchive.task)} · {currentArchive.wordCount} words{currentArchive.bandEstimate ? ` · Band ${currentArchive.bandEstimate}` : ''}</span><h1 className="mt-3 break-words font-serif text-2xl font-bold leading-snug [overflow-wrap:anywhere] sm:text-3xl">{currentArchive.title}</h1><ArchiveTitleEditor key={currentArchive.id} entry={currentArchive} onSave={(title) => setArchive((entries) => entries.map((item) => item.id === currentArchive.id ? { ...item, title } : item))} /><p className="mt-3 text-xs opacity-55">{uiLanguage === 'en' ? 'Final version saved' : '最终稿保存于'} {new Date(currentArchive.savedAt).toLocaleString(uiLanguage === 'en' ? 'en-GB' : 'zh-CN')}</p></header>{currentArchive.question && <aside className="mb-8 rounded-2xl border border-black/10 bg-black/[.035] p-4"><p className="text-xs font-bold uppercase tracking-[.12em] opacity-55">{uiLanguage === 'en' ? 'Question' : '题目'}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 opacity-75">{currentArchive.question}</p></aside>}<div data-writing-reader-content className="space-y-[1.25em] break-words font-serif [overflow-wrap:anywhere]" style={{ fontSize: readerFontSize, lineHeight: readerLineHeight }}>{splitWritingParagraphs(currentArchive.content).map((paragraph, index) => <p key={index} className="whitespace-pre-wrap">{paragraph}</p>)}</div></article></section>}
  </div>;
}
