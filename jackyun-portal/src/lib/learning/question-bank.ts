import { addCalendarDays, dateKey, matchLearningCatalogSubject, type LearningCatalogSubject, type LearningStatus, type LearningTask, type StudyCue } from './schedule-control.ts';

export const QUESTION_BANK_KEY = 'jackyun_schedule_questions_v1';
export type QuestionType = 'single' | 'multiple' | 'boolean' | 'written';
export type QuestionSourceKind = 'pq-instruction' | 'pq-error' | 'pq-example' | 'ai-generated' | 'other';
export type StudyMode = 'cue' | 'question' | 'mixed';
export interface StudyItemRef { kind: 'cue' | 'question'; id: string }
export interface QuestionImage { id: string; url: string; alt: string; placement: 'prompt' | 'answer' }
export interface QuestionImageRequest { id: string; description: string; source: string; placement: 'prompt' | 'answer'; imageId?: string }
export interface StudyQuestion {
  id: string;
  version: number;
  subjectId: string;
  subjectName: string;
  unit: string;
  subsection: string;
  type: QuestionType;
  prompt: string;
  choices: string[];
  correctChoices: number[];
  answer: string;
  explanation: string;
  markingPoints: string[];
  /** Stable notebook-friendly identity, separate from the original source number. */
  code?: string;
  images?: QuestionImage[];
  imageRequests?: QuestionImageRequest[];
  source?: string;
  sourceKind?: QuestionSourceKind;
  number?: string;
  maxScore?: number;
  linkedCueIds: string[];
  sourceCueId?: string;
  createdAt: string;
  updatedAt: string;
}
export interface QuestionReviewState {
  questionVersion?: number;
  status: LearningStatus;
  intervalDays: number;
  easeFactor: number;
  streak: number;
  nextReviewDate: string;
  lastReviewedAt: string;
  scheduleReason: string;
}
export interface QuestionResponse {
  text: string;
  selectedChoices: number[];
  paper: boolean;
  submitted: boolean;
  score?: number;
  issue: string;
}
export interface QuestionAttempt extends QuestionResponse {
  id: string;
  sessionId: string;
  questionId: string;
  questionVersion: number;
  snapshot: StudyQuestion;
  correct: boolean | null;
  status: LearningStatus;
  reviewedAt: string;
  review: QuestionReviewState;
}
export interface StudyDraft {
  id: string;
  mode: StudyMode;
  task: LearningTask;
  items: StudyItemRef[];
  index: number;
  revealed: Record<string, boolean>;
  responses: Record<string, QuestionResponse>;
  questionSnapshots?: Record<string, StudyQuestion>;
  assessments: Record<string, LearningStatus>;
  updatedAt: string;
}
export interface QuestionBankState {
  schemaVersion: 1;
  questions: StudyQuestion[];
  attempts: QuestionAttempt[];
  reviews: Record<string, QuestionReviewState>;
  drafts: Record<string, StudyDraft>;
}
export type QuestionContent = Omit<StudyQuestion, 'id' | 'version' | 'createdAt' | 'updatedAt'>;
export type QuestionOperation = { action: 'create'; question: QuestionContent } | { action: 'update'; id: string; changes: Partial<QuestionContent> };
export type QuestionFilter = 'all' | 'unreviewed' | 'due' | 'weak' | 'partial' | 'unclear' | 'stable' | 'repeated-weak';
export function emptyQuestionBank(): QuestionBankState { return { schemaVersion: 1, questions: [], attempts: [], reviews: {}, drafts: {} }; }
export function itemKey(item: StudyItemRef): string { return `${item.kind}:${item.id}`; }
export function emptyResponse(): QuestionResponse { return { text: '', selectedChoices: [], paper: false, submitted: false, issue: '' }; }
const statuses = new Set(['stable', 'partial', 'unclear']);
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('需要 JSON 对象。');
  return value as Record<string, unknown>;
}
function strings(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) throw new Error(`${name} 必须是字符串数组。`);
  return value.map((item) => item.trim());
}
export function validateQuestion(value: unknown): QuestionContent {
  const raw = object(value);
  const text = (key: string, required = false) => {
    if (raw[key] !== undefined && typeof raw[key] !== 'string') throw new Error(`${key} 必须是文本。`);
    const result = (raw[key] as string | undefined)?.trim() ?? '';
    if (required && !result) throw new Error(`${key} 不能为空。`);
    if (result.length > 50_000) throw new Error(`${key} 超过 50000 字符。`);
    return result;
  };
  const type = raw.type as QuestionType;
  if (!['single', 'multiple', 'boolean', 'written'].includes(type)) throw new Error('题型必须为 single / multiple / boolean / written。');
  const choices = type === 'boolean' ? ['正确', '错误'] : strings(raw.choices ?? [], 'choices');
  if (['single', 'multiple'].includes(type) && (choices.length < 2 || choices.length > 10 || choices.some((choice) => !choice))) throw new Error('选择题需要 2–10 个非空选项。');
  const correctChoices = raw.correctChoices ?? [];
  if (!Array.isArray(correctChoices) || correctChoices.some((index) => !Number.isInteger(index) || index < 0 || index >= choices.length)) throw new Error('正确选项必须使用有效的零起始序号。');
  if (new Set(correctChoices).size !== correctChoices.length || (type !== 'multiple' && correctChoices.length > 1) || (type === 'written' && correctChoices.length)) throw new Error('正确选项数量与题型不符。');
  if (raw.maxScore !== undefined && (typeof raw.maxScore !== 'number' || !Number.isFinite(raw.maxScore) || raw.maxScore <= 0)) throw new Error('满分必须为正数。');
  if (raw.sourceKind !== undefined && !['pq-instruction', 'pq-error', 'pq-example', 'ai-generated', 'other'].includes(raw.sourceKind as string)) throw new Error('sourceKind 必须是 PQ 注意点 / PQ 错题 / PQ 例题 / AI 生成 / 其他。');
  const images = raw.images ?? [];
  if (!Array.isArray(images) || images.length > 6 || images.some((image) => !image || typeof image.id !== 'string' || typeof image.alt !== 'string' || !['prompt', 'answer'].includes(image.placement) || typeof image.url !== 'string' || image.url.length > 2_800_000 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(image.url))) throw new Error('图片需为 PNG / JPEG / WebP，每张最多 2 MB，每题最多 6 张。');
  if (new Set(images.map((image) => image.id)).size !== images.length) throw new Error('图片 id 重复。');
  const imageRequests = raw.imageRequests ?? [];
  if (!Array.isArray(imageRequests) || imageRequests.length > 6 || imageRequests.some((item) => !item || typeof item.id !== 'string' || !item.id.trim() || typeof item.description !== 'string' || !item.description.trim() || item.description.length > 1000 || typeof item.source !== 'string' || item.source.length > 500 || !['prompt', 'answer'].includes(item.placement) || (item.imageId !== undefined && (typeof item.imageId !== 'string' || !images.some((image) => image.id === item.imageId && image.placement === item.placement)))) || new Set(imageRequests.map((item) => item.id)).size !== imageRequests.length) throw new Error('待补图标记需要唯一 id、说明、来源和显示位置；完成标记必须关联对应位置的真实图片。');
  if (text('code') && !/^[A-Z0-9]{1,4}-[A-Z0-9]{3,6}$/.test(text('code'))) throw new Error('短编号格式为科目前缀-序号，例如 MA-001。');
  return {
    ...(text('code') ? { code: text('code') } : {}), ...(images.length ? { images: images as QuestionImage[] } : {}), ...(imageRequests.length ? { imageRequests: imageRequests as QuestionImageRequest[] } : {}),
    subjectId: text('subjectId', true), subjectName: text('subjectName', true), unit: text('unit', true), subsection: text('subsection'), type,
    prompt: text('prompt', true), choices: type === 'written' ? [] : choices, correctChoices: [...correctChoices].sort((a, b) => a - b),
    answer: text('answer'), explanation: text('explanation'), markingPoints: strings(raw.markingPoints ?? [], 'markingPoints'),
    linkedCueIds: [...new Set(strings(raw.linkedCueIds ?? [], 'linkedCueIds'))],
    ...(text('source') ? { source: text('source') } : {}), ...(text('number') ? { number: text('number') } : {}),
    ...(raw.sourceKind ? { sourceKind: raw.sourceKind as QuestionSourceKind } : {}),
    ...(text('sourceCueId') ? { sourceCueId: text('sourceCueId') } : {}), ...(raw.maxScore !== undefined ? { maxScore: raw.maxScore as number } : {}),
  };
}
export function parseQuestionImport(input: unknown, bank: QuestionBankState): QuestionOperation[] {
  const raw = object(input);
  if (raw.version !== 1 || !Array.isArray(raw.operations) || !raw.operations.length) throw new Error('需要 version: 1 和非空 operations。');
  const updated = new Set<string>();
  if (raw.operations.length > 200) throw new Error('一次最多导入 200 项，请分批导入。');
  return raw.operations.map((value, index) => {
    try {
      const operation = object(value);
      if (operation.action === 'create') {
        if (operation.question === undefined) throw new Error(typeof operation.prompt === 'string' && ('display' in operation || 'subtitle' in operation)
          ? '题库 create 缺少 question 对象。这份操作把 prompt 等字段直接写在顶层，属于知识 CUE 格式；请到 CUE 管理导入，或按题库模板让 AI 重新生成完整练习题。'
          : '题库 create 缺少 question 对象；请把题型、题干、答案等字段放在 question 内。');
        return { action: 'create', question: validateQuestion(operation.question) };
      }
      if (operation.action !== 'update' || typeof operation.id !== 'string') throw new Error('操作必须为 create 或带有效 id 的 update。');
      const question = bank.questions.find((item) => item.id === operation.id);
      if (!question || updated.has(question.id)) throw new Error('修改 id 不存在或在本次导入中重复。');
      updated.add(question.id);
      const changes = object(operation.changes);
      const allowed = new Set(['subjectId', 'subjectName', 'unit', 'subsection', 'type', 'prompt', 'choices', 'correctChoices', 'answer', 'explanation', 'markingPoints', 'source', 'sourceKind', 'number', 'maxScore', 'linkedCueIds', 'sourceCueId', 'images', 'imageRequests']);
      if (Object.keys(changes).some((key) => !allowed.has(key))) throw new Error('changes 包含不支持的字段。');
      validateQuestion({ ...question, ...changes });
      return { action: 'update', id: question.id, changes: changes as Partial<QuestionContent> };
    } catch (error) { throw new Error(`第 ${index + 1} 项：${error instanceof Error ? error.message : '格式错误。'}`); }
  });
}
export function applyQuestionOperations(bank: QuestionBankState, operations: QuestionOperation[], now: string, id: () => string): QuestionBankState {
  let questions = [...bank.questions];
  for (const operation of operations) {
    if (operation.action === 'create') {
      const question = { ...validateQuestion(operation.question), code: undefined, id: id(), version: 1, createdAt: now, updatedAt: now };
      if (questions.some((item) => item.id === question.id)) throw new Error('题目 id 重复。');
      questions.push(question);
    } else {
      const prior = questions.find((item) => item.id === operation.id);
      if (!prior) throw new Error('题目已经不存在。');
      const content = validateQuestion({ ...prior, ...operation.changes, code: prior.code });
      questions = questions.map((item) => item.id === prior.id ? { ...content, id: prior.id, version: prior.version + 1, createdAt: prior.createdAt, updatedAt: now } : item);
    }
  }
  return { ...bank, questions: assignQuestionCodes(questions, bank.attempts.map((attempt) => attempt.snapshot)) };
}
export function copyCueToQuestion(cue: StudyCue): QuestionContent {
  return {
    subjectId: cue.subjectId, subjectName: cue.subjectName, unit: cue.unit || '未分单元', subsection: cue.subsection,
    type: cue.choices?.length ? 'single' : 'written', prompt: cue.prompt, choices: cue.choices ?? [],
    correctChoices: cue.correctChoice !== undefined ? [cue.correctChoice] : [], answer: cue.answer ?? '', explanation: cue.subtitle ?? '',
    markingPoints: [...cue.markingPoints], linkedCueIds: [cue.id], sourceCueId: cue.id,
  };
}
export function checkQuestionAnswer(question: StudyQuestion, response: QuestionResponse): boolean | null {
  if (question.type === 'written' || !question.correctChoices.length || !response.submitted || response.paper) return null;
  const selected = [...new Set(response.selectedChoices)].sort((a, b) => a - b);
  return selected.length === question.correctChoices.length && selected.every((value, index) => value === question.correctChoices[index]);
}
export function recordQuestionAttempt(bank: QuestionBankState, questionId: string, sessionId: string, response: QuestionResponse, status: LearningStatus, at: string, submittedSnapshot?: StudyQuestion): QuestionBankState {
  const question = bank.questions.find((item) => item.id === questionId);
  if (!question) throw new Error('题目已经不存在。');
  if (!response.submitted || !statuses.has(status)) throw new Error('请先提交作答，再评价掌握状态。');
  const attemptId = `${sessionId}:question:${questionId}`;
  const existing = bank.attempts.find((item) => item.id === attemptId);
  const snapshot = existing?.snapshot ?? structuredClone(submittedSnapshot ?? question);
  if (snapshot.id !== questionId) throw new Error('作答快照与题目身份不符。');
  if (response.score !== undefined && (!Number.isFinite(response.score) || response.score < 0 || (snapshot.maxScore !== undefined && response.score > snapshot.maxScore!))) throw new Error('得分必须为非负数且不能超过满分。');
  if (response.selectedChoices.some((index) => !Number.isInteger(index) || index < 0 || index >= snapshot.choices.length) || (snapshot.type !== 'multiple' && response.selectedChoices.length > 1)) throw new Error('作答选项不合法。');
  const reviewedAt = existing?.reviewedAt ?? at;
  const prior = bank.attempts.filter((item) => item.questionId === questionId && item.id !== attemptId);
  const latest = prior.toSorted((a, b) => b.reviewedAt.localeCompare(a.reviewedAt))[0];
  // Questions test transfer. A successful answer retires this exact question from automatic practice;
  // weak answers get short repair intervals. New variants can then test the same skill.
  const intervalDays = status === 'unclear' ? 1 : status === 'partial' ? 3 : 0;
  const review: QuestionReviewState = { questionVersion: snapshot.version, status, intervalDays, easeFactor: 2.5, streak: status === 'stable' ? (latest?.review.streak ?? 0) + 1 : 0, nextReviewDate: addCalendarDays(dateKey(new Date(reviewedAt)), intervalDays), lastReviewedAt: reviewedAt, scheduleReason: status === 'stable' ? '已巩固；不自动重复原题' : `薄弱题 ${intervalDays} 天后再练` };
  const attempt: QuestionAttempt = { ...response, selectedChoices: [...response.selectedChoices], id: attemptId, sessionId, questionId, questionVersion: snapshot.version, snapshot, correct: checkQuestionAnswer(snapshot, response), status, reviewedAt, review };
  const attempts = [...bank.attempts.filter((item) => item.id !== attemptId), attempt];
  const newest = attempts.filter((item) => item.questionId === questionId).toSorted((a, b) => b.reviewedAt.localeCompare(a.reviewedAt))[0];
  return { ...bank, attempts, reviews: { ...bank.reviews, [questionId]: newest.review } };
}
export function questionMatchesFilter(question: StudyQuestion, bank: QuestionBankState, filter: QuestionFilter, date: string): boolean {
  const review = bank.reviews[question.id];
  const changed = Boolean(review && (question.updatedAt > review.lastReviewedAt || (review.questionVersion !== undefined && review.questionVersion !== question.version)));
  if (filter === 'all') return true;
  if (filter === 'unreviewed') return !review || changed;
  if (filter === 'due') return (!review || dateKey(new Date(review.lastReviewedAt)) < date) && (!review || changed || (review.status !== 'stable' && review.nextReviewDate <= date));
  if (filter === 'weak') return review?.status === 'partial' || review?.status === 'unclear';
  if (filter === 'partial' || filter === 'unclear' || filter === 'stable') return review?.status === filter;
  return bank.attempts.filter((item) => item.questionId === question.id).toSorted((a, b) => b.reviewedAt.localeCompare(a.reviewedAt)).slice(0, 5).filter((item) => item.status !== 'stable').length >= 2;
}
/** Orders only the selected items. Links never expand a learning session. */
export function buildStudyQueue(cues: StudyCue[], questions: StudyQuestion[]): StudyItemRef[] {
  const result: StudyItemRef[] = [];
  const usedCues = new Set<string>();
  const usedQuestions = new Set<string>();
  // Connected selected Cues come before their questions, even for a question with several links.
  for (const root of cues) {
    if (usedCues.has(root.id)) continue;
    const group = new Set([root.id]);
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (const question of questions.filter((item) => item.subjectId === root.subjectId && item.linkedCueIds.some((id) => group.has(id)))) {
        for (const cue of cues.filter((item) => item.subjectId === root.subjectId && question.linkedCueIds.includes(item.id))) {
          if (!group.has(cue.id)) { group.add(cue.id); expanded = true; }
        }
      }
    }
    for (const cue of cues.filter((item) => group.has(item.id))) {
      if (!usedCues.has(cue.id)) { result.push({ kind: 'cue', id: cue.id }); usedCues.add(cue.id); }
    }
    for (const question of questions.filter((item) => !usedQuestions.has(item.id) && item.subjectId === root.subjectId && item.linkedCueIds.some((id) => group.has(id)))) {
      result.push({ kind: 'question', id: question.id }); usedQuestions.add(question.id);
    }
  }
  for (const question of questions.filter((item) => !usedQuestions.has(item.id))) result.push({ kind: 'question', id: question.id });
  return result;
}
export function reconcileStudyDraft(draft: StudyDraft, cues: Array<Pick<StudyCue, 'id'>>, questions: Array<Pick<StudyQuestion, 'id'>>): StudyDraft {
  const cueIds = new Set(cues.map((item) => item.id));
  const questionIds = new Set(questions.map((item) => item.id));
  const items = draft.items.filter((item) => item.kind === 'cue' ? cueIds.has(item.id) : item.kind === 'question' && questionIds.has(item.id));
  const keys = new Set(items.map(itemKey));
  const current = draft.items[draft.index];
  const currentIndex = current ? items.findIndex((item) => itemKey(item) === itemKey(current)) : -1;
  const keep = <T,>(values: Record<string, T>) => Object.fromEntries(Object.entries(values).filter(([key]) => keys.has(key)));
  return { ...draft, items, index: currentIndex >= 0 ? currentIndex : Math.max(0, Math.min(draft.index, items.length - 1)), responses: keep(draft.responses), ...(draft.questionSnapshots ? { questionSnapshots: keep(draft.questionSnapshots) } : {}), revealed: keep(draft.revealed), assessments: keep(draft.assessments) };
}
export function removeQuestion(bank: QuestionBankState, id: string): QuestionBankState {
  // Attempts are immutable evidence and remain readable through their snapshots.
  const questions = bank.questions.filter((item) => item.id !== id);
  const reviews = { ...bank.reviews }; delete reviews[id];
  return { ...bank, questions, reviews, drafts: Object.fromEntries(Object.entries(bank.drafts).map(([key, draft]) => [key, reconcileStudyDraft(draft, draft.items.filter((item) => item.kind === 'cue').map((item) => ({ id: item.id })), questions)])) };
}
export function readQuestionBank(input: unknown): QuestionBankState {
  const raw = object(input);
  if (raw.schemaVersion !== 1 || !Array.isArray(raw.questions) || !Array.isArray(raw.attempts)) throw new Error('题库格式或版本不正确。');
  const questions = raw.questions.map((value): StudyQuestion => {
    const item = object(value);
    const content = validateQuestion(item);
    if (typeof item.id !== 'string' || !item.id || !Number.isInteger(item.version) || Number(item.version) < 1 || typeof item.createdAt !== 'string' || !Number.isFinite(Date.parse(item.createdAt)) || typeof item.updatedAt !== 'string' || !Number.isFinite(Date.parse(item.updatedAt))) throw new Error('题目身份或日期不正确。');
    return { ...content, id: item.id, version: Number(item.version), createdAt: item.createdAt, updatedAt: item.updatedAt };
  });
  if (new Set(questions.map((item) => item.id)).size !== questions.length) throw new Error('题目 id 重复。');
  const validResponse = (item: QuestionResponse) => item && typeof item.text === 'string' && typeof item.issue === 'string' && typeof item.paper === 'boolean' && typeof item.submitted === 'boolean' && Array.isArray(item.selectedChoices) && item.selectedChoices.every((value) => Number.isInteger(value) && value >= 0) && (item.score === undefined || (Number.isFinite(item.score) && item.score >= 0));
  const validReview = (item: QuestionReviewState) => item && statuses.has(item.status) && typeof item.nextReviewDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.nextReviewDate) && Number.isFinite(Date.parse(item.lastReviewedAt)) && Number.isFinite(item.intervalDays) && item.intervalDays >= 0 && Number.isFinite(item.easeFactor) && Number.isInteger(item.streak) && item.streak >= 0 && typeof item.scheduleReason === 'string';
  const attempts = raw.attempts as QuestionAttempt[];
  if (attempts.some((item) => !item || typeof item.id !== 'string' || typeof item.questionId !== 'string' || typeof item.sessionId !== 'string' || !statuses.has(item.status) || !item.snapshot || !validReview(item.review) || !Number.isFinite(Date.parse(item.reviewedAt)) || !validResponse(item) || !item.submitted || ![true, false, null].includes(item.correct) || item.snapshot.id !== item.questionId || item.snapshot.version !== item.questionVersion)) throw new Error('作答历史格式不正确。');
  if (new Set(attempts.map((item) => item.id)).size !== attempts.length) throw new Error('作答历史 id 重复。');
  for (const attempt of attempts) validateQuestion(attempt.snapshot);
  const reviews = object(raw.reviews ?? {}) as unknown as Record<string, QuestionReviewState>;
  if (Object.values(reviews).some((item) => !validReview(item))) throw new Error('复习状态格式不正确。');
  const drafts = object(raw.drafts ?? {}) as unknown as Record<string, StudyDraft>;
  if (Object.values(drafts).some((item) => !item || typeof item.id !== 'string' || !item.task || !Array.isArray(item.items) || !Number.isInteger(item.index) || !item.responses || !item.assessments || !item.revealed || !['cue', 'question', 'mixed'].includes(item.mode) || !Number.isFinite(Date.parse(item.updatedAt)) || Object.values(item.responses).some((response) => !validResponse(response)) || Object.values(item.assessments).some((status) => !statuses.has(status)) || item.items.some((ref) => !ref || !['cue', 'question'].includes(ref.kind) || typeof ref.id !== 'string'))) throw new Error('学习草稿格式不正确。');
  // Merging independent attempts can merge review fields separately. The latest attempt is authoritative.
  for (const question of questions) {
    const latest = attempts.filter((item) => item.questionId === question.id).toSorted((a, b) => b.reviewedAt.localeCompare(a.reviewedAt))[0];
    if (latest) reviews[question.id] = latest.review;
  }
  return { schemaVersion: 1, questions: assignQuestionCodes(questions, attempts.map((attempt) => attempt.snapshot)), attempts, reviews, drafts };
}
export function questionReviewTasks(bank: QuestionBankState, date: Date): LearningTask[] {
  const key = dateKey(date);
  const rank = (question: StudyQuestion) => {
    const review = bank.reviews[question.id];
    return review && (question.updatedAt > review.lastReviewedAt || (review.questionVersion !== undefined && review.questionVersion !== question.version)) ? 0 : review?.status === 'unclear' ? 1 : review?.status === 'partial' ? 2 : !review ? 3 : 4;
  };
  const due = bank.questions.filter((item) => questionMatchesFilter(item, bank, 'due', key)).toSorted((a, b) => rank(a) - rank(b) || (bank.reviews[a.id]?.nextReviewDate ?? a.createdAt).localeCompare(bank.reviews[b.id]?.nextReviewDate ?? b.createdAt));
  const subjects = new Map<string, StudyQuestion[]>();
  for (const question of due) subjects.set(question.subjectId, [...(subjects.get(question.subjectId) ?? []), question]);
  return [...subjects.values()].flatMap((questions) => {
    const tasks: LearningTask[] = [];
    for (let index = 0; index < questions.length; index += 6) {
      const batch = questions.slice(index, index + 6);
      const questionIds = batch.map((item) => item.id);
      tasks.push({ key: `question-review:${key}:${batch[0].subjectId}${index ? `:batch-${index / 6 + 1}` : ''}`, title: `${batch[0].subjectName} · 题目练习 · ${batch.length} 题`, detail: '先独立作答，再核对答案、记录错因和 √ / △ / ○；薄弱原题短期修复，已巩固原题退出自动队列。', type: 'practice', date: key, durationMinutes: batch.length * 8, subjectId: batch[0].subjectId, subjectName: batch[0].subjectName, questionIds, scope: { questionIds }, reviewPriority: rank(batch[0]), overdue: batch.some((item) => bank.reviews[item.id]?.status !== 'stable' && (bank.reviews[item.id]?.nextReviewDate ?? addCalendarDays(dateKey(new Date(item.createdAt)), 1)) < key) });
    }
    return tasks;
  });
}
export function questionImportTemplate(subjectId: string, subjectName: string, unit: string): string {
  return JSON.stringify({ version: 1, operations: [{ action: 'create', question: { subjectId, subjectName, unit: unit || 'Unit 1', type: 'single', prompt: '填写题干（支持 Markdown 和 $公式$）', choices: ['选项 A', '选项 B'], correctChoices: [0], answer: '', explanation: '', markingPoints: [], linkedCueIds: [] } }] }, null, 2);
}

/** Catalog identity/name changes update live content, never historical answer snapshots. */
export function reconcileQuestionSubjects(bank: QuestionBankState, catalog: LearningCatalogSubject[]): QuestionBankState {
  const resolveUnit = (subject: LearningCatalogSubject, name: string) => subject.units.find((unit) => [unit.renameFrom, ...(unit.mergeFrom ?? [])].some((alias) => alias?.trim().toLowerCase() === name.trim().toLowerCase()))?.name ?? name;
  const questions = bank.questions.map((question) => {
    const subject = catalog.find((subject) => subject.id === question.subjectId) ?? matchLearningCatalogSubject(catalog, question.subjectName);
    return subject ? { ...question, subjectId: subject.id, subjectName: subject.name, unit: resolveUnit(subject, question.unit) } : question;
  });
  const drafts = Object.fromEntries(Object.entries(bank.drafts).map(([id, draft]) => {
    const subject = catalog.find((subject) => subject.id === draft.task.subjectId);
    return [id, subject ? { ...draft, task: { ...draft.task, subjectName: subject.name, ...(draft.task.scope?.unit ? { scope: { ...draft.task.scope, unit: resolveUnit(subject, draft.task.scope.unit) } } : {}) } } : draft];
  }));
  return { ...bank, questions, drafts };
}

/** Allocate once; deletions never reuse identifiers retained in answer history. */
export function assignQuestionCodes(questions: StudyQuestion[], historical: StudyQuestion[] = []): StudyQuestion[] {
  const used = new Set([...questions, ...historical].flatMap((question) => question.code ? [question.code] : []));
  return questions.map((question) => {
    if (question.code) return { ...question, source: question.source || '来源待补充' };
    const prefix = question.subjectName.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 2) || 'Q';
    let hash = 2166136261;
    for (const character of question.id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
    let index = hash % 1679616;
    while (used.has(`${prefix}-${index.toString(36).toUpperCase().padStart(4, '0')}`)) index += 1;
    const code = `${prefix}-${index.toString(36).toUpperCase().padStart(4, '0')}`;
    used.add(code);
    return { ...question, code, source: question.source || '来源待补充' };
  });
}
