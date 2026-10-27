'use client';
import { workspaceStorage } from '../sync/repository.ts';


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
  store: IDBObjectStore;
  db: IDBDatabase;
}> {
  const db = await openDB();
  const tx = db.transaction('offline_answers', mode);
  const store = tx.objectStore('offline_answers');
  return { store, db };
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

function lsSet(key: string, value: unknown): void {
  try {
    workspaceStorage.setItem(`quizwise_${key}`, JSON.stringify(value));
  } catch {
    // ignore
  }
}

// Current questions (in-progress quiz)
export async function getCurrentQuestions(): Promise<AnalyzedQuestion[]> {
  const synced = lsGet<AnalyzedQuestion[]>('current_questions');
  if (synced) return synced;
  const cached = await getItem<AnalyzedQuestion[]>('current_questions');
  if (cached) {
    lsSet('current_questions', cached);
    await workspaceStorage.flush();
    return cached;
  }
  return [];
}

export function getCurrentQuestionsSync(): AnalyzedQuestion[] {
  return lsGet<AnalyzedQuestion[]>('current_questions') ?? [];
}

export async function saveCurrentQuestions(questions: AnalyzedQuestion[]): Promise<void> {
  lsSet('current_questions', questions);
  await workspaceStorage.flush();
  await setItem('current_questions', questions);
}

export async function clearCurrentQuestions(): Promise<void> {
  workspaceStorage.removeItem('quizwise_current_questions');
  await workspaceStorage.flush();
  await setItem('current_questions', null);
}

// Current session
export function getCurrentSession(): { id: string; startedAt: string } | null {
  return lsGet('current_session');
}

export function saveCurrentSession(session: { id: string; startedAt: string }): void {
  lsSet('current_session', session);
}

export function clearCurrentSession(): void {
  lsSet('current_session', null);
}

export interface CurrentQuizProgress {
  sessionId: string | null;
  startedAt: string;
  subjectName: string;
  currentIndex: number;
  questionIds: string[];
  answers: Array<{ questionIndex: number; answer: string; isCorrect: boolean | null }>;
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

export function saveQuizSettings(settings: QuizSettings): void {
  lsSet('quiz_settings', settings);
}

export function getLocalQuizHistory(): QuizSession[] {
  return lsGet<QuizSession[]>('history') ?? [];
}

export function appendLocalQuizHistory(entry: Omit<QuizSession, 'user_id' | 'subject_id'>): void {
  const history = getLocalQuizHistory();
  lsSet('history', [{ ...entry, user_id: 'local', subject_id: null }, ...history].slice(0, 100));
}

export function deleteLocalQuizHistory(id: string): void {
  lsSet('history', getLocalQuizHistory().filter((entry) => entry.id !== id));
}

// Selected subject preference
export function getSelectedSubject(): string | null {
  return lsGet<string>('selected_subject');
}

export function saveSelectedSubject(subject: string | null): void {
  lsSet('selected_subject', subject);
}

// Offline answer queue (for when network is down)
export interface OfflineAnswer {
  questionIndex: number;
  sessionId: string;
  answer: string;
  timestamp: string;
}

export async function queueOfflineAnswer(answer: OfflineAnswer): Promise<void> {
  try {
    const { store } = await getOfflineStore('readwrite');
    store.add(answer);
  } catch {
    // Silently fail
  }
}

export async function getOfflineAnswers(): Promise<OfflineAnswer[]> {
  try {
    const { store } = await getOfflineStore();
    return new Promise((resolve) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result ?? []);
      request.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function clearOfflineAnswers(): Promise<void> {
  try {
    const { store } = await getOfflineStore('readwrite');
    store.clear();
  } catch {
    // Silently fail
  }
}
