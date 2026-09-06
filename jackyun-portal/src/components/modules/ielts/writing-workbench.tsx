'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { callAiApi } from '@/lib/ai-config';
import {
  buildWritingReviewPrompt, coerceWritingStage, countWords, diffWriting, findQuotedTextRange, highlightQuotedText, parseWritingFeedback, readFirstValidJson, recurringRuleKeys, targetWords, taskLabel, updateErrorHistory, writeRedundantJson,
  type ErrorHistoryEntry, type ReviewMode, type WritingFeedback, type WritingGuidanceMode, type WritingStage, type WritingTask,
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
type UiLanguage = 'en' | 'zh';
type SaveState = 'saved' | 'error';
type WorkspaceLayout = 'split' | 'stacked';

interface DraftState { essayId: string; task: WritingTask; question: string; essay: string; originalEssay: string; secondsLeft: number; timerStarted: boolean; }
interface DraftSnapshot { savedAt: string; draft: DraftState; }
const defaultDraft: DraftState = { essayId: 'draft-current', task: 'task2', question: '', essay: '', originalEssay: '', secondsLeft: 2400, timerStarted: false };

const COPY = {
  en: {
    title: 'Writing Correction Studio', subtitle: 'Keep the real first attempt. Let AI locate the problems, revise them yourself, then prove the improvement on a new question.',
    timer: 'exam timer', pause: 'Pause timer', start: 'Start timer', reset: 'Reset timer', language: '中文', taskGroup: 'Choose an IELTS Writing task', words: 'words',
    saved: 'Saved now · primary + mirror', saveError: 'Local save failed', question: 'Question', questionPlaceholder: 'Paste the IELTS Writing task here…', essay: 'Your essay', originalLink: 'View original', essayPlaceholder: 'Write your real first attempt independently. Do not ask AI for a model answer first…',
    layout: 'Workspace layout', split: 'Side by side', stacked: 'Top and bottom',
    highlights: 'Editor highlights', highlightsOn: 'Editor highlights on', highlightsOff: 'Editor highlights off', highlightedDraft: 'Quoted issues in your current draft', noQuotedIssues: 'No quoted issue can be matched to the current draft.', locateIssue: 'Show this issue in the editor',
    originalEyebrow: 'Original attempt', originalTitle: 'Locked evidence of your starting point', loop: 'Correction loop', round: 'What to do this round', stageHint: 'Choose any step. Your choice is saved for the next visit.', stages: ['Original', 'Self-revise', 'Upgrade', 'Transfer'],
    diagnose: 'Find my key issues', recheck: 'Check my revision', analysing: 'Analysing…', upgrading: 'Upgrading…', upgrade: 'Language Upgrade', back: 'Previous step', priority: 'Fix first', undo: 'Undo', resolved: 'Mark revised', think: 'Revise it yourself:', corrected: 'Correct version:', upgrades: 'Language upgrades', guidance: 'AI response', hintMode: 'Hints', correctionMode: 'Correct answers',
    emptyTitle: 'AI will not write it for you', emptyBody: 'It quotes the problem, explains why it matters, and gives the smallest useful prompt. Your first attempt is locked when analysis begins.',
    transfer: 'Transfer test', transferTitle: 'The next essay proves mastery', recurring: 'Seen in at least two independent essays:', recurringEmpty: 'An issue in one essay is not automatically a recurring error. It is promoted only after appearing in two independent new essays.', transferButton: 'Start a new transfer essay',
    revision: 'Revision map', revisionTitle: 'What changed since the first attempt', added: 'added', removed: 'removed', noRevision: 'Make a revision to see additions and deletions highlighted here.', currentOnly: 'Run the first analysis to lock an original version for comparison.',
    external: 'External LLM', externalTitle: 'Use ChatGPT, Claude, Gemini, or another model', externalBody: 'Copy a complete prompt containing the task, original attempt, current draft, method, and exact response contract. Paste the model reply back here.', responseFormat: 'Response format', reviewMode: 'Review mode', json: 'Structured JSON · importable', markdown: 'Markdown · readable', modes: ['Diagnose', 'Recheck', 'Upgrade'], copyPrompt: 'Copy complete prompt', copied: 'Prompt copied', promptPreview: 'Preview full prompt', pasteReply: 'Paste the external AI reply here…', importReply: 'Import AI reply', imported: 'External feedback imported.', markdownImported: 'Markdown report saved below.', invalidReply: 'The reply does not match the requested format.', report: 'Imported Markdown report',
    fallbackTitle: 'Continue with an external LLM', fallbackBody: 'The built-in AI call failed. The correct prompt for this step has been copied automatically. Paste it into any LLM, then paste its JSON reply below.',
    safety: 'Draft safety', safetyTitle: 'Three-layer local protection', safetyBody: 'Every edit is written immediately to the primary draft and a mirror copy. Rolling recovery snapshots add another layer.', restore: 'Restore snapshot', export: 'Download backup', noSnapshot: 'No recovery snapshot yet.', restored: 'Latest recovery snapshot restored.',
    tooShort: 'Write at least 80 characters of a real first attempt before asking AI to analyse it.', reviseFirst: 'Revise the essay yourself before requesting another check.', upgradeDone: 'Language upgrades are ready. Keep only expressions that are natural and preserve your meaning.', feedbackDone: 'Feedback is ready. Revise it yourself, then ask AI to check again.', failed: 'AI analysis failed. Please try again.', transferStarted: 'New transfer essay started. Write independently and see whether the old errors decrease.', settings: 'Open settings',
  },
  zh: {
    title: '雅思写作修复工作台', subtitle: '保留真实原稿，让 AI 定位问题；你自己修改，再用一道新题证明这次进步能够迁移。',
    timer: '考试计时', pause: '暂停计时', start: '开始计时', reset: '重置计时', language: 'EN', taskGroup: '选择雅思写作题型', words: '词',
    saved: '刚刚保存 · 主草稿 + 镜像', saveError: '本地保存失败', question: '题目', questionPlaceholder: '粘贴雅思写作题目…', essay: '你的作文', originalLink: '查看原稿', essayPlaceholder: '先独立完成真实写作，不要让 AI 预先生成范文…',
    layout: '工作台布局', split: '左右分栏', stacked: '上下排列',
    highlights: '编辑框高亮', highlightsOn: '编辑框高亮已开启', highlightsOff: '编辑框高亮已关闭', highlightedDraft: '当前稿中被引用的问题', noQuotedIssues: '当前反馈的引用无法在作文中精确匹配。', locateIssue: '在编辑框中定位这个问题',
    originalEyebrow: '真实原稿', originalTitle: '不可覆盖的起点证据', loop: '修复循环', round: '本轮怎么做', stageHint: '可以自由选择任意阶段，刷新后仍会保留。', stages: ['原稿', '自己修改', '语言升级', '新文迁移'],
    diagnose: '让 AI 找关键问题', recheck: '检查我的修改', analysing: '分析中…', upgrading: '升级中…', upgrade: '语言升级', back: '返回上一步', priority: '本轮优先', undo: '撤销', resolved: '标记已改', think: '请自己修改：', corrected: '正确改法：', upgrades: '表达升级', guidance: 'AI 回复方式', hintMode: '只给提示', correctionMode: '给出正确项',
    emptyTitle: 'AI 不会替你写', emptyBody: '它会引用问题片段、解释原因，并给出最小修改提示。首次分析时会锁定你的真实原稿。',
    transfer: '迁移验证', transferTitle: '下一篇才是掌握证明', recurring: '已在至少两篇独立作文出现：', recurringEmpty: '本篇错误不会自动算作反复错误。同类问题至少在两篇独立新作文再次出现才会升级。', transferButton: '开始新题迁移',
    revision: '修订地图', revisionTitle: '原稿到当前稿改了什么', added: '新增', removed: '删除', noRevision: '修改作文后，这里会高亮显示新增与删除的内容。', currentOnly: '首次分析会锁定原稿，之后即可进行版本对比。',
    external: '外部 LLM', externalTitle: '使用 ChatGPT、Claude、Gemini 或其他模型', externalBody: '复制包含题目、原稿、当前稿、方法与精确回复规范的完整提示词，再把外部模型的回复粘贴回来。', responseFormat: '回复格式', reviewMode: '检查模式', json: '结构化 JSON · 可导入', markdown: 'Markdown · 易阅读', modes: ['问题诊断', '修改复查', '语言升级'], copyPrompt: '复制完整提示词', copied: '提示词已复制', promptPreview: '查看完整提示词', pasteReply: '把外部 AI 的回复粘贴到这里…', importReply: '导入 AI 回复', imported: '外部反馈已导入。', markdownImported: 'Markdown 报告已保存在下方。', invalidReply: '回复不符合指定格式。', report: '已导入的 Markdown 报告',
    fallbackTitle: '使用外部 LLM 继续', fallbackBody: '站内 AI 调用失败，当前步骤对应的提示词已经自动复制。请粘贴到任意 LLM，再把它返回的 JSON 粘贴到下方。',
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

export default function WritingWorkbench() {
  const [draft, setDraft] = useState<DraftState>(defaultDraft);
  const [hydrated, setHydrated] = useState(false);
  const [uiLanguage, setUiLanguage] = useState<UiLanguage>('en');
  const [workspaceLayout, setWorkspaceLayout] = useState<WorkspaceLayout>('split');
  const [highlightIssues, setHighlightIssues] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [feedback, setFeedback] = useState<WritingFeedback | null>(null);
  const [feedbackHistory, setFeedbackHistory] = useState<Array<{ feedback: WritingFeedback | null; previousRuleKeys: string[]; resolved: string[]; stage: WritingStage }>>([]);
  const [stage, setStageState] = useState<WritingStage>(0);
  const [guidanceMode, setGuidanceMode] = useState<WritingGuidanceMode>('hint');
  const [previousRuleKeys, setPreviousRuleKeys] = useState<string[]>([]);
  const [history, setHistory] = useState<ErrorHistoryEntry[]>([]);
  const [resolved, setResolved] = useState<string[]>([]);
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);
  const [loadingMode, setLoadingMode] = useState<ReviewMode | null>(null);
  const [message, setMessage] = useState('');
  const [externalReply, setExternalReply] = useState('');
  const [promptCopied, setPromptCopied] = useState(false);
  const [externalFallbackMode, setExternalFallbackMode] = useState<ReviewMode | null>(null);
  const editCount = useRef(0);
  const originalRef = useRef<HTMLDivElement>(null);
  const essayRef = useRef<HTMLTextAreaElement>(null);
  const highlightLayerRef = useRef<HTMLDivElement>(null);
  const c = COPY[uiLanguage];

  function persistDraft(next: DraftState, keepSnapshot = false, reportState = true) {
    try {
      writeRedundantJson(localStorage, DRAFT_KEY, MIRROR_KEY, next);
      if (keepSnapshot) {
        const existing = JSON.parse(localStorage.getItem(SNAPSHOTS_KEY) || '[]') as DraftSnapshot[];
        const snapshots = [{ savedAt: new Date().toISOString(), draft: next }, ...(Array.isArray(existing) ? existing : [])].slice(0, 5);
        localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(snapshots));
      }
      if (reportState) setSaveState('saved');
    } catch { if (reportState) setSaveState('error'); }
  }
  function commitDraft(next: DraftState, keepSnapshot = false) { if (hydrated) persistDraft(next, keepSnapshot); setDraft(next); }
  function editField(field: 'question' | 'essay', value: string) { editCount.current += 1; commitDraft({ ...draft, [field]: value }, editCount.current % 25 === 0); }

  useEffect(() => {
    let storedDraft: DraftState | null = null; let storedHistory: ErrorHistoryEntry[] = []; let storedLanguage: UiLanguage = 'en'; let storedLayout: WorkspaceLayout = 'split'; let storedHighlights = true; let storedStage: WritingStage | null = null; let storedGuidance: WritingGuidanceMode = 'hint';
    try { storedDraft = readStoredDraft(); storedHistory = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') as ErrorHistoryEntry[]; storedLanguage = localStorage.getItem(LANGUAGE_KEY) === 'zh' ? 'zh' : 'en'; storedLayout = localStorage.getItem(LAYOUT_KEY) === 'stacked' ? 'stacked' : 'split'; storedHighlights = localStorage.getItem(HIGHLIGHT_KEY) !== 'off'; storedStage = coerceWritingStage(localStorage.getItem(STAGE_KEY)); storedGuidance = localStorage.getItem(GUIDANCE_KEY) === 'correction' ? 'correction' : 'hint'; } catch { /* Start clean when all local copies are unavailable. */ }
    queueMicrotask(() => { if (storedDraft) setDraft(storedDraft); if (Array.isArray(storedHistory)) setHistory(storedHistory); setUiLanguage(storedLanguage); setWorkspaceLayout(storedLayout); setHighlightIssues(storedHighlights); setStageState(storedStage ?? (storedDraft?.originalEssay ? 1 : 0)); setGuidanceMode(storedGuidance); setHydrated(true); });
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try {
      writeRedundantJson(localStorage, DRAFT_KEY, MIRROR_KEY, draft);
    } catch { /* Immediate handlers report storage errors to the UI. */ }
    // Immediate event handlers are primary; this covers timer and programmatic updates.
  }, [draft, hydrated]);
  useEffect(() => { if (!hydrated) return; try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch { /* Draft copies remain available. */ } }, [history, hydrated]);
  useEffect(() => {
    if (!draft.timerStarted || draft.secondsLeft <= 0) return;
    const interval = window.setInterval(() => setDraft((current) => ({ ...current, secondsLeft: Math.max(0, current.secondsLeft - 1), timerStarted: current.secondsLeft > 1 })), 1000);
    return () => window.clearInterval(interval);
  }, [draft.timerStarted, draft.secondsLeft]);

  const words = useMemo(() => countWords(draft.essay), [draft.essay]);
  const target = targetWords(draft.task);
  const recurring = useMemo(() => recurringRuleKeys(history), [history]);
  const hasChanged = Boolean(draft.originalEssay && draft.essay.trim() !== draft.originalEssay.trim());
  const revision = useMemo(() => draft.originalEssay ? diffWriting(draft.originalEssay, draft.essay) : [], [draft.originalEssay, draft.essay]);
  const addedWords = useMemo(() => revision.filter((part) => part.type === 'added').reduce((sum, part) => sum + countWords(part.text), 0), [revision]);
  const removedWords = useMemo(() => revision.filter((part) => part.type === 'removed').reduce((sum, part) => sum + countWords(part.text), 0), [revision]);
  const highlightedEssay = useMemo(() => highlightQuotedText(draft.essay, [
    ...(feedback?.issues.filter((issue) => !resolved.includes(issue.id)).map((issue) => ({ id: issue.id, quote: issue.quote })) ?? []),
    ...(feedback?.upgrades.map((upgrade, index) => ({ id: `upgrade-${index}`, quote: upgrade.original })) ?? []),
  ]), [draft.essay, feedback, resolved]);
  const activeExternalMode = externalFallbackMode ?? (!feedback ? 'diagnose' : hasChanged ? 'recheck' : 'upgrade');
  const externalPrompt = useMemo(() => buildWritingReviewPrompt({ ...draft, mode: activeExternalMode, previousRuleKeys, outputLanguage: uiLanguage, responseFormat: 'json', guidanceMode }), [activeExternalMode, draft, guidanceMode, previousRuleKeys, uiLanguage]);
  function toggleLanguage() { const next = uiLanguage === 'en' ? 'zh' : 'en'; setUiLanguage(next); try { localStorage.setItem(LANGUAGE_KEY, next); } catch { setSaveState('error'); } }
  function changeLayout(next: WorkspaceLayout) { setWorkspaceLayout(next); try { localStorage.setItem(LAYOUT_KEY, next); } catch { setSaveState('error'); } }
  function toggleHighlights() { const next = !highlightIssues; setHighlightIssues(next); try { localStorage.setItem(HIGHLIGHT_KEY, next ? 'on' : 'off'); } catch { setSaveState('error'); } }
  function changeStage(next: WritingStage) { setStageState(next); try { localStorage.setItem(STAGE_KEY, String(next)); } catch { setSaveState('error'); } }
  function changeGuidanceMode(next: WritingGuidanceMode) { setGuidanceMode(next); try { localStorage.setItem(GUIDANCE_KEY, next); } catch { setSaveState('error'); } }
  function syncEditorScroll() {
    if (!essayRef.current || !highlightLayerRef.current) return;
    highlightLayerRef.current.style.transform = `translate(${-essayRef.current.scrollLeft}px, ${-essayRef.current.scrollTop}px)`;
  }
  function locateIssue(issueId: string, quote: string) {
    const range = findQuotedTextRange(draft.essay, quote);
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
    const prompt = buildWritingReviewPrompt({ ...draft, mode, previousRuleKeys, outputLanguage: uiLanguage, responseFormat: 'json', guidanceMode });
    setExternalFallbackMode(mode); setExternalReply(''); setPromptCopied(false);
    try { await navigator.clipboard.writeText(prompt); setPromptCopied(true); } catch { /* Prompt remains available in the preview. */ }
  }

  async function review(mode: ReviewMode) {
    if (draft.essay.trim().length < 80) { setMessage(c.tooShort); return; }
    if (mode === 'recheck' && !hasChanged) { setMessage(c.reviseFirst); return; }
    setLoadingMode(mode); setMessage('');
    const originalEssay = draft.originalEssay || draft.essay;
    if (!draft.originalEssay) commitDraft({ ...draft, originalEssay: draft.essay }, true);
    try {
      const prompt = buildWritingReviewPrompt({ ...draft, originalEssay, mode, previousRuleKeys, outputLanguage: uiLanguage, guidanceMode });
      const response = await callAiApi([{ role: 'system', content: 'You diagnose IELTS Writing. Return only the requested JSON and never write a complete replacement essay.' }, { role: 'user', content: prompt }], { temperature: 0.15, maxTokens: 4200, feature: 'reasoning' });
      if (!response.ok) { const raw = await response.text(); let errorMessage = ''; try { errorMessage = JSON.parse(raw)?.error?.message || ''; } catch { errorMessage = raw; } throw new Error(errorMessage || c.failed); }
      const data = await response.json();
      const result = parseWritingFeedback(data.choices?.[0]?.message?.content || '');
      const keys = result.issues.map((issue) => issue.ruleKey);
      setFeedbackHistory((current) => [...current, { feedback, previousRuleKeys, resolved, stage }].slice(-10)); setFeedback(result); setResolved([]); setPreviousRuleKeys(keys); setHistory((current) => updateErrorHistory(current, draft.essayId, keys)); changeStage(mode === 'upgrade' || result.readyForUpgrade ? 2 : 1); setExternalFallbackMode(null); setMessage(mode === 'upgrade' ? c.upgradeDone : c.feedbackDone);
    } catch (error) { setMessage(error instanceof Error ? error.message : c.failed); void showExternalFallback(mode); } finally { setLoadingMode(null); }
  }
  function goBack() {
    if (externalFallbackMode) { setExternalFallbackMode(null); setExternalReply(''); setMessage(''); return; }
    const previous = feedbackHistory.at(-1);
    if (!previous) return;
    setFeedback(previous.feedback); setPreviousRuleKeys(previous.previousRuleKeys); setResolved(previous.resolved); changeStage(previous.stage); setHistory((current) => updateErrorHistory(current, draft.essayId, previous.previousRuleKeys)); setFeedbackHistory((current) => current.slice(0, -1)); setMessage('');
  }
  function startTransferEssay() { const next = { ...defaultDraft, essayId: newEssayId(), task: draft.task, secondsLeft: draft.task === 'task2' ? 2400 : 1200 }; commitDraft(next, true); setFeedback(null); setFeedbackHistory([]); setPreviousRuleKeys([]); setResolved([]); setActiveIssueId(null); changeStage(0); setMessage(c.transferStarted); }
  function restoreSnapshot() { try { const snapshots = JSON.parse(localStorage.getItem(SNAPSHOTS_KEY) || '[]') as DraftSnapshot[]; const latest = snapshots.find((item) => validDraft(item?.draft)); if (!latest) { setMessage(c.noSnapshot); return; } commitDraft(latest.draft); setMessage(c.restored); } catch { setMessage(c.noSnapshot); } }
  function exportBackup() { const payload = JSON.stringify({ exportedAt: new Date().toISOString(), draft, history }, null, 2); const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `ielts-writing-${draft.essayId}.json`; anchor.click(); URL.revokeObjectURL(url); }
  async function copyExternalPrompt() { try { await navigator.clipboard.writeText(externalPrompt); setPromptCopied(true); window.setTimeout(() => setPromptCopied(false), 1800); } catch { setMessage(uiLanguage === 'en' ? 'Clipboard access failed. Select the prompt preview and copy it manually.' : '无法访问剪贴板，请在提示词预览中手动复制。'); } }
  function importExternalReply() {
    if (!externalReply.trim()) { setMessage(c.invalidReply); return; }
    try {
      const result = parseWritingFeedback(externalReply);
      const keys = result.issues.map((issue) => issue.ruleKey);
      setFeedbackHistory((current) => [...current, { feedback, previousRuleKeys, resolved, stage }].slice(-10)); setFeedback(result); setResolved([]); setPreviousRuleKeys(keys); setHistory((current) => updateErrorHistory(current, draft.essayId, keys)); changeStage(result.readyForUpgrade ? 2 : 1); setExternalFallbackMode(null); setMessage(c.imported);
      if (!draft.originalEssay) commitDraft({ ...draft, originalEssay: draft.essay }, true);
    } catch { setMessage(c.invalidReply); }
  }
  return <div data-ielts-writing-workbench className="relative mx-auto max-w-[1540px] space-y-5 text-[var(--foreground)]">
    <header className="relative isolate overflow-hidden rounded-[28px] bg-[linear-gradient(118deg,#071b33_0%,#0b3150_56%,#075985_100%)] px-5 py-6 text-white shadow-[0_24px_70px_rgba(7,27,51,.28)] sm:px-8 sm:py-7">
      <div className="pointer-events-none absolute -right-20 -top-32 -z-10 h-80 w-80 rounded-full bg-[#38bdf8]/20 blur-3xl" /><div className="pointer-events-none absolute bottom-0 left-1/3 -z-10 h-24 w-80 bg-[#f59e0b]/10 blur-3xl" />
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between"><div className="max-w-3xl"><div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[.22em] text-[#7dd3fc]"><span className="grid h-7 w-7 place-items-center rounded-lg bg-white/10"><span className="material-icons-round text-base">edit_note</span></span>IELTS Writing Lab</div><h1 className="text-3xl font-bold tracking-[-.035em] sm:text-[2.4rem]">{c.title}</h1><p className="mt-3 max-w-2xl text-[15px] leading-7 text-[#c7dff0]">{c.subtitle}</p></div>
        <div className="flex flex-wrap items-center gap-3"><button type="button" onClick={toggleLanguage} className="min-h-11 rounded-xl border border-white/20 bg-white/10 px-4 text-sm font-bold backdrop-blur hover:bg-white/15"><span className="material-icons-round mr-2 align-middle text-lg">translate</span>{c.language}</button><div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-3 py-2.5 backdrop-blur"><button type="button" onClick={() => commitDraft({ ...draft, timerStarted: !draft.timerStarted })} className="grid h-11 w-11 place-items-center rounded-xl bg-[#fbbf24] text-[#071b33] shadow-lg shadow-amber-950/20" aria-label={draft.timerStarted ? c.pause : c.start}><span className="material-icons-round">{draft.timerStarted ? 'pause' : 'play_arrow'}</span></button><div className="min-w-20"><p className="font-mono text-2xl font-bold tabular-nums">{formatTime(draft.secondsLeft)}</p><p className="text-[11px] uppercase tracking-wider text-[#a9cce1]">{c.timer}</p></div><button type="button" onClick={() => commitDraft({ ...draft, timerStarted: false, secondsLeft: draft.task === 'task2' ? 2400 : 1200 })} className="grid h-10 w-10 place-items-center rounded-xl text-[#d5e9f5] hover:bg-white/10" aria-label={c.reset}><span className="material-icons-round text-xl">restart_alt</span></button></div></div></div>
    </header>

    <section className={`grid gap-5 ${workspaceLayout === 'split' ? 'xl:h-[calc(100dvh-24rem)] xl:min-h-[360px] xl:grid-cols-[minmax(0,1.3fr)_minmax(440px,1fr)] xl:overflow-hidden' : 'grid-cols-1'}`}><div className={`min-w-0 space-y-5 ${workspaceLayout === 'split' ? 'xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain xl:pr-1 xl:pb-6' : ''}`} data-scroll-region={workspaceLayout === 'split' ? true : undefined}>
      <article className="overflow-hidden rounded-3xl border border-[var(--card-border)] bg-[var(--card)] shadow-[0_14px_45px_rgba(15,23,42,.07)] dark:shadow-none"><div className="flex flex-col gap-4 border-b border-[var(--card-border)] bg-[linear-gradient(90deg,rgba(14,116,144,.06),transparent)] p-4 sm:px-6"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="flex flex-wrap gap-2" role="group" aria-label={c.taskGroup}>{(['task1-academic', 'task1-general', 'task2'] as WritingTask[]).map((task) => <button type="button" key={task} onClick={() => updateTask(task)} className={`min-h-11 rounded-xl px-3.5 text-sm font-semibold transition ${draft.task === task ? 'bg-[#0e7490] text-white shadow-md shadow-cyan-950/15' : 'border border-transparent bg-[var(--background)] text-[var(--muted-foreground)] hover:border-[#67b9cc]'}`}>{taskLabel(task)}</button>)}</div><div className="flex items-center gap-3 text-sm"><span className={`rounded-full px-3 py-1.5 font-bold ${words >= target ? 'bg-[#dcfce7] text-[#166534] dark:bg-[#143f2a] dark:text-[#86efac]' : 'bg-[var(--background)] text-[var(--muted-foreground)]'}`}>{words} / {target}+ {c.words}</span><span className={`flex items-center gap-1.5 text-xs font-semibold ${saveState === 'error' ? 'text-[#dc2626]' : 'text-[#16845b]'}`}><span className="material-icons-round text-base">{saveState === 'error' ? 'cloud_off' : 'verified'}</span>{saveState === 'error' ? c.saveError : c.saved}</span></div></div><div className="flex items-center gap-2"><span className="mr-1 text-xs font-bold uppercase tracking-[.08em] text-[var(--muted-foreground)]">{c.layout}</span><button type="button" aria-pressed={workspaceLayout === 'split'} onClick={() => changeLayout('split')} className={`flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-bold ${workspaceLayout === 'split' ? 'bg-[#0e7490] text-white' : 'border border-[var(--card-border)] bg-[var(--background)] text-[var(--muted-foreground)]'}`}><span className="material-icons-round text-lg">view_sidebar</span>{c.split}</button><button type="button" aria-pressed={workspaceLayout === 'stacked'} onClick={() => changeLayout('stacked')} className={`flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-bold ${workspaceLayout === 'stacked' ? 'bg-[#0e7490] text-white' : 'border border-[var(--card-border)] bg-[var(--background)] text-[var(--muted-foreground)]'}`}><span className="material-icons-round text-lg">view_agenda</span>{c.stacked}</button></div></div>
        <div className="space-y-5 p-4 sm:p-6">
          <label className="block"><span className="mb-2 block text-sm font-bold uppercase tracking-[.08em] text-[var(--muted-foreground)]">{c.question}</span><textarea value={draft.question} onChange={(event) => editField('question', event.target.value)} rows={3} placeholder={c.questionPlaceholder} className="w-full resize-y rounded-2xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-3.5 text-base leading-7 outline-none transition focus:border-[#0e7490] focus:ring-4 focus:ring-[#0e7490]/10" /></label>
          <div className="block"><div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm font-bold uppercase tracking-[.08em] text-[var(--muted-foreground)]"><span id="ielts-essay-label">{c.essay}</span><span className="flex items-center gap-2"><button type="button" aria-pressed={highlightIssues} onClick={toggleHighlights} className={`flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold normal-case tracking-normal ${highlightIssues ? 'bg-[#fef3c7] text-[#92400e] dark:bg-[#4a2e0c] dark:text-[#fcd34d]' : 'border border-[var(--card-border)] text-[var(--muted-foreground)]'}`}><span className="material-icons-round text-base">highlight</span>{highlightIssues ? c.highlightsOn : c.highlightsOff}</button>{draft.originalEssay && <button type="button" onClick={() => originalRef.current?.scrollIntoView({ behavior: 'smooth' })} className="normal-case font-semibold tracking-normal text-[#0e7490] hover:underline">{c.originalLink}</button>}</span></div><div className="relative block overflow-hidden rounded-2xl bg-[var(--background)]"><div aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden rounded-2xl border border-transparent ${highlightIssues && highlightedEssay.some((part) => part.highlighted) ? 'opacity-100' : 'opacity-0'}`}><div ref={highlightLayerRef} className="block min-h-[500px] whitespace-pre-wrap break-words px-5 py-5 font-serif text-[18px] leading-[2] text-[var(--foreground)] sm:px-7">{highlightedEssay.map((part, index) => part.highlighted ? <mark key={index} data-issue-ids={part.issueIds.join(' ')} className={`rounded px-0.5 text-inherit ${activeIssueId && part.issueIds.includes(activeIssueId) ? 'bg-[#fb923c] ring-2 ring-[#ea580c]/60 dark:bg-[#c2410c]' : 'bg-[#fde68a] ring-1 ring-[#f59e0b]/35 dark:bg-[#854d0e]'}`}>{part.text}</mark> : <span key={index}>{part.text}</span>)}</div></div><textarea aria-labelledby="ielts-essay-label" ref={essayRef} value={draft.essay} onChange={(event) => { setActiveIssueId(null); editField('essay', event.target.value); }} onScroll={syncEditorScroll} rows={20} spellCheck lang="en" placeholder={c.essayPlaceholder} className={`relative min-h-[500px] w-full resize-y rounded-2xl border border-[var(--card-border)] bg-transparent px-5 py-5 font-serif text-[18px] leading-[2] caret-[var(--foreground)] outline-none transition selection:bg-[#38bdf8]/45 focus:border-[#0e7490] focus:ring-4 focus:ring-[#0e7490]/10 sm:px-7 ${highlightIssues && highlightedEssay.some((part) => part.highlighted) ? 'text-transparent' : 'text-[var(--foreground)]'}`} /></div></div>
          {feedback && <section className="rounded-2xl border border-[#f5c34f] bg-[#fffbeb] p-4 dark:border-[#755615] dark:bg-[#2f270f]"><div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[.1em] text-[#92400e] dark:text-[#fcd34d]"><span className="material-icons-round text-lg">format_ink_highlighter</span>{c.highlightedDraft}</div>{highlightedEssay.some((part) => part.highlighted) ? <p className="whitespace-pre-wrap font-serif text-[17px] leading-8 text-[var(--foreground)]">{highlightedEssay.map((part, index) => part.highlighted ? <mark key={index} className="rounded bg-[#fde68a] px-0.5 text-[#713f12] ring-1 ring-[#f59e0b]/35 dark:bg-[#854d0e] dark:text-[#fef3c7]">{part.text}</mark> : <span key={index}>{part.text}</span>)}</p> : <p className="text-sm text-[var(--muted-foreground)]">{c.noQuotedIssues}</p>}</section>}
        </div>
      </article>
      <article className="overflow-hidden rounded-3xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm"><div className="flex flex-col gap-3 border-b border-[var(--card-border)] p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#7c3aed]">{c.revision}</p><h2 className="mt-1.5 text-lg font-semibold">{c.revisionTitle}</h2></div>{draft.originalEssay && <div className="flex gap-2"><span className="rounded-full bg-[#dcfce7] px-3 py-1 text-xs font-bold text-[#166534] dark:bg-[#143f2a] dark:text-[#86efac]">+{addedWords} {c.added}</span><span className="rounded-full bg-[#fee2e2] px-3 py-1 text-xs font-bold text-[#991b1b] dark:bg-[#471c1c] dark:text-[#fca5a5]">−{removedWords} {c.removed}</span></div>}</div><div className="min-h-28 p-5 font-serif text-[17px] leading-8">{!draft.originalEssay ? <p className="font-sans text-sm text-[var(--muted-foreground)]">{c.currentOnly}</p> : !hasChanged ? <p className="font-sans text-sm text-[var(--muted-foreground)]">{c.noRevision}</p> : <p className="whitespace-pre-wrap">{revision.map((part, index) => part.type === 'added' ? <ins key={index} className="rounded bg-[#bbf7d0] px-0.5 text-[#14532d] no-underline dark:bg-[#14532d] dark:text-[#bbf7d0]">{part.text}</ins> : part.type === 'removed' ? <del key={index} className="rounded bg-[#fecaca] px-0.5 text-[#7f1d1d] decoration-2 dark:bg-[#7f1d1d] dark:text-[#fecaca]">{part.text}</del> : <span key={index}>{part.text}</span>)}</p>}</div></article>
      {draft.originalEssay && <article ref={originalRef} className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm sm:p-6"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#0e7490]">{c.originalEyebrow}</p><h2 className="mt-1.5 text-lg font-semibold">{c.originalTitle}</h2></div><span className="rounded-full bg-[#e0f2fe] px-3 py-1 text-xs font-bold text-[#075985] dark:bg-[#16384c] dark:text-[#7dd3fc]">{countWords(draft.originalEssay)} {c.words}</span></div><p className="mt-5 whitespace-pre-wrap font-serif text-[17px] leading-8 text-[var(--muted-foreground)]">{draft.originalEssay}</p></article>}
    </div>

    <aside className={`flex min-w-0 flex-col gap-5 ${workspaceLayout === 'split' ? 'xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain xl:scroll-pb-8 xl:pb-8 xl:pl-1' : ''}`} data-scroll-region={workspaceLayout === 'split' ? true : undefined}>
      <article className="order-1 shrink-0 rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-[0_14px_45px_rgba(15,23,42,.07)] dark:shadow-none">
        <div className="mb-4 flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#d97706]">{c.loop}</p><h2 className="mt-1.5 text-xl font-semibold">{c.round}</h2><p className="mt-1 text-xs text-[var(--muted-foreground)]">{c.stageHint}</p></div><div className="flex items-center gap-2">{(feedbackHistory.length > 0 || externalFallbackMode) && <button type="button" onClick={goBack} className="flex min-h-9 items-center gap-1 rounded-xl border border-[var(--card-border)] px-3 text-xs font-bold text-[var(--muted-foreground)] hover:border-[#d97706] hover:text-[#b45309]"><span className="material-icons-round text-base">arrow_back</span>{c.back}</button>}{feedback && <span className="rounded-xl bg-[#fff1d6] px-3 py-1.5 text-sm font-bold text-[#92400e] dark:bg-[#4a2e0c] dark:text-[#fcd34d]">Band {feedback.bandEstimate}</span>}</div></div>
        <ol className="relative mb-5 grid grid-cols-4 gap-1 text-center text-[11px] font-bold"><span className="absolute left-[12%] right-[12%] top-4 h-px bg-[var(--card-border)]" />{c.stages.map((label, index) => <li key={label} className="relative"><button type="button" aria-pressed={index === stage} onClick={() => changeStage(index as WritingStage)} className={`group w-full rounded-xl px-1 py-1.5 transition hover:bg-[#ecfeff] focus:outline-none focus:ring-2 focus:ring-[#0e7490]/50 dark:hover:bg-[#123a42] ${index === stage ? 'text-[#0e7490]' : 'text-[var(--muted-foreground)]'}`}><span className={`relative mx-auto grid h-8 w-8 place-items-center rounded-full border-2 transition ${index <= stage ? 'border-[#0e7490] bg-[#0e7490] text-white' : 'border-[var(--card-border)] bg-[var(--card)] group-hover:border-[#0e7490]'}`}>{index + 1}</span><span className="mt-2 block">{label}</span></button></li>)}</ol>
        <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-1.5"><span className="pl-2 text-xs font-bold text-[var(--muted-foreground)]">{c.guidance}</span><div className="flex gap-1" role="group" aria-label={c.guidance}><button type="button" aria-pressed={guidanceMode === 'hint'} onClick={() => changeGuidanceMode('hint')} className={`min-h-9 rounded-lg px-3 text-xs font-bold transition ${guidanceMode === 'hint' ? 'bg-[#0e7490] text-white' : 'text-[var(--muted-foreground)] hover:bg-[var(--card)]'}`}>{c.hintMode}</button><button type="button" aria-pressed={guidanceMode === 'correction'} onClick={() => changeGuidanceMode('correction')} className={`min-h-9 rounded-lg px-3 text-xs font-bold transition ${guidanceMode === 'correction' ? 'bg-[#0e7490] text-white' : 'text-[var(--muted-foreground)] hover:bg-[var(--card)]'}`}>{c.correctionMode}</button></div></div>
        <div className="grid gap-2 sm:grid-cols-2"><button type="button" disabled={Boolean(loadingMode)} onClick={() => review(feedback ? 'recheck' : 'diagnose')} className="min-h-12 rounded-xl bg-[#0e7490] px-4 text-sm font-bold text-white shadow-md shadow-cyan-950/15 disabled:opacity-50">{loadingMode === 'diagnose' || loadingMode === 'recheck' ? c.analysing : feedback ? c.recheck : c.diagnose}</button><button type="button" disabled={Boolean(loadingMode) || !feedback} onClick={() => review('upgrade')} className="min-h-12 rounded-xl border-2 border-[#0e7490] px-4 text-sm font-bold text-[#0e7490] disabled:opacity-40 dark:text-[#67e8f9]">{loadingMode === 'upgrade' ? c.upgrading : c.upgrade}</button></div>
        {message && <p role="status" className="mt-4 rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-3 text-sm leading-6 text-[var(--muted-foreground)]">{message} {/config|配置|API key/i.test(message) && <Link href="/settings" className="ml-1 font-bold text-[#0e7490] underline">{c.settings}</Link>}</p>}
        {externalFallbackMode && <div className="mt-4 space-y-3 border-t border-[#f0b84b] pt-4"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#d97706] text-white"><span className="material-icons-round">swap_horiz</span></span><div><h3 className="font-semibold">{c.fallbackTitle}</h3><p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">{c.fallbackBody}</p></div></div><button type="button" onClick={copyExternalPrompt} className="min-h-11 w-full rounded-xl bg-[#d97706] px-4 text-sm font-bold text-white"><span className="material-icons-round mr-2 align-middle text-lg">content_copy</span>{promptCopied ? c.copied : c.copyPrompt}</button><details className="rounded-xl border border-[var(--card-border)]"><summary className="cursor-pointer px-3 py-3 text-xs font-bold text-[var(--muted-foreground)]">{c.promptPreview}</summary><textarea readOnly value={externalPrompt} rows={7} onFocus={(event) => event.currentTarget.select()} className="w-full resize-y border-t border-[var(--card-border)] bg-[var(--background)] p-3 font-mono text-xs leading-5 outline-none" /></details><textarea value={externalReply} onChange={(event) => setExternalReply(event.target.value)} rows={7} placeholder={c.pasteReply} className="w-full resize-y rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-3 font-mono text-xs leading-5 outline-none focus:border-[#d97706] focus:ring-4 focus:ring-[#d97706]/10" /><button type="button" onClick={importExternalReply} className="min-h-11 w-full rounded-xl border-2 border-[#d97706] px-4 text-sm font-bold text-[#b45309] dark:text-[#fbbf24]">{c.importReply}</button></div>}
      </article>

      {feedback ? <article className="max-h-[calc(100dvh-300px)] overflow-y-auto rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-[0_14px_45px_rgba(15,23,42,.07)] dark:shadow-none" data-scroll-region>
        <p className="text-sm leading-6 text-[var(--muted-foreground)]">{feedback.summary}</p>
        {feedback.priorities.length > 0 && <div className="mt-4 rounded-2xl border border-[#a7e2ca] bg-[#effcf7] p-3.5 dark:border-[#24634d] dark:bg-[#123a2d]"><p className="text-xs font-bold uppercase tracking-[.12em] text-[#147352] dark:text-[#86efac]">{c.priority}</p><ul className="mt-2 space-y-1 text-sm">{feedback.priorities.map((priority) => <li key={priority}>• {priority}</li>)}</ul></div>}
        <div className="mt-4 space-y-3">{feedback.issues.map((issue) => <section key={issue.id} className={`rounded-2xl border p-3.5 transition ${activeIssueId === issue.id ? 'border-[#ea580c] bg-[#fff7ed] ring-2 ring-[#fb923c]/30 dark:bg-[#431407]' : resolved.includes(issue.id) ? 'border-[#8acbb3] bg-[#eefaf5] opacity-65 dark:bg-[#123a2d]' : 'border-[var(--card-border)]'}`}><div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${issue.severity === 'high' ? 'bg-[#dc2626]' : issue.severity === 'medium' ? 'bg-[#f59e0b]' : 'bg-[#0284c7]'}`} /><p className="text-[11px] font-bold uppercase tracking-[.08em]">{issue.category}</p><button type="button" onClick={() => setResolved((items) => items.includes(issue.id) ? items.filter((id) => id !== issue.id) : [...items, issue.id])} className="ml-auto text-xs font-bold text-[#0e7490]">{resolved.includes(issue.id) ? c.undo : c.resolved}</button></div><button type="button" onClick={() => locateIssue(issue.id, issue.quote)} className="mt-3 block w-full rounded-xl border-l-4 border-[#38bdf8] bg-[var(--background)] px-3 py-2 text-left font-serif text-sm italic leading-6 transition hover:bg-[#e0f2fe] focus:outline-none focus:ring-2 focus:ring-[#0e7490] dark:hover:bg-[#16384c]" title={c.locateIssue}>“{issue.quote}”<span className="material-icons-round ml-2 align-middle text-base not-italic text-[#0e7490]">my_location</span></button><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">{issue.explanation}</p><p className="mt-2 rounded-xl bg-[var(--background)] p-3 text-sm font-medium leading-6"><span className="font-bold text-[#0e7490]">{issue.correction ? c.corrected : c.think}</span> {issue.correction ?? issue.selfRevisionPrompt}</p></section>)}</div>
        {feedback.upgrades.length > 0 && <div className="mt-5 space-y-3"><h3 className="font-semibold">{c.upgrades}</h3>{feedback.upgrades.map((upgrade, index) => { const upgradeId = `upgrade-${index}`; return <button type="button" key={`${upgrade.original}-${index}`} onClick={() => locateIssue(upgradeId, upgrade.original)} className={`block w-full rounded-2xl border p-3.5 text-left transition hover:border-[#0e7490] focus:outline-none focus:ring-2 focus:ring-[#0e7490]/50 ${activeIssueId === upgradeId ? 'border-[#ea580c] bg-[#fff7ed] ring-2 ring-[#fb923c]/30 dark:bg-[#431407]' : 'border-[var(--card-border)]'}`} title={c.locateIssue}><span className="flex items-center justify-between gap-2"><span className="rounded-full bg-[#fff1d6] px-2 py-1 text-[10px] font-bold uppercase text-[#92400e] dark:bg-[#4a2e0c] dark:text-[#fcd34d]">{upgrade.type}</span><span className="material-icons-round text-lg text-[#0e7490]">my_location</span></span><span className="mt-2 block text-sm line-through opacity-55">{upgrade.original}</span><span className="mt-1 block text-sm font-semibold text-[#147352] dark:text-[#86efac]">{upgrade.suggestion}</span><span className="mt-1 block text-xs leading-5 text-[var(--muted-foreground)]">{upgrade.why}</span></button>; })}</div>}
      </article> : <article className="rounded-3xl border border-[#abd8e6] bg-[linear-gradient(145deg,#f0faff,#ffffff)] p-5 dark:border-[#24516a] dark:bg-[linear-gradient(145deg,#0b2639,#101820)]"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#0e7490] text-white shadow-lg"><span className="material-icons-round">psychology_alt</span></div><h2 className="mt-4 text-lg font-semibold">{c.emptyTitle}</h2><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">{c.emptyBody}</p></article>}

      <article className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#7c3aed]">{c.transfer}</p><h2 className="mt-1.5 font-semibold">{c.transferTitle}</h2></div><span className="material-icons-round text-[#7c3aed]">north_east</span></div>{recurring.length > 0 ? <div className="mt-3"><p className="text-xs text-[var(--muted-foreground)]">{c.recurring}</p><div className="mt-2 flex flex-wrap gap-2">{recurring.map((key) => <span key={key} className="rounded-full bg-[#f2eafb] px-2.5 py-1 text-xs font-semibold text-[#6b3fa0] dark:bg-[#342347] dark:text-[#d7b8ff]">{key.replaceAll('_', ' ')}</span>)}</div></div> : <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">{c.recurringEmpty}</p>}<button type="button" onClick={startTransferEssay} className="mt-4 min-h-11 w-full rounded-xl bg-[#7c3aed] px-4 text-sm font-bold text-white shadow-md shadow-violet-950/15">{c.transferButton}</button></article>
      <article className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e0f2fe] text-[#0369a1] dark:bg-[#16384c] dark:text-[#7dd3fc]"><span className="material-icons-round">shield</span></span><div><p className="text-xs font-bold uppercase tracking-[.12em] text-[#0369a1] dark:text-[#7dd3fc]">{c.safety}</p><h2 className="font-semibold">{c.safetyTitle}</h2></div></div><p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">{c.safetyBody}</p><div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={restoreSnapshot} className="min-h-11 rounded-xl border border-[var(--card-border)] px-3 text-xs font-bold hover:border-[#0e7490]">{c.restore}</button><button type="button" onClick={exportBackup} className="min-h-11 rounded-xl border border-[var(--card-border)] px-3 text-xs font-bold hover:border-[#0e7490]">{c.export}</button></div></article>
    </aside></section>
  </div>;
}
