'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

type Mode = 'focus' | 'break';

const DURATIONS: Record<Mode, number> = { focus: 25 * 60, break: 5 * 60 };

const FOCUS_COLOR = '#4285F4';
const BREAK_COLOR = '#34A853';

const RADIUS   = 54;
const CIRCUM   = 2 * Math.PI * RADIUS;

function pad(n: number) { return String(n).padStart(2, '0'); }

export default function PomodoroTimer() {
  const [mode, setMode]             = useState<Mode>('focus');
  const [timeLeft, setTimeLeft]     = useState(DURATIONS.focus);
  const [running, setRunning]       = useState(false);
  const [sessions, setSessions]     = useState(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const modeRef     = useRef<Mode>('focus');
  const timeRef     = useRef(DURATIONS.focus);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  const notify = useCallback((msg: string) => {
    if (typeof window === 'undefined') return;
    if (Notification.permission === 'granted') {
      new Notification('番茄钟', { body: msg, icon: '/favicon.ico' });
    } else {
      // Fallback: simple alert-like banner handled by state
    }
  }, []);

  const tick = useCallback(() => {
    timeRef.current -= 1;
    setTimeLeft(timeRef.current);

    if (timeRef.current <= 0) {
      clearTimer();
      setRunning(false);

      if (modeRef.current === 'focus') {
        setSessions((s) => s + 1);
        notify('专注结束！休息一下吧 🎉');
        const nextMode: Mode = 'break';
        modeRef.current = nextMode;
        timeRef.current = DURATIONS[nextMode];
        setMode(nextMode);
        setTimeLeft(DURATIONS[nextMode]);
      } else {
        notify('休息结束！准备好专注了吗？💪');
        const nextMode: Mode = 'focus';
        modeRef.current = nextMode;
        timeRef.current = DURATIONS[nextMode];
        setMode(nextMode);
        setTimeLeft(DURATIONS[nextMode]);
      }
    }
  }, [clearTimer, notify]);

  const handleStart = useCallback(() => {
    if (typeof window !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    intervalRef.current = setInterval(tick, 1000);
    setRunning(true);
  }, [tick]);

  const handlePause = useCallback(() => {
    clearTimer();
    setRunning(false);
  }, [clearTimer]);

  const handleReset = useCallback(() => {
    clearTimer();
    setRunning(false);
    timeRef.current = DURATIONS[modeRef.current];
    setTimeLeft(DURATIONS[modeRef.current]);
  }, [clearTimer]);

  const switchMode = useCallback((m: Mode) => {
    clearTimer();
    setRunning(false);
    modeRef.current = m;
    timeRef.current = DURATIONS[m];
    setMode(m);
    setTimeLeft(DURATIONS[m]);
  }, [clearTimer]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const total    = DURATIONS[mode];
  const color    = mode === 'focus' ? FOCUS_COLOR : BREAK_COLOR;
  const pct      = timeLeft / total;
  const dashOffset = CIRCUM * pct;

  const minutes  = Math.floor(timeLeft / 60);
  const seconds  = timeLeft % 60;

  return (
    <div className="flex flex-col items-center gap-5">
      {/* Mode toggle */}
      <div className="flex rounded-[10px] border border-[var(--card-border)] overflow-hidden">
        {(['focus', 'break'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => switchMode(m)}
            className="px-5 py-1.5 text-sm font-medium transition-colors"
            style={{
              backgroundColor: mode === m ? color : 'transparent',
              color: mode === m ? '#fff' : 'var(--muted-foreground)',
            }}
          >
            {m === 'focus' ? '专注' : '休息'}
          </button>
        ))}
      </div>

      {/* Progress ring + timer */}
      <div className="relative flex items-center justify-center" style={{ width: 160, height: 160 }}>
        <svg width="160" height="160" className="absolute inset-0 -rotate-90" viewBox="0 0 124 124">
          {/* Track */}
          <circle cx="62" cy="62" r={RADIUS} fill="none" stroke="var(--card-border)" strokeWidth="8" />
          {/* Progress */}
          <circle
            cx="62" cy="62" r={RADIUS}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={CIRCUM}
            strokeDashoffset={CIRCUM - dashOffset}
            style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
          />
        </svg>
        <div className="flex flex-col items-center">
          <span className="text-4xl font-mono font-bold tabular-nums" style={{ color }}>
            {pad(minutes)}:{pad(seconds)}
          </span>
          <span className="text-xs text-[var(--muted-foreground)] mt-0.5">
            {mode === 'focus' ? '专注中' : '休息中'}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        {!running ? (
          <button
            onClick={handleStart}
            className="flex items-center gap-1.5 rounded-[10px] px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: color }}
          >
            <span className="material-icons-round text-base">play_arrow</span>
            开始
          </button>
        ) : (
          <button
            onClick={handlePause}
            className="flex items-center gap-1.5 rounded-[10px] px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#FBBC05' }}
          >
            <span className="material-icons-round text-base">pause</span>
            暂停
          </button>
        )}
        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 rounded-[10px] border border-[var(--card-border)] px-4 py-2 text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
        >
          <span className="material-icons-round text-base">restart_alt</span>
          重置
        </button>
      </div>

      {/* Session counter */}
      <div className="flex items-center gap-1.5 text-sm text-[var(--muted-foreground)]">
        <span className="material-icons-round text-base">workspace_premium</span>
        今日专注 <span className="font-semibold text-[var(--foreground)]">{sessions}</span> 个番茄
      </div>
    </div>
  );
}
