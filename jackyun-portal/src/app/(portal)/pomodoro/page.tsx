'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  completePomodoroSession,
  createPomodoroTask,
  deletePomodoroTask,
  getPomodoroWorkspace,
  savePomodoroSettings,
  updatePomodoroTask,
  type PomodoroTask,
} from '@/actions/pomodoro';

// ── Types ──────────────────────────────────────────────────────────────────

type Mode = 'pomodoro' | 'short' | 'long';

type TimerTask = PomodoroTask;

interface Settings {
  pomodoroMin: number;
  shortBreakMin: number;
  longBreakMin: number;
  longBreakInterval: number;
  soundEnabled: boolean;
  notificationsEnabled: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────

const MODE_META: Record<Mode, { label: string; color: string; bg: string; icon: string }> = {
  pomodoro: { label: '番茄工作法', color: '#EA4335', bg: '#FCE8E6', icon: 'lunch_dining' },
  short: { label: '短暂休息', color: '#4285F4', bg: '#E8F0FE', icon: 'coffee' },
  long: { label: '长时间休息', color: '#34A853', bg: '#E6F4EA', icon: 'self_improvement' },
};

const DEFAULT_SETTINGS: Settings = {
  pomodoroMin: 25,
  shortBreakMin: 5,
  longBreakMin: 15,
  longBreakInterval: 4,
  soundEnabled: true,
  notificationsEnabled: true,
};

// ── Helpers ────────────────────────────────────────────────────────────────

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ── Ring SVG Component ─────────────────────────────────────────────────────

function Ring({
  seconds,
  total,
  color,
  running,
}: {
  seconds: number;
  total: number;
  color: string;
  running: boolean;
}) {
  const R = 200;
  const CIRC = 2 * Math.PI * R;
  const progress = total > 0 ? seconds / total : 0;
  const dashOffset = CIRC * (1 - progress);

  return (
    <div className="relative w-[280px] h-[280px] sm:w-[320px] sm:h-[320px] select-none">
      <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 440 440">
        {/* Track */}
        <circle
          cx="220" cy="220" r={R}
          fill="none"
          stroke="var(--md-surface-variant, #F1F3F4)"
          strokeWidth="14"
          strokeLinecap="round"
        />
        {/* Progress */}
        <circle
          cx="220" cy="220" r={R}
          fill="none"
          stroke={color}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset 950ms linear, stroke 300ms ease' }}
        />
        {/* Running pulse ring */}
        {running && (
          <circle
            cx="220" cy="220" r={R + 10}
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeDasharray="10 30"
            className="animate-[spin_12s_linear_infinite] origin-center"
            opacity="0.4"
          />
        )}
      </svg>
      {/* Time display */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-mono font-bold text-[5rem] sm:text-[6.5rem] leading-none text-[var(--foreground)]"
          style={{ letterSpacing: '-2px' }}
        >
          {formatTime(seconds)}
        </span>
        {/* Status badge */}
        <div
          className="mt-4 flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium"
          style={{ background: `${color}15`, color }}
        >
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: running ? color : '#9AA0A6', animation: running ? 'pulse 1.5s ease-in-out infinite' : 'none' }}
          />
          {running ? '进行中' : '已暂停'}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function PomodoroPage() {
  const [mode, setMode] = useState<Mode>('pomodoro');
  const [seconds, setSeconds] = useState(DEFAULT_SETTINGS.pomodoroMin * 60);
  const [running, setRunning] = useState(false);
  const [tasks, setTasks] = useState<TimerTask[]>([]);
  const [taskInput, setTaskInput] = useState('');
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [cycleCount, setCycleCount] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(true);
  const [weeklyMinutes, setWeeklyMinutes] = useState(0);
  const [activeDays, setActiveDays] = useState(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ── Init ──
  useEffect(() => {
    getPomodoroWorkspace()
      .then(({ tasks: cloudTasks, settings: cloudSettings, completedToday, weeklyMinutes: cloudWeeklyMinutes, activeDays: cloudActiveDays }) => {
        setTasks(cloudTasks);
        setSettings(cloudSettings);
        setSeconds(cloudSettings.pomodoroMin * 60);
        setCompletedCount(completedToday);
        setWeeklyMinutes(cloudWeeklyMinutes);
        setActiveDays(cloudActiveDays);
      })
      .catch(() => {})
      .finally(() => setIsLoadingWorkspace(false));

    // Create audio context-free bell (Web Audio API)
    audioRef.current = new Audio();
    // Generate a simple bell tone via base64 wav
    audioRef.current.src = 'data:audio/wav;base64,//uQRAAAAWX';

    // Listen for fullscreen changes
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // ── Timer logic ──
  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSeconds(prev => {
          if (prev <= 1) {
            // Timer complete
            handleTimerComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, mode]);

  // Update document title
  useEffect(() => {
    document.title = `${formatTime(seconds)} · ${MODE_META[mode].label} | 番茄钟`;
  }, [seconds, mode]);

  // ── Handlers ──
  const getModeSeconds = useCallback((m: Mode): number => {
    if (m === 'pomodoro') return settings.pomodoroMin * 60;
    if (m === 'short') return settings.shortBreakMin * 60;
    return settings.longBreakMin * 60;
  }, [settings]);

  const switchMode = (m: Mode) => {
    setRunning(false);
    setMode(m);
    setSeconds(getModeSeconds(m));
  };

  const toggleTimer = () => {
    if (seconds === 0) {
      setSeconds(getModeSeconds(mode));
    }
    setRunning(!running);
  };

  const resetTimer = () => {
    setRunning(false);
    setSeconds(getModeSeconds(mode));
  };

  const handleTimerComplete = () => {
    setRunning(false);

    // Play sound
    if (settings.soundEnabled) {
      if (audioRef.current) {
        try {
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(() => {});
        } catch {}
      }
    }

    // Notification
    if (settings.notificationsEnabled && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(MODE_META[mode].label, {
          body: mode === 'pomodoro' ? '🍅 专注完成！休息一下吧' : '休息结束！开始新的专注吧',
          icon: '/Webicon.png',
        });
      }
    }

    // Save a completed focus session to the cloud and update the selected task.
    if (mode === 'pomodoro') {
      const duration = getModeSeconds('pomodoro');
      completePomodoroSession(activeTaskId, duration).then(() => {
        if (activeTaskId) {
          setTasks((current) => current.map((task) => task.id === activeTaskId ? { ...task, donePomodoros: task.donePomodoros + 1 } : task));
        }
      }).catch(() => {});
      setCompletedCount((count) => count + 1);
    }

    // Auto-switch mode
    if (mode === 'pomodoro') {
      const newCycle = cycleCount + 1;
      setCycleCount(newCycle);
      // Every longBreakInterval pomodoros → long break
      if (newCycle % settings.longBreakInterval === 0) {
        setMode('long');
        setSeconds(getModeSeconds('long'));
      } else {
        setMode('short');
        setSeconds(getModeSeconds('short'));
      }
    } else {
      setMode('pomodoro');
      setSeconds(getModeSeconds('pomodoro'));
    }
  };

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = taskInput.trim();
    if (!text) return;
    try {
      const newTask = await createPomodoroTask(text);
      setTasks((current) => [...current, newTask]);
      setTaskInput('');
      setActiveTaskId((current) => current ?? newTask.id);
    } catch {}
  };

  const toggleTask = (id: string) => {
    const updated = tasks.map(t =>
      t.id === id ? { ...t, completed: !t.completed } : t
    );
    setTasks(updated);
    const task = updated.find((item) => item.id === id);
    if (task) updatePomodoroTask(id, { completed: task.completed }).catch(() => {});
  };

  const removeTask = (id: string) => {
    const updated = tasks.filter(t => t.id !== id);
    setTasks(updated);
    if (activeTaskId === id) setActiveTaskId(null);
    deletePomodoroTask(id).catch(() => {});
  };

  const adjustTaskPomodoros = (id: string, delta: number) => {
    const updated = tasks.map(t =>
      t.id === id ? { ...t, estimated: Math.max(1, t.estimated + delta) } : t
    );
    setTasks(updated);
    const task = updated.find((item) => item.id === id);
    if (task) updatePomodoroTask(id, { estimated: task.estimated }).catch(() => {});
  };

  const updateSetting = (key: keyof Settings, value: number | boolean) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    savePomodoroSettings(updated).catch(() => {});

    // If changing duration and timer not running, update display
    if (!running) {
      if (key === 'pomodoroMin' && mode === 'pomodoro') setSeconds(Number(value) * 60);
      if (key === 'shortBreakMin' && mode === 'short') setSeconds(Number(value) * 60);
      if (key === 'longBreakMin' && mode === 'long') setSeconds(Number(value) * 60);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const modeColor = MODE_META[mode].color;

  // ── Render ──
  return (
    <div className="mx-auto flex min-h-full max-w-6xl flex-col pb-8">
      <section className="mb-6 overflow-hidden rounded-[28px] bg-[#172554] px-6 py-7 text-white shadow-xl sm:px-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#bfdbfe]">Focus studio</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">把注意力留给重要的事</h1><p className="mt-2 text-sm text-[#bfdbfe]">任务、节奏和专注记录会自动保存到云端。</p></div>
          <div className="flex gap-3"><div className="rounded-2xl bg-white/10 px-4 py-3"><p className="text-xs text-[#bfdbfe]">本周专注</p><p className="mt-1 text-xl font-bold">{weeklyMinutes} 分钟</p></div><div className="rounded-2xl bg-white/10 px-4 py-3"><p className="text-xs text-[#bfdbfe]">活跃天数</p><p className="mt-1 text-xl font-bold">{activeDays} / 7</p></div></div>
        </div>
      </section>
      {/* Top bar: mode tabs + settings */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        {/* Mode tabs */}
        <div className="flex items-center gap-1 p-1 rounded-full border border-[var(--card-border)] bg-[var(--card)]">
          {(Object.keys(MODE_META) as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className={`px-4 sm:px-6 py-2.5 rounded-full text-sm font-medium transition-all ${
                mode === m
                  ? 'text-white shadow'
                  : 'text-[var(--muted-foreground)] hover:bg-[var(--background)]'
              }`}
              style={mode === m ? { background: MODE_META[m].color } : undefined}
            >
              {MODE_META[m].label}
            </button>
          ))}
        </div>

        {/* Settings + Fullscreen buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={toggleFullscreen}
            className="w-10 h-10 rounded-xl border border-[var(--card-border)] hover:bg-[var(--background)] text-[var(--muted-foreground)] flex items-center justify-center transition-colors"
            title="全屏"
          >
            <span className="material-icons-round text-lg">
              {isFullscreen ? 'fullscreen_exit' : 'fullscreen'}
            </span>
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="w-10 h-10 rounded-xl border border-[var(--card-border)] hover:bg-[var(--background)] text-[var(--muted-foreground)] flex items-center justify-center transition-colors"
            title="设置"
          >
            <span className="material-icons-round text-lg">settings</span>
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      {/* Timer */}
      <div className="flex flex-col items-center rounded-[28px] border border-[var(--card-border)] bg-[var(--card)] px-5 py-8 shadow-sm">
        <p className="mb-5 text-sm font-semibold text-[var(--muted-foreground)]">{activeTaskId ? `正在专注：${tasks.find((task) => task.id === activeTaskId)?.text ?? '任务'}` : '选择一个任务，让每个番茄都有归属'}</p>
        <Ring seconds={seconds} total={getModeSeconds(mode)} color={modeColor} running={running} />

        {/* Controls */}
        <div className="flex items-center gap-4 mt-8">
          <button
            onClick={resetTimer}
            className="w-12 h-12 rounded-full border border-[var(--card-border)] hover:bg-[var(--background)] flex items-center justify-center text-[var(--muted-foreground)] transition-all"
            title="重置"
          >
            <span className="material-icons-round">replay</span>
          </button>
          <button
            onClick={toggleTimer}
            className={`w-16 h-16 rounded-full text-white shadow-lg flex items-center justify-center transition-all hover:scale-105 active:scale-95 ${
              running ? 'bg-[#FBBC04] text-[#202124]' : ''
            }`}
            style={!running ? { background: modeColor } : undefined}
            title={running ? '暂停' : '开始'}
          >
            <span className="material-icons-round text-3xl">
              {running ? 'pause' : 'play_arrow'}
            </span>
          </button>
          <button
            onClick={() => setSeconds(prev => Math.min(getModeSeconds(mode), prev + 300))}
            className="w-12 h-12 rounded-full border border-[var(--card-border)] hover:bg-[var(--background)] flex items-center justify-center text-[var(--muted-foreground)] transition-all"
            title="+5 分钟"
          >
            <span className="material-icons-round">add</span>
          </button>
        </div>

        {/* Completed stats */}
        <p className="mt-6 text-sm text-[var(--muted-foreground)]">
          {isLoadingWorkspace ? '正在同步你的专注数据…' : <>今日已完成 <span style={{ color: modeColor }} className="font-bold">{completedCount}</span> 个番茄钟 · 已云端同步</>}
        </p>
      </div>

      {/* Tasks */}
      <div className="overflow-hidden rounded-[28px] border border-[var(--card-border)] bg-[var(--card)] shadow-sm">
        <div className="px-6 py-4 border-b border-[var(--card-border)]">
          <div className="flex items-center justify-between"><h2 className="text-base font-semibold text-[var(--foreground)]">专注任务</h2><span className="rounded-full bg-[#eff4ff] px-2.5 py-1 text-xs font-semibold text-[#175cd3]">{tasks.filter((task) => !task.completed).length} 个待完成</span></div>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">点击任务设为当前专注目标</p>
        </div>

        {/* Task list */}
        <div className="p-4 space-y-2">
          {tasks.length === 0 ? (
            <p className="text-center py-8 text-sm text-[var(--muted-foreground)]">
              🍅 添加一个任务开始专注吧
            </p>
          ) : (
            tasks.map(task => (
              <div
                key={task.id}
                onClick={() => setActiveTaskId(task.id)}
                className={`flex cursor-pointer items-center gap-3 p-3 rounded-xl border transition-all ${
                  task.completed ? 'opacity-60' : ''
                } ${activeTaskId === task.id ? 'border-[#4285F4] bg-[#4285F4]/5' : 'border-[var(--card-border)]'}`}
              >
                {/* Checkbox */}
                <button
                  onClick={() => toggleTask(task.id)}
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0 ${
                    task.completed
                      ? 'bg-[#34A853] border-[#34A853] text-white'
                      : 'border-[var(--muted-foreground)] text-transparent hover:border-[#34A853]'
                  }`}
                >
                  <span className="material-icons-round text-sm">check</span>
                </button>

                {/* Text */}
                <span className={`flex-1 text-sm ${task.completed ? 'line-through text-[var(--muted-foreground)]' : 'text-[var(--foreground)]'}`}>
                  {task.text}
                </span>

                {activeTaskId === task.id && <span className="text-[10px] font-semibold text-[#4285F4]">当前任务</span>}

                {/* Pomodoro estimate */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className="text-xl">🍅</span>
                  <span className="text-sm font-medium text-[var(--foreground)]">{task.donePomodoros}</span>
                  <span className="text-xs text-[var(--muted-foreground)]">/ {task.estimated}</span>
                  <div className="flex flex-col ml-1">
                    <button
                      onClick={(event) => { event.stopPropagation(); adjustTaskPomodoros(task.id, 1); }}
                      className="text-[10px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] leading-none"
                    >▲</button>
                    <button
                      onClick={(event) => { event.stopPropagation(); adjustTaskPomodoros(task.id, -1); }}
                      className="text-[10px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] leading-none"
                    >▼</button>
                  </div>
                </div>

                {/* Delete */}
                <button
                  onClick={(event) => { event.stopPropagation(); removeTask(task.id); }}
                  className="p-1 rounded hover:bg-[#EA4335]/10 text-[var(--muted-foreground)] hover:text-[#EA4335] transition-colors flex-shrink-0"
                >
                  <span className="material-icons-round text-base">close</span>
                </button>
              </div>
            ))
          )}
        </div>

        {/* Add task form */}
        <form onSubmit={addTask} className="p-4 border-t border-[var(--card-border)] flex gap-2">
          <input
            value={taskInput}
            onChange={(e) => setTaskInput(e.target.value)}
            placeholder="输入任务，例如：完成数学 P2 模拟题"
            className="flex-1 h-11 rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-4 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none focus:border-[#4285F4] transition-colors"
          />
          <button
            type="submit"
            disabled={!taskInput.trim()}
            className="w-11 h-11 rounded-xl bg-[#4285F4] text-white flex items-center justify-center disabled:opacity-50 transition-all hover:bg-[#3367D6]"
          >
            <span className="material-icons-round">add</span>
          </button>
        </form>
      </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-[var(--card)] border border-[var(--card-border)] rounded-[16px] shadow-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-[var(--foreground)]">番茄钟设置</h2>
              <button
                onClick={() => setShowSettings(false)}
                className="p-1 rounded hover:bg-[var(--background)] text-[var(--muted-foreground)]"
              >
                <span className="material-icons-round">close</span>
              </button>
            </div>

            {/* Duration settings */}
            <div className="space-y-4">
              {([
                { key: 'pomodoroMin' as const, label: '专注时长（分钟）', min: 10, max: 90 },
                { key: 'shortBreakMin' as const, label: '短暂休息（分钟）', min: 3, max: 15 },
                { key: 'longBreakMin' as const, label: '长时间休息（分钟）', min: 10, max: 30 },
              ]).map(({ key, label, min, max }) => (
                <div key={key} className="flex items-center justify-between">
                  <label className="text-sm text-[var(--foreground)]">{label}</label>
                  <input
                    type="number"
                    min={min}
                    max={max}
                    value={settings[key]}
                    onChange={(e) => updateSetting(key, Math.max(min, Math.min(max, Number(e.target.value) || min)))}
                    className="w-20 h-10 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 text-center text-sm outline-none focus:border-[#4285F4]"
                  />
                </div>
              ))}

              <div className="flex items-center justify-between">
                <label className="text-sm text-[var(--foreground)]">长时间休息间隔（番茄数）</label>
                <input
                  type="number"
                  min={2}
                  max={6}
                  value={settings.longBreakInterval}
                  onChange={(e) => updateSetting('longBreakInterval', Math.max(2, Math.min(6, Number(e.target.value) || 4)))}
                  className="w-20 h-10 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 text-center text-sm outline-none focus:border-[#4285F4]"
                />
              </div>

              <div className="flex items-center justify-between">
                <label className="text-sm text-[var(--foreground)]">结束提示音</label>
                <button
                  onClick={() => updateSetting('soundEnabled', !settings.soundEnabled)}
                  className={`w-12 h-7 rounded-full transition-colors relative ${settings.soundEnabled ? 'bg-[#34A853]' : 'bg-[var(--muted-foreground)]/30'}`}
                >
                  <span
                    className="absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all"
                    style={{ left: settings.soundEnabled ? '26px' : '4px' }}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <label className="text-sm text-[var(--foreground)]">桌面通知</label>
                <button
                  onClick={() => updateSetting('notificationsEnabled', !settings.notificationsEnabled)}
                  className={`w-12 h-7 rounded-full transition-colors relative ${settings.notificationsEnabled ? 'bg-[#34A853]' : 'bg-[var(--muted-foreground)]/30'}`}
                >
                  <span
                    className="absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all"
                    style={{ left: settings.notificationsEnabled ? '26px' : '4px' }}
                  />
                </button>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowSettings(false)}
                className="px-6 py-2.5 rounded-full bg-[#4285F4] text-white text-sm font-medium hover:bg-[#3367D6] transition-colors"
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
