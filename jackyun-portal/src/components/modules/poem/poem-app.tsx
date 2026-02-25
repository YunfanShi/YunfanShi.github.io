'use client';

import { useState, useEffect, useRef, useCallback, useTransition } from 'react';
import type { PoemRecord } from '@/types/poem';
import { savePoemSession, deletePoem, updateMastery } from '@/actions/poem';
import AddPoemForm from './add-poem-form';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(sec: number) {
  const m = Math.floor(sec / 60)
    .toString()
    .padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function calcScore(retreats: number, studyModeUsed: boolean) {
  return Math.max(0, 100 - retreats * 5 - (studyModeUsed ? 20 : 0));
}

const MASTERY_COLORS = ['#bbb', '#EA4335', '#FBBC05', '#FBBC05', '#34A853', '#34A853'];
const MASTERY_LABELS = ['未学', '初识', '熟悉', '较熟', '熟练', '完全掌握'];

function Stars({ level }: { level: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className="material-icons-round"
          style={{ fontSize: 14, color: i <= level ? MASTERY_COLORS[level] : '#ccc' }}
        >
          {i <= level ? 'star' : 'star_border'}
        </span>
      ))}
    </div>
  );
}

// ─── Mask CSS ─────────────────────────────────────────────────────────────────

const MASK_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@300;400;500;700&display=swap');
.poem-recite-root {
  font-family: 'Noto Serif SC', 'Noto Serif', serif;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
}
.poem-line-wrapper {
  position: relative;
  display: block;
  padding: 14px 22px;
  border-radius: 10px;
  background: rgba(255,255,255,0.9);
  cursor: pointer;
  user-select: none;
  overflow: visible;
  transition: box-shadow 0.2s;
}
.poem-line-wrapper:hover {
  box-shadow: 0 2px 12px rgba(92,107,192,0.12);
}
.poem-line-text {
  font-size: 1.5rem;
  font-weight: 500;
  letter-spacing: 0.15em;
  color: #2d2d4e;
  line-height: 1.6;
  display: block;
}
.poem-mask {
  position: absolute;
  top: -5%; left: -5%; width: 110%; height: 110%;
  background: #e8eaf6;
  border-radius: 8px;
  opacity: 1;
  transform: scale(1);
  filter: blur(0px);
  transition: opacity 0.6s cubic-bezier(0.34, 1.56, 0.64, 1),
              transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1),
              filter 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9fa8da;
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  font-family: system-ui, sans-serif;
}
.poem-line-wrapper:hover .poem-mask {
  background: #d5d8f8;
}
.poem-line-wrapper.revealed .poem-mask {
  opacity: 0;
  transform: scale(1.15);
  filter: blur(12px);
  pointer-events: none;
}
`;

// ─── List View ────────────────────────────────────────────────────────────────

function ListView({
  poems,
  onSelect,
  onDelete,
}: {
  poems: PoemRecord[];
  onSelect: (p: PoemRecord) => void;
  onDelete: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [isPending, startTransition] = useTransition();

  const filtered = poems.filter(
    (p) =>
      !search ||
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      (p.author ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  function handleDelete(poem: PoemRecord) {
    if (!confirm(`确定删除「${poem.title}」吗？`)) return;
    startTransition(async () => {
      await deletePoem(poem.id);
      onDelete(poem.id);
    });
  }

  const totalSessions = poems.reduce((s, p) => s + p.completion_count, 0);
  const fullyMastered = poems.filter((p) => p.mastery_level === 5).length;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[var(--foreground)]">诗词天地</h1>
        <p className="mt-1 text-[var(--muted-foreground)]">积累诗词，熟读成诵，感受文字之美</p>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] px-4 py-3">
          <p className="text-xs text-[var(--muted-foreground)]">诗词总数</p>
          <p className="mt-1 text-2xl font-bold text-[var(--foreground)]">{poems.length}</p>
        </div>
        <div className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] px-4 py-3">
          <p className="text-xs text-[var(--muted-foreground)]">已完成背诵</p>
          <p className="mt-1 text-2xl font-bold text-[#4285F4]">{totalSessions}</p>
        </div>
        <div className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] px-4 py-3">
          <p className="text-xs text-[var(--muted-foreground)]">完全掌握</p>
          <p className="mt-1 text-2xl font-bold text-[#34A853]">{fullyMastered}</p>
        </div>
      </div>

      <AddPoemForm />

      {/* Search */}
      <div className="mb-4 relative">
        <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-base text-[var(--muted-foreground)]">
          search
        </span>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索诗词标题或作者…"
          className="w-full rounded-[8px] border border-[var(--card-border)] bg-[var(--card)] py-2 pl-9 pr-3 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4] transition-colors"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[16px] border border-dashed border-[var(--card-border)] py-20 text-center">
          <span className="material-icons-round mb-4 text-5xl text-[var(--muted-foreground)]">
            auto_stories
          </span>
          <h3 className="text-base font-semibold text-[var(--foreground)]">
            {poems.length === 0 ? '还没有诗词' : '没有匹配的诗词'}
          </h3>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            {poems.length === 0 ? '使用上方表单添加你的第一首诗词' : '尝试其他关键词'}
          </p>
        </div>
      ) : (
        <div className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)]">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((poem, idx) => {
              const lines = poem.content.split('\n').filter((l) => l.trim());
              return (
                <div
                  key={poem.id}
                  className={`flex flex-col gap-3 p-4 transition-colors hover:bg-[var(--background)] ${
                    idx < filtered.length - 1
                      ? 'border-b border-[var(--card-border)] sm:border-r'
                      : ''
                  }`}
                >
                  {/* Title + author */}
                  <div>
                    <h3 className="font-semibold text-[var(--foreground)] leading-tight">
                      {poem.title}
                    </h3>
                    {poem.author && (
                      <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                        {poem.author}
                      </p>
                    )}
                  </div>

                  {/* Stats row */}
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--muted-foreground)]">
                    <span>{lines.length} 行</span>
                    {poem.completion_count > 0 && <span>完成 {poem.completion_count} 次</span>}
                    {poem.best_time != null && <span>最佳 {fmtTime(poem.best_time)}</span>}
                  </div>

                  {/* Mastery + actions */}
                  <div className="flex items-center justify-between mt-auto">
                    <div className="flex flex-col gap-0.5">
                      <Stars level={poem.mastery_level} />
                      <span className="text-[10px] text-[var(--muted-foreground)]">
                        {MASTERY_LABELS[poem.mastery_level]}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onSelect(poem)}
                        className="flex items-center gap-1 rounded-[8px] bg-[#5c6bc0] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#4a5ab0] transition-colors"
                      >
                        <span className="material-icons-round text-[14px]">menu_book</span>
                        开始背诵
                      </button>
                      <button
                        onClick={() => handleDelete(poem)}
                        disabled={isPending}
                        title="删除"
                        className="rounded-[8px] p-1.5 text-[var(--muted-foreground)] hover:text-[#EA4335] hover:bg-[#EA433515] transition-colors disabled:opacity-40"
                      >
                        <span className="material-icons-round text-[18px]">delete_outline</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="border-t border-[var(--card-border)] px-4 py-2 text-xs text-[var(--muted-foreground)]">
            显示 {filtered.length} / {poems.length} 首诗词
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Recitation View ──────────────────────────────────────────────────────────

function RecitationView({
  poem,
  onExit,
  onSaved,
}: {
  poem: PoemRecord;
  onExit: () => void;
  onSaved: (updated: Partial<PoemRecord>) => void;
}) {
  const lines = poem.content.split('\n').filter((l) => l.trim());
  const total = lines.length;

  const [revealed, setRevealed] = useState<boolean[]>(() => Array(total).fill(false));
  const [paused, setPaused] = useState(false);
  const [studyModeUsed, setStudyModeUsed] = useState(false);
  const [studyActive, setStudyActive] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [retreats, setRetreats] = useState(0);
  const [mastery, setMastery] = useState(poem.mastery_level);
  const [, startTransition] = useTransition();

  // Refs for stable callback access to latest state
  const revealedRef = useRef(revealed);
  const studyActiveRef = useRef(studyActive);
  const studyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elapsedRef = useRef(0);
  const retreatsRef = useRef(0);
  const studyModeUsedRef = useRef(false);
  const completedRef = useRef(false);

  useEffect(() => {
    revealedRef.current = revealed;
  }, [revealed]);
  useEffect(() => {
    studyActiveRef.current = studyActive;
  }, [studyActive]);
  useEffect(() => {
    elapsedRef.current = elapsed;
  }, [elapsed]);
  useEffect(() => {
    retreatsRef.current = retreats;
  }, [retreats]);
  useEffect(() => {
    studyModeUsedRef.current = studyModeUsed;
  }, [studyModeUsed]);

  // Timer
  useEffect(() => {
    if (paused || completed) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [paused, completed]);

  // Completion detection
  const revealedCount = revealed.filter(Boolean).length;
  useEffect(() => {
    if (completedRef.current) return;
    if (revealedCount === total && total > 0 && !studyActiveRef.current) {
      completedRef.current = true;
      setCompleted(true);
      startTransition(async () => {
        try {
          await savePoemSession(poem.id, {
            timeSeconds: elapsedRef.current,
            retreats: retreatsRef.current,
            studyModeUsed: studyModeUsedRef.current,
          });
          onSaved({
            completion_count: poem.completion_count + 1,
            best_time:
              poem.best_time === null || elapsedRef.current < poem.best_time
                ? elapsedRef.current
                : poem.best_time,
          });
        } catch {
          // silently ignore save errors
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealedCount]);

  // Reveal next unrevealed line
  const revealNext = useCallback(() => {
    const prev = revealedRef.current;
    const idx = prev.findIndex((v) => !v);
    if (idx === -1) return;
    const next = [...prev];
    next[idx] = true;
    setRevealed(next);
  }, []);

  // Hide last revealed line (retreat)
  const hideLast = useCallback(() => {
    const prev = revealedRef.current;
    let idx = -1;
    for (let i = prev.length - 1; i >= 0; i--) {
      if (prev[i]) {
        idx = i;
        break;
      }
    }
    if (idx === -1) return;
    const next = [...prev];
    next[idx] = false;
    setRevealed(next);
    setRetreats((r) => r + 1);
  }, []);

  // Study mode: reveal all for 3 seconds then restore
  const triggerStudyMode = useCallback(() => {
    if (studyActiveRef.current) return;
    setStudyModeUsed(true);
    setStudyActive(true);
    const snapshot = [...revealedRef.current];
    setRevealed(Array(total).fill(true));
    studyTimerRef.current = setTimeout(() => {
      setRevealed(snapshot);
      setStudyActive(false);
    }, 3000);
  }, [total]);

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (completedRef.current) return;
      if (e.key === ' ' || e.key === 'ArrowRight') {
        e.preventDefault();
        revealNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        hideLast();
      } else if (e.key === 'Escape') {
        setPaused((p) => !p);
      } else if (e.key === 's' || e.key === 'S') {
        triggerStudyMode();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [revealNext, hideLast, triggerStudyMode]);

  // Cleanup study timer on unmount
  useEffect(() => {
    return () => {
      if (studyTimerRef.current) clearTimeout(studyTimerRef.current);
    };
  }, []);

  function handleMastery(level: number) {
    setMastery(level);
    startTransition(() => updateMastery(poem.id, level));
  }

  function handleRestart() {
    completedRef.current = false;
    setRevealed(Array(total).fill(false));
    setElapsed(0);
    setRetreats(0);
    setStudyModeUsed(false);
    setStudyActive(false);
    setCompleted(false);
  }

  const score = calcScore(retreats, studyModeUsed);
  const progressPct = total > 0 ? (revealedCount / total) * 100 : 0;

  return (
    <>
      <style>{MASK_CSS}</style>
      <div className="poem-recite-root fixed inset-0 z-50 flex flex-col overflow-hidden">

        {/* ── Top Bar ── */}
        <div
          className="flex items-center gap-2 px-4 py-3 shrink-0"
          style={{
            background: 'rgba(255,255,255,0.88)',
            backdropFilter: 'blur(12px)',
            borderBottom: '1px solid rgba(92,107,192,0.15)',
          }}
        >
          <button
            onClick={onExit}
            className="flex items-center gap-1 rounded-[8px] px-2 py-1.5 text-sm text-[#5c5c8a] hover:bg-[#e8eaf6] transition-colors shrink-0"
          >
            <span className="material-icons-round text-base">arrow_back</span>
            <span className="hidden sm:inline">退出</span>
          </button>

          <div className="flex-1 min-w-0 mx-2">
            <p className="text-sm font-bold text-[#2d2d4e] truncate">{poem.title}</p>
            {poem.author && (
              <p className="text-[11px] text-[#9fa8da] leading-none mt-0.5">{poem.author}</p>
            )}
          </div>

          <span className="text-sm font-mono text-[#5c5c8a] tabular-nums shrink-0">
            {fmtTime(elapsed)}
          </span>

          <button
            onClick={triggerStudyMode}
            disabled={studyActive}
            title="学习模式 — 显示全部3秒 (S)"
            className="rounded-[8px] px-2 py-1.5 text-xs font-medium text-[#5c5c8a] border border-[#c5cae9] hover:bg-[#e8eaf6] disabled:opacity-40 transition-colors shrink-0"
          >
            S
          </button>

          <button
            onClick={() => setPaused(true)}
            title="暂停 (Esc)"
            className="rounded-[8px] p-1.5 text-[#5c5c8a] hover:bg-[#e8eaf6] transition-colors shrink-0"
          >
            <span className="material-icons-round text-base">pause</span>
          </button>
        </div>

        {/* ── Progress Bar ── */}
        <div
          className="px-4 py-2 shrink-0"
          style={{ background: 'rgba(255,255,255,0.6)' }}
        >
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 rounded-full bg-[#e8eaf6] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${progressPct}%`,
                  background: 'linear-gradient(90deg, #7986cb, #5c6bc0)',
                }}
              />
            </div>
            <span className="text-xs text-[#5c5c8a] tabular-nums whitespace-nowrap shrink-0">
              {revealedCount}/{total}
            </span>
          </div>
        </div>

        {/* ── Poem Lines ── */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="mx-auto max-w-xl space-y-3">
            {lines.map((line, idx) => (
              <div
                key={idx}
                className={`poem-line-wrapper${revealed[idx] ? ' revealed' : ''}`}
                onClick={() => {
                  if (!revealed[idx]) {
                    const next = [...revealed];
                    next[idx] = true;
                    setRevealed(next);
                  }
                }}
              >
                <span className="poem-line-text">{line}</span>
                <div className="poem-mask">点击显示</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Bottom Controls ── */}
        <div
          className="flex items-center justify-center gap-3 px-4 py-3 shrink-0"
          style={{
            background: 'rgba(255,255,255,0.88)',
            backdropFilter: 'blur(12px)',
            borderTop: '1px solid rgba(92,107,192,0.15)',
          }}
        >
          {/* Mastery stars */}
          <div className="flex items-center gap-1 mr-auto">
            {[1, 2, 3, 4, 5].map((level) => (
              <button
                key={level}
                onClick={() => handleMastery(level)}
                title={`${level}星`}
                className="transition-transform hover:scale-110"
              >
                <span
                  className="material-icons-round"
                  style={{
                    fontSize: 20,
                    color: level <= mastery ? MASTERY_COLORS[level] : '#ccc',
                  }}
                >
                  {level <= mastery ? 'star' : 'star_border'}
                </span>
              </button>
            ))}
          </div>

          <button
            onClick={hideLast}
            className="flex items-center gap-1.5 rounded-[10px] border border-[#c5cae9] px-4 py-2 text-sm text-[#5c5c8a] hover:bg-[#e8eaf6] transition-colors"
          >
            <span className="material-icons-round text-base">arrow_back</span>
            后退 {retreats > 0 && <span className="opacity-60">({retreats})</span>}
          </button>

          <button
            onClick={revealNext}
            disabled={revealedCount === total}
            className="flex items-center gap-1.5 rounded-[10px] bg-[#5c6bc0] px-5 py-2 text-sm font-medium text-white hover:bg-[#4a5ab0] disabled:opacity-40 transition-colors"
          >
            显示下一行
            <span className="material-icons-round text-base">arrow_forward</span>
          </button>
        </div>
      </div>

      {/* ── Pause Overlay ── */}
      {paused && (
        <div
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center"
          style={{ backdropFilter: 'blur(8px)', background: 'rgba(0,0,0,0.3)' }}
          onClick={() => setPaused(false)}
        >
          <div className="rounded-[20px] bg-white/95 p-10 text-center shadow-2xl">
            <span className="material-icons-round text-6xl text-[#5c6bc0]">pause_circle</span>
            <p className="mt-4 text-xl font-bold text-[#2d2d4e]">已暂停</p>
            <p className="mt-1 text-sm text-[#9fa8da]">点击任意处继续</p>
            <p className="mt-3 text-2xl font-mono font-bold text-[#5c6bc0]">{fmtTime(elapsed)}</p>
          </div>
        </div>
      )}

      {/* ── Study Mode Banner ── */}
      {studyActive && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[55] rounded-full bg-[#5c6bc0] px-5 py-2 text-sm text-white shadow-lg pointer-events-none">
          学习模式 — 3秒后隐藏
        </div>
      )}

      {/* ── Completion Screen ── */}
      {completed && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center"
          style={{ backdropFilter: 'blur(12px)', background: 'rgba(45,45,78,0.5)' }}
        >
          <div className="rounded-[24px] bg-white/97 p-8 text-center shadow-2xl max-w-sm w-full mx-4">
            <div className="text-5xl mb-3">🎉</div>
            <h2 className="text-2xl font-bold text-[#2d2d4e]">背诵完成！</h2>
            <p className="mt-0.5 text-sm text-[#9fa8da]">{poem.title}</p>

            {/* Stats grid */}
            <div className="mt-5 grid grid-cols-3 gap-3">
              <div className="rounded-[12px] bg-[#e8eaf6] p-3">
                <p className="text-[11px] text-[#5c5c8a]">用时</p>
                <p className="mt-1 text-lg font-bold font-mono text-[#2d2d4e]">
                  {fmtTime(elapsed)}
                </p>
              </div>
              <div className="rounded-[12px] bg-[#e8eaf6] p-3">
                <p className="text-[11px] text-[#5c5c8a]">后退</p>
                <p className="mt-1 text-lg font-bold text-[#2d2d4e]">{retreats}次</p>
              </div>
              <div className="rounded-[12px] bg-[#e8eaf6] p-3">
                <p className="text-[11px] text-[#5c5c8a]">得分</p>
                <p
                  className="mt-1 text-lg font-bold"
                  style={{
                    color: score >= 80 ? '#34A853' : score >= 60 ? '#FBBC05' : '#EA4335',
                  }}
                >
                  {score}
                </p>
              </div>
            </div>

            {studyModeUsed && (
              <p className="mt-2 text-xs text-[#9fa8da]">⚠ 使用了学习模式（-20分）</p>
            )}

            {/* Mastery update */}
            <div className="mt-4">
              <p className="text-xs text-[#9fa8da] mb-2">更新掌握度</p>
              <div className="flex items-center justify-center gap-2">
                {[1, 2, 3, 4, 5].map((level) => (
                  <button
                    key={level}
                    onClick={() => handleMastery(level)}
                    className="transition-transform hover:scale-110"
                  >
                    <span
                      className="material-icons-round"
                      style={{
                        fontSize: 28,
                        color: level <= mastery ? MASTERY_COLORS[level] : '#ccc',
                      }}
                    >
                      {level <= mastery ? 'star' : 'star_border'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 flex gap-3">
              <button
                onClick={handleRestart}
                className="flex-1 rounded-[10px] border border-[#c5cae9] py-2.5 text-sm text-[#5c5c8a] hover:bg-[#e8eaf6] transition-colors"
              >
                再来一次
              </button>
              <button
                onClick={onExit}
                className="flex-1 rounded-[10px] bg-[#5c6bc0] py-2.5 text-sm font-medium text-white hover:bg-[#4a5ab0] transition-colors"
              >
                返回列表
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export default function PoemApp({ initialPoems }: { initialPoems: PoemRecord[] }) {
  const [poems, setPoems] = useState<PoemRecord[]>(initialPoems);
  const [selectedPoem, setSelectedPoem] = useState<PoemRecord | null>(null);

  if (selectedPoem) {
    return (
      <RecitationView
        poem={selectedPoem}
        onExit={() => setSelectedPoem(null)}
        onSaved={(updated) => {
          setPoems((prev) =>
            prev.map((p) => (p.id === selectedPoem.id ? { ...p, ...updated } : p)),
          );
        }}
      />
    );
  }

  return (
    <ListView
      poems={poems}
      onSelect={setSelectedPoem}
      onDelete={(id) => setPoems((prev) => prev.filter((p) => p.id !== id))}
    />
  );
}
