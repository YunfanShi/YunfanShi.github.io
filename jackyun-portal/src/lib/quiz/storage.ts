'use client';

import { AnalyzedQuestion, QuizSession, QuizQuestion, QuizSettings } from '@/types/quiz';

const DB_NAME = 'quizwise';
const DB_VERSION = 1;

interface QuizStoredData {
  currentQuestions?: AnalyzedQuestion[];
  currentSession?: { id: string; startedAt: string };
  quizSettings?: QuizSettings;
  cachedSessions?: QuizSession[];
}

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
  try {
    const { store } = await getStore('readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put({ key, value });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // Silently fail - localStorage fallback
  }
}

// Fallback to localStorage
function lsGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(`quizwise_${key}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function lsSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(`quizwise_${key}`, JSON.stringify(value));
  } catch {
    // ignore
  }
}

// Current questions (in-progress quiz)
export async function getCurrentQuestions(): Promise<AnalyzedQuestion[]> {
  const data = await getItem<AnalyzedQuestion[]>('current_questions');
  return data ?? lsGet<AnalyzedQuestion[]>('current_questions') ?? [];
}

export function getCurrentQuestionsSync(): AnalyzedQuestion[] {
  return lsGet<AnalyzedQuestion[]>('current_questions') ?? [];
}

export async function saveCurrentQuestions(questions: AnalyzedQuestion[]): Promise<void> {
  await setItem('current_questions', questions);
  lsSet('current_questions', questions);
}

export function saveCurrentQuestionsSync(questions: AnalyzedQuestion[]): void {
  lsSet('current_questions', questions);
}

export function clearCurrentQuestions(): void {
  lsSet('current_questions', null);
  setItem('current_questions', null).catch(() => {});
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