'use client';
import { workspaceStorage } from '../sync/repository.ts';
import { getDocuments } from '../sync/outbox.ts';


import type { AnalyzedQuestion, QuizSession, QuizSettings } from '@/types/quiz';

const DB_NAME = 'quizwise';
const DB_VERSION = 1;

// Open IndexedDB
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('quiz_data')) {
        db.createObjectStore('quiz_data', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('offline_answers')) {
        db.createObjectStore('offline_answers', { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getStore(mode: IDBTransactionMode = 'readonly'): Promise<{
  store: IDBObjectStore;
  db: IDBDatabase;
}> {
  const db = await openDB();
  const tx = db.transaction('quiz_data', mode);
  const store = tx.objectStore('quiz_data');
  return { store, db };
}

async function getOfflineStore(mode: IDBTransactionMode = 'readonly'): Promise<{
  transaction: IDBTransaction;
  store: IDBObjectStore;
  db: IDBDatabase;
}> {
  const db = await openDB();
  const tx = db.transaction('offline_answers', mode);
  const store = tx.objectStore('offline_answers');
  return { transaction: tx, store, db };
}

// Generic get/set
async function getItem<T>(key: string): Promise<T | null> {
  try {
    const { store } = await getStore();
    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result?.value ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

async function setItem(key: string, value: unknown): Promise<void> {
  const { store, db } = await getStore('readwrite');
  try {
    return new Promise((resolve, reject) => {
      const transaction = store.transaction;
      const request = store.put({ key, value });
      request.onerror = () => reject(request.error ?? new Error('QuizWise IndexedDB write failed.'));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('QuizWise IndexedDB transaction failed.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('QuizWise IndexedDB transaction aborted.'));
    });
  } finally {
    db.close();
  }
}

// Fallback to localStorage
function lsGet<T>(key: string): T | null {
  try {
    const raw = workspaceStorage.getItem(`quizwise_${key}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function saveWorkspaceValue(key: string, value: unknown): Promise<void> {
  workspaceStorage.setItem(`quizwise_${key}`, JSON.stringify(value));
  await workspaceStorage.flush();
}

async function removeWorkspaceValue(key: string): Promise<void> {
  workspaceStorage.removeItem(`quizwise_${key}`);
  await workspaceStorage.flush();
}

// Current questions (in-progress quiz)
export async function getCurrentQuestions(): Promise<AnalyzedQuestion[]> {
  const authoritative = (await getDocuments()).find(row => row.key === 'quizwise_current_questions');
  if (authoritative) {
    if (authoritative.value === null) return [];
    try {
      const value: unknown = JSON.parse(authoritative.value);
      if (Array.isArray(value)) return value as AnalyzedQuestion[];
    }
    catch { throw new Error('同步的 QuizWise 题目格式损坏；已阻止旧缓存覆盖云端删除或恢复状态。'); }
    throw new Error('同步的 QuizWise 题目不是数组；已阻止旧缓存覆盖云端状态。');
  }
  const synced = lsGet<AnalyzedQuestion[]>('current_questions');
  if (synced) return synced;
  const cached = await getItem<AnalyzedQuestion[]>('current_questions');
  if (cached) {
    await saveWorkspaceValue('current_questions', cached);
    return cached;
  }
  return [];
}

export function getCurrentQuestionsSync(): AnalyzedQuestion[] {
  return lsGet<AnalyzedQuestion[]>('current_questions') ?? [];
}

export async function saveCurrentQuestions(questions: AnalyzedQuestion[]): Promise<void> {
  await saveWorkspaceValue('current_questions', questions);
  await setItem('current_questions', questions);
}

export async function clearCurrentQuestions(): Promise<void> {
  await setItem('current_questions', null);
  workspaceStorage.removeItem('quizwise_current_questions');
  await workspaceStorage.flush();
}

// Current session
export function getCurrentSession(): { id: string; startedAt: string } | null {
  return lsGet('current_session');
}

export async function saveCurrentSession(session: { id: string; startedAt: string }): Promise<void> {
  await saveWorkspaceValue('current_session', session);
}

export async function clearCurrentSession(): Promise<void> {
  await removeWorkspaceValue('current_session');
}

export interface CurrentQuizProgress {
  sessionId: string | null;
  startedAt: string;
  subjectName: string;
  currentIndex: number;
  questionIds: string[];
  answers: Array<{ questionIndex: number; answer: string; isCorrect: boolean | null }>;
}

export function quizProgressMatchesQuestions(progress: CurrentQuizProgress, questions: readonly AnalyzedQuestion[]): boolean {
  return !progress.questionIds.length || progress.questionIds.length === questions.length
    && progress.questionIds.every((id, index) => questions[index]?.id === id);
}

const CURRENT_PROGRESS_KEY = 'quizwise_current_progress';

export function getCurrentQuizProgress(): CurrentQuizProgress | null {
  try {
    const raw = workspaceStorage.getItem(CURRENT_PROGRESS_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<CurrentQuizProgress>;
    if (typeof value.startedAt !== 'string' || typeof value.subjectName !== 'string'
      || !Number.isInteger(value.currentIndex) || !Array.isArray(value.questionIds) || !Array.isArray(value.answers)) return null;
    return {
      sessionId: typeof value.sessionId === 'string' ? value.sessionId : null,
      startedAt: value.startedAt,
      subjectName: value.subjectName,
      currentIndex: Math.max(0, value.currentIndex!),
      questionIds: value.questionIds.filter((id): id is string => typeof id === 'string'),
      answers: value.answers.flatMap((answer, questionIndex) => {
        if (!answer || typeof answer !== 'object' || typeof answer.answer !== 'string') return [];
        return [{ questionIndex: Number.isInteger(answer.questionIndex) ? answer.questionIndex : questionIndex,
          answer: answer.answer, isCorrect: typeof answer.isCorrect === 'boolean' ? answer.isCorrect : null }];
      }),
    };
  } catch {
    return null;
  }
}

export async function saveCurrentQuizProgress(progress: CurrentQuizProgress): Promise<void> {
  workspaceStorage.setItem(CURRENT_PROGRESS_KEY, JSON.stringify(progress));
  await workspaceStorage.flush();
}

export async function clearCurrentQuizProgress(): Promise<void> {
  workspaceStorage.removeItem(CURRENT_PROGRESS_KEY);
  await workspaceStorage.flush();
}

// Quiz settings (local cache)
export function getQuizSettings(): QuizSettings {
  return lsGet<QuizSettings>('quiz_settings') ?? {
    show_answer_immediately: true,
    auto_submit_on_enter: true,
    default_subject_id: null,
    selected_subjects: [],
  };
}

export async function saveQuizSettings(settings: QuizSettings): Promise<void> {
  await saveWorkspaceValue('quiz_settings', settings);
}

export function getLocalQuizHistory(): QuizSession[] {
  return lsGet<QuizSession[]>('history') ?? [];
}

export async function appendLocalQuizHistory(entry: Omit<QuizSession, 'user_id' | 'subject_id'>): Promise<void> {
  const history = getLocalQuizHistory();
  await saveWorkspaceValue('history', [{ ...entry, user_id: 'local', subject_id: null }, ...history].slice(0, 100));
}

export async function deleteLocalQuizHistory(id: string): Promise<void> {
  await saveWorkspaceValue('history', getLocalQuizHistory().filter((entry) => entry.id !== id));
}

// Selected subject preference
export function getSelectedSubject(): string | null {
  return lsGet<string>('selected_subject');
}

export async function saveSelectedSubject(subject: string | null): Promise<void> {
  await saveWorkspaceValue('selected_subject', subject);
}

// Offline answer queue (for when network is down)
export interface OfflineAnswer {
  questionIndex: number;
  sessionId: string;
  answer: string;
  timestamp: string;
}

interface StoredOfflineAnswer extends OfflineAnswer {
  id: string;
}

interface LegacyOfflineAnswer extends OfflineAnswer {
  id: number;
}

const OFFLINE_ANSWERS_KEY = 'quizwise_offline_answers';
const OFFLINE_ANSWERS_MIGRATED_KEY = 'quizwise_offline_answers_migrated_v5';
let offlineAnswerMigration: Promise<void> | null = null;

function offlineAnswerRows(value: string | null): StoredOfflineAnswer[] | null {
  if (value === null) return null;
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.some((row) => !row || typeof row !== 'object'
    || typeof row.id !== 'string' || typeof row.sessionId !== 'string'
    || !Number.isInteger(row.questionIndex) || typeof row.answer !== 'string'
    || typeof row.timestamp !== 'string')) {
    throw new Error('QuizWise offline answers are malformed; the original queue was preserved.');
  }
  return parsed as StoredOfflineAnswer[];
}

async function readLegacyOfflineAnswers(): Promise<LegacyOfflineAnswer[]> {
  const { transaction, store, db } = await getOfflineStore();
  try {
    return await new Promise((resolve, reject) => {
      const request = store.getAll() as IDBRequest<LegacyOfflineAnswer[]>;
      let rows: LegacyOfflineAnswer[] = [];
      request.onsuccess = () => { rows = request.result ?? []; };
      request.onerror = () => reject(request.error ?? new Error('QuizWise offline answer read failed.'));
      transaction.oncomplete = () => resolve(rows);
      transaction.onerror = () => reject(transaction.error ?? new Error('QuizWise offline answer read transaction failed.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('QuizWise offline answer read transaction aborted.'));
    });
  } finally {
    db.close();
  }
}

async function clearLegacyOfflineAnswers(): Promise<void> {
  const { transaction, store, db } = await getOfflineStore('readwrite');
  try {
    await new Promise<void>((resolve, reject) => {
      store.clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('QuizWise legacy offline answer cleanup failed.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('QuizWise legacy offline answer cleanup aborted.'));
    });
  } finally {
    db.close();
  }
}

async function migrateLegacyOfflineAnswers(): Promise<void> {
  if (offlineAnswerMigration) return offlineAnswerMigration;
  offlineAnswerMigration = (async () => {
    if (workspaceStorage.getItem(OFFLINE_ANSWERS_MIGRATED_KEY) === '1') return;
    const existing = offlineAnswerRows(workspaceStorage.getItem(OFFLINE_ANSWERS_KEY));
    const legacyRows = await readLegacyOfflineAnswers();
    if (existing === null && legacyRows.length > 0) {
      const migrated = legacyRows.map(({ id, ...answer }) => ({ ...answer, id: `legacy:${id}` }));
      workspaceStorage.setItem(OFFLINE_ANSWERS_KEY, JSON.stringify(migrated));
    } else if (legacyRows.length > 0) {
      const knownIds = new Set(existing?.map((row) => row.id) ?? []);
      const additions = legacyRows.filter((row) => !knownIds.has(`legacy:${row.id}`));
      if (additions.length > 0) {
        workspaceStorage.setItem(OFFLINE_ANSWERS_KEY, JSON.stringify([
          ...(existing ?? []),
          ...additions.map(({ id, ...answer }) => ({ ...answer, id: `legacy:${id}` })),
        ]));
      }
    }
    workspaceStorage.setItem(OFFLINE_ANSWERS_MIGRATED_KEY, '1');
    await workspaceStorage.flush();
    if (legacyRows.length > 0) await clearLegacyOfflineAnswers();
  })().finally(() => { offlineAnswerMigration = null; });
  return offlineAnswerMigration;
}

export async function queueOfflineAnswer(answer: OfflineAnswer): Promise<void> {
  await migrateLegacyOfflineAnswers();
  const current = offlineAnswerRows(workspaceStorage.getItem(OFFLINE_ANSWERS_KEY)) ?? [];
  workspaceStorage.setItem(OFFLINE_ANSWERS_KEY, JSON.stringify([...current, { ...answer, id: crypto.randomUUID() }]));
  await workspaceStorage.flush();
}

export async function getOfflineAnswers(): Promise<OfflineAnswer[]> {
  await migrateLegacyOfflineAnswers();
  return (offlineAnswerRows(workspaceStorage.getItem(OFFLINE_ANSWERS_KEY)) ?? []).map((row) => ({
    questionIndex: row.questionIndex,
    sessionId: row.sessionId,
    answer: row.answer,
    timestamp: row.timestamp,
  }));
}

export async function clearOfflineAnswers(): Promise<void> {
  await migrateLegacyOfflineAnswers();
  workspaceStorage.removeItem(OFFLINE_ANSWERS_KEY);
  workspaceStorage.setItem(OFFLINE_ANSWERS_MIGRATED_KEY, '1');
  await workspaceStorage.flush();
  await clearLegacyOfflineAnswers();
}
