'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode, CSSProperties } from 'react';
import type { VocabWordSRS, VocabDayStats, VocabSettings, ImportWordData, SessionWord } from '@/types/vocab';
import {
  getAllWords,
  updateWordSRS,
  importWords as importWordsAction,
  addSingleWord,
  getTodayStats,
  updateTodayStats,
  getVocabSettings,
  updateVocabSettings,
  deleteWord,
  updateWord,
} from '@/actions/vocab';

// ─── SRS Constants & Pure Functions ──────────────────────────────────────────

const SRS_INTERVALS = [1, 10, 60, 720, 1440, 2880, 5760, 10080]; // minutes

function srsGetDue(words: VocabWordSRS[]): VocabWordSRS[] {
  const now = Date.now();
  return words.filter((w) => w.status !== 'new' && w.next_review <= now);
}

function srsProcess(word: VocabWordSRS, correct: boolean): Partial<VocabWordSRS> {
  if (!correct) {
    return { status: 'learning', stage: 0, next_review: Date.now(), interval_minutes: 0 };
  }
  const newStage = word.stage + 1;
  const idx = Math.min(newStage, SRS_INTERVALS.length - 1);
  const intervalMin = SRS_INTERVALS[idx];
  const nextReview = Date.now() + intervalMin * 60 * 1000;
  const today = new Date().toISOString().slice(0, 10);
  let status: VocabWordSRS['status'] = 'learning';
  if (newStage >= 7) status = 'mastered';
  else if (newStage >= 3) status = 'review';
  return {
    status,
    stage: newStage,
    next_review: nextReview,
    interval_minutes: intervalMin,
    learned_date: word.learned_date ?? today,
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = 'recall' | 'select' | 'spell' | 'feedback' | 'immersive';
type ViewType = 'dashboard' | 'review' | 'library' | 'settings' | 'session';
type ModeType = 'learn' | 'review' | 'review_all' | 'immersive' | 'spell';

interface SessionState {
  active: boolean;
  mode: ModeType;
  queue: SessionWord[];
  currentWord: SessionWord | null;
  phase: Phase;
  revealed: boolean;
  undoWord: SessionWord | null;
  showUndo: boolean;
  selectOptions: VocabWordSRS[];
  spellInput: string;
  filterDate?: string;
  wrongAnswer: boolean;
  sessionComplete: boolean;
  completedCount: number;
}

const DEFAULT_SESSION: SessionState = {
  active: false,
  mode: 'learn',
  queue: [],
  currentWord: null,
  phase: 'recall',
  revealed: false,
  undoWord: null,
  showUndo: false,
  selectOptions: [],
  spellInput: '',
  wrongAnswer: false,
  sessionComplete: false,
  completedCount: 0,
};

interface VocabAppProps {
  initialWords: VocabWordSRS[];
  initialStats: VocabDayStats;
  initialSettings: VocabSettings;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getPhase(word: SessionWord, mode: ModeType): Phase {
  if (mode === 'immersive') return 'immersive';
  if (mode === 'spell') return 'spell';
  if (mode === 'learn' && (word.status === 'new' || word.status === 'learning')) {
    if (word.sessionStage === 0) return 'recall';
    if (word.sessionStage === 1) return 'select';
    if (word.sessionStage === 2) return 'spell';
  }
  return 'recall';
}

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

function buildSelectOptions(word: VocabWordSRS, allWords: VocabWordSRS[]): VocabWordSRS[] {
  const others = allWords.filter((w) => w.id !== word.id);
  const picks = shuffle(others).slice(0, 3);
  return shuffle([...picks, word]);
}

function fmtTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function VocabApp({ initialWords, initialStats, initialSettings }: VocabAppProps) {
  const [words, setWords] = useState<VocabWordSRS[]>(initialWords);
  const [stats, setStats] = useState<VocabDayStats>(initialStats);
  const [settings, setSettings] = useState<VocabSettings>(initialSettings);
  const [view, setView] = useState<ViewType>('dashboard');
  const [session, setSession] = useState<SessionState>(DEFAULT_SESSION);
  const [dark, setDark] = useState(initialSettings.theme === 'dark');

  // Library state
  const [libFilter, setLibFilter] = useState<'all' | 'learning' | 'mastered' | 'error'>('all');
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [editingWord, setEditingWord] = useState<VocabWordSRS | null>(null);
  const [editForm, setEditForm] = useState({ word: '', meaning: '', ex: '', cn: '' });
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ word: '', meaning: '', ex: '', cn: '' });

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionTimeRef = useRef(0);
  const [displayTime, setDisplayTime] = useState(0);

  // ─── TTS ──────────────────────────────────────────────────────────────────

  const speak = useCallback(
    (text: string) => {
      if (!settings.tts || typeof window === 'undefined') return;
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      utt.rate = settings.rate;
      window.speechSynthesis.speak(utt);
    },
    [settings.tts, settings.rate],
  );

  // ─── Session timer ────────────────────────────────────────────────────────

  useEffect(() => {
    if (session.active && !session.sessionComplete) {
      timerRef.current = setInterval(() => {
        sessionTimeRef.current += 1;
        setDisplayTime((t) => t + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [session.active, session.sessionComplete]);

  // ─── Keyboard shortcuts ───────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!session.active) return;
      if (e.key === ' ' && session.phase === 'recall' && !session.revealed) {
        e.preventDefault();
        setSession((s) => ({ ...s, revealed: true }));
        if (session.currentWord) speak(session.currentWord.word);
      }
      if (e.key === 'Enter' && session.phase === 'immersive') {
        handleResultRef.current?.(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [session.active, session.phase, session.revealed, session.currentWord, speak]);

  // Use a ref for handleResult so the keydown closure stays fresh
  const handleResultRef = useRef<((correct: boolean) => void) | null>(null);

  // ─── Session logic ────────────────────────────────────────────────────────

  function startSession(mode: ModeType, filterDate?: string) {
    const now = Date.now();
    let filtered: VocabWordSRS[] = [];

    switch (mode) {
      case 'learn':
        filtered = words.filter((w) => w.status === 'new').slice(0, 20);
        break;
      case 'review':
      case 'review_all':
        if (filterDate) {
          filtered = words.filter((w) => w.learned_date === filterDate && w.next_review <= now);
        } else {
          filtered = words.filter((w) => w.status !== 'new' && w.next_review <= now);
        }
        break;
      case 'immersive':
        filtered = words.filter((w) => w.status === 'new').slice(0, 20);
        break;
      case 'spell':
        filtered = words.filter((w) => w.status === 'new').slice(0, 20);
        break;
    }

    if (!filtered.length) return;

    const queue = filtered.map((w) => ({ ...w, sessionStage: 0 }));
    const [first, ...rest] = queue;
    const phase = getPhase(first, mode);
    const selectOptions = phase === 'select' ? buildSelectOptions(first, words) : [];

    if (settings.tts && phase === 'recall') speak(first.word);

    sessionTimeRef.current = 0;
    setDisplayTime(0);
    setSession({
      ...DEFAULT_SESSION,
      active: true,
      mode,
      queue: rest,
      currentWord: first,
      phase,
      selectOptions,
      filterDate,
    });
    setView('session');
  }

  const handleResult = useCallback(
    async (correct: boolean) => {
      const s = session;
      if (!s.currentWord) return;
      const word = s.currentWord;

      if (!correct) {
        // Wrong: SRS penalty, push word to end with reset sessionStage
        const updates = srsProcess(word, false);
        const updatedWord = { ...word, ...updates } as VocabWordSRS;
        setWords((ws) => ws.map((w) => (w.id === word.id ? updatedWord : w)));
        updateWordSRS(word.id, updates).catch(console.error);

        const resetWord: SessionWord = { ...word, ...updates, sessionStage: 0 };
        setSession((prev) => ({
          ...prev,
          queue: [...prev.queue, resetWord],
          currentWord: word,
          phase: 'feedback',
          wrongAnswer: true,
          revealed: false,
          spellInput: '',
        }));
        return;
      }

      // Correct: advance sessionStage
      const maxStages =
        mode_needs_3stages(s.mode, word.status) ? 3 : 1;
      const nextSessionStage = word.sessionStage + 1;

      if (nextSessionStage >= maxStages) {
        // Word complete in session — apply positive SRS update
        const updates = srsProcess(word, true);
        const updatedWord = { ...word, ...updates } as VocabWordSRS;
        setWords((ws) => ws.map((w) => (w.id === word.id ? updatedWord : w)));
        updateWordSRS(word.id, updates).catch(console.error);

        const newCompleted = s.completedCount + 1;
        const newStats = {
          ...stats,
          today_learned: stats.today_learned + (word.status === 'new' ? 1 : 0),
          today_reviewed: stats.today_reviewed + (word.status !== 'new' ? 1 : 0),
        };
        setStats(newStats);

        if (s.queue.length === 0) {
          // Session complete
          const finalStats = { ...newStats, today_time: newStats.today_time + sessionTimeRef.current };
          setStats(finalStats);
          updateTodayStats(finalStats).catch(console.error);
          setSession((prev) => ({
            ...prev,
            sessionComplete: true,
            currentWord: null,
            completedCount: newCompleted,
          }));
          return;
        }

        const [next, ...rest] = s.queue;
        const phase = getPhase(next, s.mode);
        const selectOptions = phase === 'select' ? buildSelectOptions(next, words) : [];
        if (settings.tts && (phase === 'recall' || phase === 'immersive')) speak(next.word);

        setSession((prev) => ({
          ...prev,
          queue: rest,
          currentWord: next,
          phase,
          selectOptions,
          revealed: false,
          spellInput: '',
          wrongAnswer: false,
          undoWord: word,
          showUndo: true,
          completedCount: newCompleted,
        }));
        setTimeout(() => setSession((p) => ({ ...p, showUndo: false })), 3000);
      } else {
        // Same word, next stage
        const updatedWord: SessionWord = { ...word, sessionStage: nextSessionStage };
        const phase = getPhase(updatedWord, s.mode);
        const selectOptions = phase === 'select' ? buildSelectOptions(word, words) : [];
        if (settings.tts && phase === 'spell') speak(word.word);
        setSession((prev) => ({
          ...prev,
          currentWord: updatedWord,
          phase,
          selectOptions,
          revealed: false,
          spellInput: '',
          wrongAnswer: false,
        }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, words, stats, settings, speak],
  );

  // Keep ref current
  handleResultRef.current = handleResult;

  function mode_needs_3stages(mode: ModeType, status: VocabWordSRS['status']): boolean {
    return mode === 'learn' && (status === 'new' || status === 'learning');
  }

  function handleUndo() {
    if (!session.undoWord) return;
    const prev = session.undoWord;
    // Revert SRS state for prev word
    setWords((ws) => ws.map((w) => (w.id === prev.id ? prev : w)));
    updateWordSRS(prev.id, {
      status: prev.status,
      stage: prev.stage,
      next_review: prev.next_review,
      interval_minutes: prev.interval_minutes,
      learned_date: prev.learned_date,
    }).catch(console.error);
    // Restore stats decrement
    setStats((s) => ({
      ...s,
      today_learned: Math.max(0, s.today_learned - (prev.status === 'new' ? 1 : 0)),
      today_reviewed: Math.max(0, s.today_reviewed - (prev.status !== 'new' ? 1 : 0)),
    }));

    const front: SessionWord = { ...prev, sessionStage: 0 };
    const newQueue = session.currentWord
      ? [front, session.currentWord, ...session.queue]
      : [front, ...session.queue];
    const [first, ...rest] = newQueue;
    const phase = getPhase(first, session.mode);
    const selectOptions = phase === 'select' ? buildSelectOptions(first, words) : [];
    setSession((s) => ({
      ...s,
      queue: rest,
      currentWord: first,
      phase,
      selectOptions,
      undoWord: null,
      showUndo: false,
      revealed: false,
      spellInput: '',
      completedCount: Math.max(0, s.completedCount - 1),
    }));
  }

  async function exitSession() {
    if (timerRef.current) clearInterval(timerRef.current);
    const finalStats = { ...stats, today_time: stats.today_time + sessionTimeRef.current };
    setStats(finalStats);
    await updateTodayStats(finalStats).catch(console.error);
    setSession(DEFAULT_SESSION);
    setDisplayTime(0);
    setView('dashboard');
  }

  function continueAfterFeedback() {
    if (session.queue.length === 0) {
      setSession((s) => ({ ...s, sessionComplete: true, currentWord: null }));
      return;
    }
    const [next, ...rest] = session.queue;
    const phase = getPhase(next, session.mode);
    const selectOptions = phase === 'select' ? buildSelectOptions(next, words) : [];
    if (settings.tts && (phase === 'recall' || phase === 'immersive')) speak(next.word);
    setSession((s) => ({
      ...s,
      queue: rest,
      currentWord: next,
      phase,
      selectOptions,
      revealed: false,
      spellInput: '',
      wrongAnswer: false,
    }));
  }

  // ─── Library actions ──────────────────────────────────────────────────────

  async function handleDeleteWord(wordId: string) {
    setWords((ws) => ws.filter((w) => w.id !== wordId));
    await deleteWord(wordId).catch(console.error);
  }

  async function handleEditSave() {
    if (!editingWord) return;
    const updates = { word: editForm.word, meaning: editForm.meaning, ex: editForm.ex, cn: editForm.cn };
    setWords((ws) => ws.map((w) => (w.id === editingWord.id ? { ...w, ...updates } : w)));
    await updateWord(editingWord.id, updates).catch(console.error);
    setEditingWord(null);
  }

  async function handleImport() {
    const lines = importText.trim().split('\n').filter(Boolean);
    const data: ImportWordData[] = [];
    for (const line of lines) {
      const parts = line.split('|');
      if (parts.length < 2) continue;
      data.push({ word: parts[0], meaning: parts[1], ex: parts[2], cn: parts[3] });
    }
    if (!data.length) { setImportError('格式错误，至少需要 word|meaning'); return; }
    await importWordsAction(data).catch((e) => setImportError(e.message));
    const newWords = await getAllWords().catch(() => words);
    setWords(newWords);
    setImportText('');
    setImportError('');
    setShowImportModal(false);
  }

  async function handleAddWord() {
    if (!addForm.word.trim() || !addForm.meaning.trim()) return;
    const w = await addSingleWord(addForm).catch(() => null);
    if (w) {
      setWords((ws) => [w, ...ws]);
      setAddForm({ word: '', meaning: '', ex: '', cn: '' });
      setShowAddForm(false);
    }
  }

  // ─── Settings ─────────────────────────────────────────────────────────────

  async function updateSetting<K extends keyof VocabSettings>(key: K, val: VocabSettings[K]) {
    const updated = { ...settings, [key]: val };
    setSettings(updated);
    if (key === 'theme') setDark(val === 'dark');
    await updateVocabSettings({ [key]: val }).catch(console.error);
  }

  // ─── Computed values ──────────────────────────────────────────────────────

  const dueWords = srsGetDue(words);
  const masteredWords = words.filter((w) => w.status === 'mastered');
  const newWords = words.filter((w) => w.status === 'new');

  // Group due words by learned_date for review view
  const reviewGroups: Record<string, { words: VocabWordSRS[]; due: number }> = {};
  for (const w of words.filter((w) => w.status !== 'new')) {
    const date = w.learned_date ?? 'unknown';
    if (!reviewGroups[date]) reviewGroups[date] = { words: [], due: 0 };
    reviewGroups[date].words.push(w);
    if (w.next_review <= Date.now()) reviewGroups[date].due++;
  }

  // Library filtered words
  const libWords = words.filter((w) => {
    if (libFilter === 'all') return true;
    if (libFilter === 'learning') return w.status === 'learning' || w.status === 'new';
    if (libFilter === 'mastered') return w.status === 'mastered';
    if (libFilter === 'error') return w.stage === 0 && w.status === 'learning';
    return true;
  });

  // Session total
  const sessionTotal = session.completedCount + session.queue.length + (session.currentWord ? 1 : 0);

  // ─── CSS variables ────────────────────────────────────────────────────────

  const cssVars = dark
    ? `
    --vc-primary: #8dcdff;
    --vc-on-primary: #00344f;
    --vc-primary-container: #004b70;
    --vc-on-primary-container: #cae6ff;
    --vc-surface: #101416;
    --vc-surface-container: #1d2024;
    --vc-surface-container-high: #282c30;
    --vc-on-surface: #c5c7ce;
    --vc-on-surface-variant: #8b9198;
    --vc-outline: #45484f;
    --vc-error: #ffb4ab;
    --vc-error-container: #93000a;
    --vc-success: #6dd58c;
    --vc-success-container: #005319;
  `
    : `
    --vc-primary: #006493;
    --vc-on-primary: #ffffff;
    --vc-primary-container: #cae6ff;
    --vc-on-primary-container: #001e30;
    --vc-surface: #f8f9ff;
    --vc-surface-container: #f0f4f9;
    --vc-surface-container-high: #e4e8f0;
    --vc-on-surface: #191c1e;
    --vc-on-surface-variant: #42474e;
    --vc-outline: #72777f;
    --vc-error: #ba1a1a;
    --vc-error-container: #ffdad6;
    --vc-success: #006e21;
    --vc-success-container: #b8f4b5;
  `;

  // ─── Nav rail items ───────────────────────────────────────────────────────

  const NAV_ITEMS: { key: ViewType; label: string; icon: string }[] = [
    { key: 'dashboard', label: '概览', icon: '⊞' },
    { key: 'review', label: '复习', icon: '↺' },
    { key: 'library', label: '词库', icon: '≡' },
    { key: 'settings', label: '设置', icon: '⚙' },
  ];

  // ─── Render helpers ───────────────────────────────────────────────────────

  function NavRail() {
    return (
      <nav
        style={{
          width: 80,
          minWidth: 80,
          background: 'var(--vc-surface-container)',
          borderRight: '1px solid var(--vc-outline)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 16,
          gap: 4,
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--vc-primary)',
            marginBottom: 8,
            letterSpacing: 1,
          }}
        >
          词汇
        </div>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            onClick={() => setView(item.key)}
            style={{
              width: 64,
              padding: '10px 8px',
              borderRadius: 16,
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              background: view === item.key ? 'var(--vc-primary-container)' : 'transparent',
              color: view === item.key ? 'var(--vc-on-primary-container)' : 'var(--vc-on-surface-variant)',
              transition: 'background 0.2s',
            }}
          >
            <span style={{ fontSize: 20, lineHeight: 1 }}>{item.icon}</span>
            <span style={{ fontSize: 11 }}>{item.label}</span>
          </button>
        ))}
      </nav>
    );
  }

  // ─── Dashboard view ───────────────────────────────────────────────────────

  function DashboardView() {
    const todayMin = Math.floor(stats.today_time / 60);
    const todaySec = stats.today_time % 60;

    return (
      <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--vc-on-surface)', marginBottom: 20 }}>
          今日概览
        </h2>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12, marginBottom: 28 }}>
          {[
            { label: '今日时长', value: `${todayMin}m ${todaySec}s`, icon: '⏱' },
            { label: '已掌握单词', value: masteredWords.length, icon: '✓' },
            { label: '待复习', value: dueWords.length, icon: '↺' },
            { label: '今日新学', value: stats.today_learned, icon: '✦' },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                background: 'var(--vc-surface-container)',
                borderRadius: 16,
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <span style={{ fontSize: 28 }}>{stat.icon}</span>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--vc-primary)' }}>
                  {stat.value}
                </div>
                <div style={{ fontSize: 12, color: 'var(--vc-on-surface-variant)' }}>{stat.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Session start buttons */}
        <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--vc-on-surface-variant)', marginBottom: 12 }}>
          开始学习
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            {
              mode: 'learn' as ModeType,
              label: '📖 学习新词',
              sub: `${newWords.length} 个新词待学`,
              disabled: newWords.length === 0,
            },
            {
              mode: 'immersive' as ModeType,
              label: '🌊 沉浸模式',
              sub: '快速浏览，记忆新词',
              disabled: newWords.length === 0,
            },
            {
              mode: 'spell' as ModeType,
              label: '✏️ 拼写练习',
              sub: '强化拼写记忆',
              disabled: newWords.length === 0,
            },
            {
              mode: 'review' as ModeType,
              label: '↺ 复习到期词',
              sub: `${dueWords.length} 个词到期`,
              disabled: dueWords.length === 0,
            },
          ].map((btn) => (
            <button
              key={btn.mode}
              disabled={btn.disabled}
              onClick={() => startSession(btn.mode)}
              style={{
                padding: '14px 20px',
                borderRadius: 14,
                border: `1px solid ${btn.disabled ? 'var(--vc-outline)' : 'var(--vc-primary)'}`,
                background: btn.disabled ? 'transparent' : 'var(--vc-primary)',
                color: btn.disabled ? 'var(--vc-on-surface-variant)' : 'var(--vc-on-primary)',
                cursor: btn.disabled ? 'not-allowed' : 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 2,
                opacity: btn.disabled ? 0.5 : 1,
                transition: 'opacity 0.2s',
              }}
            >
              <span style={{ fontWeight: 600, fontSize: 15 }}>{btn.label}</span>
              <span style={{ fontSize: 12, opacity: 0.8 }}>{btn.sub}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ─── Review view ──────────────────────────────────────────────────────────

  function ReviewView() {
    const sortedGroups = Object.entries(reviewGroups).sort(([a], [b]) => b.localeCompare(a));

    return (
      <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--vc-on-surface)' }}>复习管理</h2>
          <button
            disabled={dueWords.length === 0}
            onClick={() => startSession('review_all')}
            style={{
              padding: '8px 16px',
              borderRadius: 20,
              border: 'none',
              background: dueWords.length > 0 ? 'var(--vc-primary)' : 'var(--vc-surface-container-high)',
              color: dueWords.length > 0 ? 'var(--vc-on-primary)' : 'var(--vc-on-surface-variant)',
              cursor: dueWords.length > 0 ? 'pointer' : 'not-allowed',
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            复习所有到期 ({dueWords.length})
          </button>
        </div>

        {sortedGroups.length === 0 ? (
          <p style={{ color: 'var(--vc-on-surface-variant)' }}>暂无学习记录</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sortedGroups.map(([date, group]) => (
              <div
                key={date}
                style={{
                  background: 'var(--vc-surface-container)',
                  borderRadius: 14,
                  padding: '14px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--vc-on-surface)' }}>{date}</div>
                  <div style={{ fontSize: 12, color: 'var(--vc-on-surface-variant)', marginTop: 2 }}>
                    共 {group.words.length} 词 · 到期 {group.due} 词
                  </div>
                </div>
                <button
                  disabled={group.due === 0}
                  onClick={() => startSession('review_all', date)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 16,
                    border: 'none',
                    background: group.due > 0 ? 'var(--vc-primary-container)' : 'var(--vc-surface-container-high)',
                    color: group.due > 0 ? 'var(--vc-on-primary-container)' : 'var(--vc-on-surface-variant)',
                    cursor: group.due > 0 ? 'pointer' : 'not-allowed',
                    fontWeight: 600,
                    fontSize: 13,
                  }}
                >
                  复习此组
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─── Library view ─────────────────────────────────────────────────────────

  function LibraryView() {
    const tabs: { key: typeof libFilter; label: string }[] = [
      { key: 'all', label: '全部' },
      { key: 'learning', label: '学习中' },
      { key: 'mastered', label: '已掌握' },
      { key: 'error', label: '错误' },
    ];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        {/* Toolbar */}
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--vc-outline)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setLibFilter(t.key)}
              style={{
                padding: '5px 14px',
                borderRadius: 16,
                border: `1px solid ${libFilter === t.key ? 'var(--vc-primary)' : 'var(--vc-outline)'}`,
                background: libFilter === t.key ? 'var(--vc-primary-container)' : 'transparent',
                color: libFilter === t.key ? 'var(--vc-on-primary-container)' : 'var(--vc-on-surface-variant)',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: libFilter === t.key ? 600 : 400,
              }}
            >
              {t.label}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setShowAddForm(true)}
            style={{
              padding: '5px 14px',
              borderRadius: 16,
              border: 'none',
              background: 'var(--vc-primary)',
              color: 'var(--vc-on-primary)',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            + 添加
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            style={{
              padding: '5px 14px',
              borderRadius: 16,
              border: `1px solid var(--vc-outline)`,
              background: 'transparent',
              color: 'var(--vc-on-surface)',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            导入
          </button>
        </div>

        {/* Add form inline */}
        {showAddForm && (
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--vc-outline)',
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              flexWrap: 'wrap',
              background: 'var(--vc-surface-container)',
            }}
          >
            {(['word', 'meaning', 'ex', 'cn'] as const).map((f) => (
              <input
                key={f}
                placeholder={f === 'word' ? '单词*' : f === 'meaning' ? '释义*' : f === 'ex' ? '例句' : '例句翻译'}
                value={addForm[f]}
                onChange={(e) => setAddForm((a) => ({ ...a, [f]: e.target.value }))}
                style={{
                  flex: f === 'word' || f === 'meaning' ? '1 1 120px' : '1 1 100px',
                  padding: '6px 10px',
                  borderRadius: 8,
                  border: '1px solid var(--vc-outline)',
                  background: 'var(--vc-surface)',
                  color: 'var(--vc-on-surface)',
                  fontSize: 13,
                  outline: 'none',
                }}
              />
            ))}
            <button
              onClick={handleAddWord}
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--vc-primary)',
                color: 'var(--vc-on-primary)',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              保存
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              style={{
                padding: '6px 10px',
                borderRadius: 8,
                border: '1px solid var(--vc-outline)',
                background: 'transparent',
                color: 'var(--vc-on-surface)',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              取消
            </button>
          </div>
        )}

        {/* Word list */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {libWords.length === 0 ? (
            <p style={{ padding: 20, color: 'var(--vc-on-surface-variant)' }}>暂无单词</p>
          ) : (
            libWords.map((w) => (
              <div
                key={w.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '10px 16px',
                  borderBottom: '1px solid var(--vc-outline)',
                  gap: 12,
                }}
              >
                {editingWord?.id === w.id ? (
                  <>
                    {(['word', 'meaning', 'ex', 'cn'] as const).map((f) => (
                      <input
                        key={f}
                        value={editForm[f]}
                        onChange={(e) => setEditForm((ef) => ({ ...ef, [f]: e.target.value }))}
                        style={{
                          flex: '1 1 80px',
                          padding: '4px 8px',
                          borderRadius: 6,
                          border: '1px solid var(--vc-outline)',
                          background: 'var(--vc-surface)',
                          color: 'var(--vc-on-surface)',
                          fontSize: 12,
                          outline: 'none',
                        }}
                      />
                    ))}
                    <button onClick={handleEditSave} style={smallBtnStyle('primary')}>✓</button>
                    <button onClick={() => setEditingWord(null)} style={smallBtnStyle('outline')}>✗</button>
                  </>
                ) : (
                  <>
                    <div style={{ flex: '0 0 120px', minWidth: 80 }}>
                      <div style={{ fontWeight: 600, color: 'var(--vc-on-surface)', fontSize: 14 }}>{w.word}</div>
                      <StatusBadge status={w.status} />
                    </div>
                    <div style={{ flex: 1, fontSize: 13, color: 'var(--vc-on-surface-variant)' }}>
                      <div>{w.meaning}</div>
                      {w.ex && <div style={{ fontSize: 11, opacity: 0.7 }}>{w.ex}</div>}
                    </div>
                    <button
                      onClick={() => {
                        setEditingWord(w);
                        setEditForm({ word: w.word, meaning: w.meaning, ex: w.ex ?? '', cn: w.cn ?? '' });
                      }}
                      style={smallBtnStyle('outline')}
                    >
                      编辑
                    </button>
                    <button onClick={() => handleDeleteWord(w.id)} style={smallBtnStyle('error')}>
                      删除
                    </button>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        {/* Import modal */}
        {showImportModal && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
            }}
          >
            <div
              style={{
                background: 'var(--vc-surface)',
                borderRadius: 20,
                padding: 24,
                width: 480,
                maxWidth: '90vw',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--vc-on-surface)', margin: 0 }}>
                批量导入单词
              </h3>
              <p style={{ fontSize: 12, color: 'var(--vc-on-surface-variant)', margin: 0 }}>
                每行格式：<code>单词|释义|例句|例句翻译</code>（后两项可省略）
              </p>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                rows={10}
                placeholder={'apple|苹果|An apple a day|每天一苹果\nbook|书'}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--vc-outline)',
                  background: 'var(--vc-surface-container)',
                  color: 'var(--vc-on-surface)',
                  fontSize: 13,
                  fontFamily: 'monospace',
                  resize: 'vertical',
                  outline: 'none',
                }}
              />
              {importError && (
                <p style={{ color: 'var(--vc-error)', fontSize: 12, margin: 0 }}>{importError}</p>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => { setShowImportModal(false); setImportError(''); }}
                  style={smallBtnStyle('outline')}
                >
                  取消
                </button>
                <button onClick={handleImport} style={smallBtnStyle('primary')}>
                  导入
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Settings view ────────────────────────────────────────────────────────

  function SettingsView() {
    return (
      <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--vc-on-surface)', marginBottom: 20 }}>
          设置
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 440 }}>
          {/* Theme */}
          <SettingRow label="深色模式" icon="🌙">
            <Toggle
              checked={dark}
              onChange={(v) => updateSetting('theme', v ? 'dark' : 'light')}
            />
          </SettingRow>

          {/* TTS */}
          <SettingRow label="朗读单词 (TTS)" icon="🔊">
            <Toggle
              checked={settings.tts}
              onChange={(v) => updateSetting('tts', v)}
            />
          </SettingRow>

          {/* TTS rate */}
          <SettingRow label={`朗读速度 (${settings.rate.toFixed(1)}x)`} icon="⚡">
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.1}
              value={settings.rate}
              onChange={(e) => updateSetting('rate', parseFloat(e.target.value))}
              style={{ width: 120 }}
            />
          </SettingRow>

          {/* Keyboard shortcuts */}
          <div
            style={{
              background: 'var(--vc-surface-container)',
              borderRadius: 14,
              padding: 16,
              marginTop: 8,
            }}
          >
            <div style={{ fontWeight: 600, color: 'var(--vc-on-surface)', marginBottom: 10 }}>键盘快捷键</div>
            {[
              ['空格', '翻转卡片 / 继续'],
              ['Enter', '沉浸模式 继续'],
            ].map(([k, v]) => (
              <div
                key={k}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '6px 0',
                  borderTop: '1px solid var(--vc-outline)',
                  fontSize: 13,
                  color: 'var(--vc-on-surface-variant)',
                }}
              >
                <kbd
                  style={{
                    background: 'var(--vc-surface-container-high)',
                    padding: '2px 8px',
                    borderRadius: 6,
                    fontSize: 12,
                    color: 'var(--vc-on-surface)',
                    border: '1px solid var(--vc-outline)',
                  }}
                >
                  {k}
                </kbd>
                <span>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─── Session view ─────────────────────────────────────────────────────────

  function SessionView() {
    const s = session;
    const word = s.currentWord;

    // Phase label
    const phaseLabel: Record<Phase, string> = {
      recall: 'RECALL',
      select: 'SELECT',
      spell: 'SPELL',
      feedback: 'FEEDBACK',
      immersive: 'IMMERSIVE',
    };

    // Progress: how many stages total for current word
    const totalStages = mode_needs_3stages(s.mode, word?.status ?? 'new') ? 3 : 1;

    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--vc-surface)',
          zIndex: 500,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '16px 16px 24px',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            width: '100%',
            maxWidth: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
          }}
        >
          <button
            onClick={exitSession}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: 22,
              color: 'var(--vc-on-surface-variant)',
              padding: 4,
            }}
          >
            ✕
          </button>
          <div style={{ fontSize: 12, color: 'var(--vc-on-surface-variant)', fontWeight: 600 }}>
            {s.completedCount} / {sessionTotal} · {fmtTime(displayTime)}
          </div>
          <div style={{ width: 30 }} />
        </div>

        {/* Session complete state */}
        {s.sessionComplete && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 16,
              animation: 'slideUp 0.4s ease',
            }}
          >
            <div style={{ fontSize: 56 }}>🎉</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--vc-on-surface)' }}>本轮完成！</div>
            <div style={{ fontSize: 14, color: 'var(--vc-on-surface-variant)' }}>
              学习了 {s.completedCount} 个单词 · 用时 {fmtTime(displayTime)}
            </div>
            <button
              onClick={exitSession}
              style={{
                marginTop: 8,
                padding: '12px 32px',
                borderRadius: 24,
                border: 'none',
                background: 'var(--vc-primary)',
                color: 'var(--vc-on-primary)',
                fontSize: 16,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              返回主页
            </button>
          </div>
        )}

        {/* Active session card */}
        {!s.sessionComplete && word && (
          <div
            style={{
              flex: 1,
              width: '100%',
              maxWidth: 560,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
              animation: 'slideUp 0.3s ease',
            }}
          >
            {/* Phase label */}
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 2,
                color: 'var(--vc-primary)',
                padding: '3px 10px',
                borderRadius: 10,
                background: 'var(--vc-primary-container)',
              }}
            >
              {phaseLabel[s.phase]}
            </div>

            {/* Progress dots */}
            {totalStages > 1 && (
              <div style={{ display: 'flex', gap: 6 }}>
                {Array.from({ length: totalStages }).map((_, i) => (
                  <div
                    key={i}
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background:
                        i < word.sessionStage
                          ? 'var(--vc-primary)'
                          : i === word.sessionStage
                          ? 'var(--vc-primary-container)'
                          : 'var(--vc-outline)',
                    }}
                  />
                ))}
              </div>
            )}

            {/* Card */}
            <div
              style={{
                flex: 1,
                width: '100%',
                background: 'var(--vc-surface-container)',
                borderRadius: 24,
                padding: '28px 24px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 16,
                animation: s.wrongAnswer ? 'shake 0.4s ease' : undefined,
                cursor: s.phase === 'recall' && !s.revealed ? 'pointer' : 'default',
                minHeight: 200,
              }}
              onClick={() => {
                if (s.phase === 'recall' && !s.revealed) {
                  setSession((p) => ({ ...p, revealed: true }));
                  speak(word.word);
                }
              }}
            >
              {/* Word */}
              <div
                style={{
                  fontSize: 36,
                  fontWeight: 700,
                  color: 'var(--vc-on-surface)',
                  textAlign: 'center',
                  letterSpacing: 1,
                }}
              >
                {word.word}
              </div>

              {/* Recall phase */}
              {s.phase === 'recall' && (
                <>
                  {!s.revealed ? (
                    <div
                      style={{
                        fontSize: 13,
                        color: 'var(--vc-on-surface-variant)',
                        padding: '6px 14px',
                        background: 'var(--vc-surface-container-high)',
                        borderRadius: 10,
                      }}
                    >
                      点击 / 空格 查看释义
                    </div>
                  ) : (
                    <MeaningBlock word={word} />
                  )}
                </>
              )}

              {/* Immersive phase */}
              {s.phase === 'immersive' && <MeaningBlock word={word} />}

              {/* Feedback phase */}
              {s.phase === 'feedback' && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: 'var(--vc-error)', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                    ✗ 答错了
                  </div>
                  <MeaningBlock word={word} />
                </div>
              )}
            </div>

            {/* Select phase: choices */}
            {s.phase === 'select' && (
              <div
                style={{
                  width: '100%',
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 10,
                }}
              >
                {s.selectOptions.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => handleResult(opt.id === word.id)}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 14,
                      border: '1px solid var(--vc-outline)',
                      background: 'var(--vc-surface-container)',
                      color: 'var(--vc-on-surface)',
                      cursor: 'pointer',
                      fontSize: 14,
                      textAlign: 'left',
                      transition: 'background 0.15s',
                    }}
                  >
                    {opt.meaning}
                  </button>
                ))}
              </div>
            )}

            {/* Spell phase: input */}
            {(s.phase === 'spell') && (
              <div style={{ width: '100%', display: 'flex', gap: 8 }}>
                <input
                  autoFocus
                  type="text"
                  placeholder="输入单词拼写..."
                  value={s.spellInput}
                  onChange={(e) => setSession((p) => ({ ...p, spellInput: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleResult(s.spellInput.trim().toLowerCase() === word.word.toLowerCase());
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    borderRadius: 14,
                    border: '1px solid var(--vc-outline)',
                    background: 'var(--vc-surface-container)',
                    color: 'var(--vc-on-surface)',
                    fontSize: 16,
                    outline: 'none',
                  }}
                />
                <button
                  onClick={() => handleResult(s.spellInput.trim().toLowerCase() === word.word.toLowerCase())}
                  style={{
                    padding: '12px 18px',
                    borderRadius: 14,
                    border: 'none',
                    background: 'var(--vc-primary)',
                    color: 'var(--vc-on-primary)',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: 14,
                  }}
                >
                  提交
                </button>
              </div>
            )}

            {/* Recall / Immersive action buttons */}
            {(s.phase === 'recall' && s.revealed) && (
              <div style={{ display: 'flex', gap: 12, width: '100%' }}>
                <button
                  onClick={() => handleResult(false)}
                  style={{
                    flex: 1,
                    padding: '14px',
                    borderRadius: 16,
                    border: 'none',
                    background: 'var(--vc-error-container)',
                    color: 'var(--vc-error)',
                    fontWeight: 700,
                    fontSize: 15,
                    cursor: 'pointer',
                  }}
                >
                  ✗ 不会
                </button>
                <button
                  onClick={() => handleResult(true)}
                  style={{
                    flex: 1,
                    padding: '14px',
                    borderRadius: 16,
                    border: 'none',
                    background: 'var(--vc-success-container)',
                    color: 'var(--vc-success)',
                    fontWeight: 700,
                    fontSize: 15,
                    cursor: 'pointer',
                  }}
                >
                  ✓ 认识
                </button>
              </div>
            )}

            {s.phase === 'immersive' && (
              <button
                onClick={() => handleResult(true)}
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: 16,
                  border: 'none',
                  background: 'var(--vc-primary)',
                  color: 'var(--vc-on-primary)',
                  fontWeight: 700,
                  fontSize: 15,
                  cursor: 'pointer',
                }}
              >
                继续 →
              </button>
            )}

            {s.phase === 'feedback' && (
              <button
                onClick={continueAfterFeedback}
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: 16,
                  border: 'none',
                  background: 'var(--vc-primary)',
                  color: 'var(--vc-on-primary)',
                  fontWeight: 700,
                  fontSize: 15,
                  cursor: 'pointer',
                }}
              >
                继续
              </button>
            )}
          </div>
        )}

        {/* Undo toast */}
        {s.showUndo && s.undoWord && (
          <div
            style={{
              position: 'fixed',
              bottom: 32,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'var(--vc-surface-container-high)',
              borderRadius: 12,
              padding: '10px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
              zIndex: 600,
              animation: 'slideUp 0.3s ease',
            }}
          >
            <span style={{ fontSize: 13, color: 'var(--vc-on-surface)' }}>
              已记住 "{s.undoWord.word}"
            </span>
            <button
              onClick={handleUndo}
              style={{
                padding: '4px 12px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--vc-primary)',
                color: 'var(--vc-on-primary)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              撤销
            </button>
          </div>
        )}
      </div>
    );
  }

  // ─── Sub-components ───────────────────────────────────────────────────────

  function MeaningBlock({ word }: { word: SessionWord | VocabWordSRS }) {
    return (
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 18, color: 'var(--vc-on-surface)', fontWeight: 500 }}>{word.meaning}</div>
        {word.ex && (
          <div style={{ fontSize: 13, color: 'var(--vc-on-surface-variant)', fontStyle: 'italic' }}>
            {word.ex}
          </div>
        )}
        {word.cn && (
          <div style={{ fontSize: 12, color: 'var(--vc-on-surface-variant)', opacity: 0.8 }}>
            {word.cn}
          </div>
        )}
      </div>
    );
  }

  function StatusBadge({ status }: { status: VocabWordSRS['status'] }) {
    const map: Record<string, [string, string]> = {
      new: ['#e8f5e9', '#2e7d32'],
      learning: ['#e3f2fd', '#1565c0'],
      review: ['#fff8e1', '#f57f17'],
      mastered: ['#f3e5f5', '#6a1b9a'],
    };
    const [bg, color] = map[status] ?? ['#eee', '#555'];
    const labelMap: Record<string, string> = { new: '新词', learning: '学习中', review: '复习', mastered: '已掌握' };
    return (
      <span
        style={{
          fontSize: 10,
          padding: '1px 6px',
          borderRadius: 6,
          background: bg,
          color,
          fontWeight: 600,
        }}
      >
        {labelMap[status]}
      </span>
    );
  }

  function SettingRow({ label, icon, children }: { label: string; icon: string; children: ReactNode }) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px',
          borderRadius: 14,
          background: 'var(--vc-surface-container)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>{icon}</span>
          <span style={{ fontSize: 14, color: 'var(--vc-on-surface)' }}>{label}</span>
        </div>
        {children}
      </div>
    );
  }

  function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
    return (
      <button
        onClick={() => onChange(!checked)}
        style={{
          width: 44,
          height: 24,
          borderRadius: 12,
          border: 'none',
          background: checked ? 'var(--vc-primary)' : 'var(--vc-outline)',
          cursor: 'pointer',
          position: 'relative',
          transition: 'background 0.2s',
          padding: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: checked ? 22 : 2,
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: 'white',
            transition: 'left 0.2s',
          }}
        />
      </button>
    );
  }

  function smallBtnStyle(variant: 'primary' | 'outline' | 'error'): CSSProperties {
    const map: Record<string, CSSProperties> = {
      primary: {
        padding: '5px 12px',
        borderRadius: 8,
        border: 'none',
        background: 'var(--vc-primary)',
        color: 'var(--vc-on-primary)',
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: 600,
      },
      outline: {
        padding: '5px 12px',
        borderRadius: 8,
        border: '1px solid var(--vc-outline)',
        background: 'transparent',
        color: 'var(--vc-on-surface)',
        cursor: 'pointer',
        fontSize: 12,
      },
      error: {
        padding: '5px 12px',
        borderRadius: 8,
        border: 'none',
        background: 'var(--vc-error-container)',
        color: 'var(--vc-error)',
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: 600,
      },
    };
    return map[variant];
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const viewMap: Record<Exclude<ViewType, 'session'>, ReactNode> = {
    dashboard: <DashboardView />,
    review: <ReviewView />,
    library: <LibraryView />,
    settings: <SettingsView />,
  };

  return (
    <>
      <style>{`
        :root { ${cssVars} }
        @keyframes shake {
          0%,100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          75% { transform: translateX(8px); }
        }
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      <div
        style={{
          display: 'flex',
          height: '100%',
          background: 'var(--vc-surface)',
          color: 'var(--vc-on-surface)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          overflow: 'hidden',
        }}
      >
        <NavRail />
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {view === 'session' ? <SessionView /> : viewMap[view]}
        </div>
      </div>
    </>
  );
}
