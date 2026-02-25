'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const QUOTES = [
  'Pain of discipline is temporary. Pain of regret is forever.',
  'You are not tired, you are uninspired.',
  "Don't negotiate with your inner weakness.",
  'Results > Excuses.',
  'Your competitors are studying right now.',
  'Focus is the key. Distraction is the enemy.',
  '专注是最好的投资。',
  '坚持，直到倒计时归零。',
  'One hour of focus beats three hours of distraction.',
  'Do the work. Trust the process.',
];

const PRESET_DURATIONS = [
  { label: '25 分钟', value: 25 },
  { label: '45 分钟', value: 45 },
  { label: '60 分钟', value: 60 },
  { label: '90 分钟', value: 90 },
];

interface SessionRecord {
  date: string;
  duration: number;
  completedAt: string;
  completed: boolean;
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

export default function EnforcerApp() {
  // Config
  const [duration, setDuration] = useState(25);
  const [customDuration, setCustomDuration] = useState('');
  const [bypassPin, setBypassPin] = useState('');
  const [savedPin, setSavedPin] = useState('');

  // Session state
  const [active, setActive] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [total, setTotal] = useState(0);
  const [quote, setQuote] = useState(QUOTES[0]);
  const [bypassInput, setBypassInput] = useState('');
  const [bypassError, setBypassError] = useState(false);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const totalSecondsRef = useRef<number>(0);

  // Load persisted data
  useEffect(() => {
    const pin = localStorage.getItem('enforcer_pin') ?? '';
    setSavedPin(pin);
    const saved = localStorage.getItem('enforcer_sessions');
    if (saved) setSessions(JSON.parse(saved));
  }, []);

  const saveSessions = useCallback((records: SessionRecord[]) => {
    setSessions(records);
    localStorage.setItem('enforcer_sessions', JSON.stringify(records));
  }, []);

  const pickQuote = useCallback(() => {
    setQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)]);
  }, []);

  const endSession = useCallback(
    (completed: boolean) => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      setActive(false);
      setRemaining(0);

      const record: SessionRecord = {
        date: new Date().toLocaleDateString('zh-CN'),
        duration: Math.round(totalSecondsRef.current / 60),
        completedAt: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        completed,
      };
      const updated = [record, ...sessions].slice(0, 20);
      saveSessions(updated);
    },
    [sessions, saveSessions],
  );

  const startSession = useCallback(() => {
    const mins = customDuration ? parseInt(customDuration, 10) : duration;
    if (!mins || mins < 1) return;
    const secs = mins * 60;
    totalSecondsRef.current = secs;
    startTimeRef.current = Date.now();
    setTotal(secs);
    setRemaining(secs);
    pickQuote();
    setBypassInput('');
    setBypassError(false);
    setActive(true);
  }, [duration, customDuration, pickQuote]);

  // Timer tick
  useEffect(() => {
    if (!active) return;
    intervalRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const rem = totalSecondsRef.current - elapsed;
      if (rem <= 0) {
        setRemaining(0);
        endSession(true);
      } else {
        setRemaining(rem);
      }
    }, 500);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [active, endSession]);

  const handleBypass = useCallback(() => {
    if (!savedPin || bypassInput === savedPin) {
      endSession(false);
    } else {
      setBypassError(true);
      setTimeout(() => setBypassError(false), 1500);
    }
  }, [savedPin, bypassInput, endSession]);

  const savePin = () => {
    setSavedPin(bypassPin);
    localStorage.setItem('enforcer_pin', bypassPin);
    setBypassPin('');
  };

  const progress = total > 0 ? ((total - remaining) / total) * 100 : 0;

  return (
    <>
      {/* Fullscreen overlay */}
      {active && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: '#0a0a0a',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Progress bar */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '4px',
              background: '#1a1a1a',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${progress}%`,
                background: '#4285F4',
                transition: 'width 1s linear',
              }}
            />
          </div>

          {/* Timer */}
          <div
            style={{
              fontSize: 'clamp(72px, 15vw, 200px)',
              fontFamily: "'Roboto Mono', 'JetBrains Mono', monospace",
              fontWeight: 800,
              color: 'white',
              lineHeight: 1,
              letterSpacing: '-0.02em',
              userSelect: 'none',
            }}
          >
            {formatTime(remaining)}
          </div>

          {/* Quote */}
          <p
            style={{
              marginTop: '2rem',
              color: '#666',
              fontSize: 'clamp(14px, 2vw, 20px)',
              fontStyle: 'italic',
              maxWidth: '600px',
              textAlign: 'center',
              padding: '0 24px',
            }}
          >
            {quote}
          </p>

          {/* Bypass section */}
          <div
            style={{
              marginTop: '3rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            {savedPin && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="password"
                  placeholder="紧急解锁 PIN"
                  value={bypassInput}
                  onChange={(e) => setBypassInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleBypass()}
                  style={{
                    background: bypassError ? '#2a0a0a' : '#1a1a1a',
                    border: `1px solid ${bypassError ? '#EA4335' : '#333'}`,
                    color: 'white',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    fontFamily: 'monospace',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                  }}
                />
                <button
                  onClick={handleBypass}
                  style={{
                    background: '#1a1a1a',
                    border: '1px solid #333',
                    color: '#888',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  解锁
                </button>
              </div>
            )}
            {!savedPin && (
              <button
                onClick={() => endSession(false)}
                style={{
                  background: 'transparent',
                  border: '1px solid #333',
                  color: '#555',
                  padding: '6px 16px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                结束专注
              </button>
            )}
            {bypassError && (
              <p style={{ color: '#EA4335', fontSize: '12px' }}>PIN 错误，请再试</p>
            )}
          </div>
        </div>
      )}

      {/* Configuration panel */}
      <section className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="material-icons-round text-[var(--muted-foreground)] text-lg">timer</span>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            专注配置
          </h2>
        </div>

        {/* Duration presets */}
        <div className="mb-4">
          <p className="text-xs text-[var(--muted-foreground)] mb-2">选择时长</p>
          <div className="flex flex-wrap gap-2">
            {PRESET_DURATIONS.map((p) => (
              <button
                key={p.value}
                onClick={() => {
                  setDuration(p.value);
                  setCustomDuration('');
                }}
                className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                style={{
                  background:
                    duration === p.value && !customDuration
                      ? '#4285F4'
                      : 'var(--card-border)',
                  color:
                    duration === p.value && !customDuration
                      ? 'white'
                      : 'var(--muted-foreground)',
                  border: '1px solid var(--card-border)',
                }}
              >
                {p.label}
              </button>
            ))}
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={1}
                max={240}
                placeholder="自定义 (分)"
                value={customDuration}
                onChange={(e) => setCustomDuration(e.target.value)}
                className="px-3 py-1.5 rounded-lg text-sm border border-[var(--card-border)] bg-transparent text-[var(--foreground)] w-32 focus:outline-none focus:border-[#4285F4]"
              />
            </div>
          </div>
        </div>

        {/* PIN config */}
        <div className="mb-5">
          <p className="text-xs text-[var(--muted-foreground)] mb-2">
            紧急解锁 PIN{savedPin ? ' (已设置)' : ' (未设置，可直接结束)'}
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              placeholder="设置 PIN（留空清除）"
              value={bypassPin}
              onChange={(e) => setBypassPin(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-sm border border-[var(--card-border)] bg-transparent text-[var(--foreground)] w-40 focus:outline-none focus:border-[#4285F4]"
            />
            <button
              onClick={savePin}
              className="px-3 py-1.5 rounded-lg text-sm font-medium border border-[var(--card-border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            >
              保存 PIN
            </button>
          </div>
        </div>

        {/* Start button */}
        <button
          onClick={startSession}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: '#4285F4' }}
        >
          <span className="material-icons-round text-base">play_arrow</span>
          开始专注 ({customDuration ? `${customDuration} 分钟` : `${duration} 分钟`})
        </button>
      </section>

      {/* Session history */}
      {sessions.length > 0 && (
        <section className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-5">
          <div
            className="flex items-center justify-between mb-3 cursor-pointer"
            onClick={() => setShowHistory((v) => !v)}
          >
            <div className="flex items-center gap-2">
              <span className="material-icons-round text-[var(--muted-foreground)] text-lg">
                history
              </span>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                专注记录
              </h2>
            </div>
            <span className="material-icons-round text-[var(--muted-foreground)] text-base">
              {showHistory ? 'expand_less' : 'expand_more'}
            </span>
          </div>
          {showHistory && (
            <div className="space-y-2">
              {sessions.map((s, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-2 border-b border-[var(--card-border)] last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="material-icons-round text-base"
                      style={{ color: s.completed ? '#34A853' : '#EA4335' }}
                    >
                      {s.completed ? 'check_circle' : 'cancel'}
                    </span>
                    <span className="text-sm text-[var(--foreground)]">{s.duration} 分钟</span>
                  </div>
                  <div className="text-xs text-[var(--muted-foreground)]">
                    {s.date} {s.completedAt}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}
