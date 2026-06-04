'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// 4-7-8 breathing: inhale 4s, hold 7s, exhale 8s
type Phase = 'inhale' | 'hold' | 'exhale' | 'idle';

const PHASES: { phase: Phase; label: string; duration: number; color: string }[] = [
  { phase: 'inhale', label: '吸气...', duration: 4,  color: '#4285F4' },
  { phase: 'hold',   label: '屏息...', duration: 7,  color: '#FBBC05' },
  { phase: 'exhale', label: '呼气...', duration: 8,  color: '#34A853' },
];

const CIRCLE_MIN = 80;
const CIRCLE_MAX = 140;

export default function BreathingExercise() {
  const [running, setRunning]       = useState(false);
  const [phaseIdx, setPhaseIdx]     = useState(0);
  const [countdown, setCountdown]   = useState(PHASES[0].duration);
  const [cycles, setCycles]         = useState(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stateRef    = useRef({ phaseIdx: 0, countdown: PHASES[0].duration, cycles: 0 });

  const clearTimer = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  const start = useCallback(() => {
    stateRef.current = { phaseIdx: 0, countdown: PHASES[0].duration, cycles: 0 };
    setPhaseIdx(0);
    setCountdown(PHASES[0].duration);
    setCycles(0);
    setRunning(true);

    intervalRef.current = setInterval(() => {
      const s = stateRef.current;
      const next = s.countdown - 1;
      if (next > 0) {
        stateRef.current.countdown = next;
        setCountdown(next);
      } else {
        const nextIdx = (s.phaseIdx + 1) % PHASES.length;
        const newCycles = nextIdx === 0 ? s.cycles + 1 : s.cycles;
        stateRef.current = { phaseIdx: nextIdx, countdown: PHASES[nextIdx].duration, cycles: newCycles };
        setPhaseIdx(nextIdx);
        setCountdown(PHASES[nextIdx].duration);
        setCycles(newCycles);
      }
    }, 1000);
  }, []);

  const stop = useCallback(() => {
    clearTimer();
    setRunning(false);
    setPhaseIdx(0);
    setCountdown(PHASES[0].duration);
  }, [clearTimer]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const current  = PHASES[phaseIdx];
  const progress = running ? 1 - (countdown - 1) / current.duration : 0;

  // Circle size based on phase
  let circleSize = CIRCLE_MIN;
  if (running) {
    if (current.phase === 'inhale')  circleSize = CIRCLE_MIN + (CIRCLE_MAX - CIRCLE_MIN) * progress;
    else if (current.phase === 'hold') circleSize = CIRCLE_MAX;
    else                              circleSize = CIRCLE_MAX - (CIRCLE_MAX - CIRCLE_MIN) * progress;
  }

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Animated circle */}
      <div className="relative flex items-center justify-center" style={{ width: CIRCLE_MAX + 24, height: CIRCLE_MAX + 24 }}>
        {/* Outer glow ring */}
        <div
          className="absolute rounded-full"
          style={{
            width: circleSize + 24,
            height: circleSize + 24,
            backgroundColor: running ? `${current.color}18` : 'transparent',
            transition: 'all 1s linear',
          }}
        />
        {/* Main circle */}
        <div
          className="flex flex-col items-center justify-center rounded-full"
          style={{
            width: circleSize,
            height: circleSize,
            backgroundColor: running ? `${current.color}25` : 'var(--card-border)',
            border: `3px solid ${running ? current.color : 'var(--card-border)'}`,
            transition: 'all 1s linear',
          }}
        >
          {running ? (
            <>
              <span className="text-lg font-bold" style={{ color: current.color }}>{current.label}</span>
              <span className="text-3xl font-mono font-bold" style={{ color: current.color }}>{countdown}</span>
            </>
          ) : (
            <span className="material-icons-round text-4xl text-[var(--muted-foreground)]">air</span>
          )}
        </div>
      </div>

      {/* Phase hint */}
      <div className="flex gap-4 text-xs text-[var(--muted-foreground)]">
        {PHASES.map((p, i) => (
          <div key={p.phase} className="flex items-center gap-1">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: running && phaseIdx === i ? p.color : 'var(--card-border)' }}
            />
            {p.label.replace('...', '')} {p.duration}s
          </div>
        ))}
      </div>

      {/* Cycle counter */}
      <div className="flex items-center gap-1.5 text-sm text-[var(--muted-foreground)]">
        <span className="material-icons-round text-base">loop</span>
        已完成 <span className="font-semibold text-[var(--foreground)]">{cycles}</span> 个循环
      </div>

      {/* Start / Stop */}
      <button
        onClick={running ? stop : start}
        className="flex items-center gap-2 rounded-[10px] px-8 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        style={{ backgroundColor: running ? '#EA4335' : '#4285F4' }}
      >
        <span className="material-icons-round text-base">{running ? 'stop' : 'play_arrow'}</span>
        {running ? '停止' : '开始呼吸'}
      </button>
    </div>
  );
}
