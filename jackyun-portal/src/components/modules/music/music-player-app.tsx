'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { addSong, deleteSong, importSongs, updateMusicSettings } from '@/actions/music';
import type { MusicSong, MusicSettings } from '@/types/music';

// ── Suning NTP Sync ─────────────────────────────────────────────────────────

async function suningFetch(): Promise<number> {
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    const cb = 'cb_sn_' + Date.now();
    const script = document.createElement('script');
    let done = false;

    (window as any)[cb] = (data: { currentTime: number }) => {
      if (done) return;
      done = true;
      const rtt = performance.now() - t0;
      const serverTime = data.currentTime;
      cleanup();
      resolve(serverTime + rtt / 2 - Date.now());
    };

    const cleanup = () => {
      delete (window as any)[cb];
      script.remove();
    };
    script.src = `https://f.m.suning.com/api/ct.do?callback=${cb}&_=${t0}`;
    script.onerror = () => {
      if (!done) {
        done = true;
        cleanup();
        reject('Network Err');
      }
    };
    document.head.appendChild(script);
    setTimeout(() => {
      if (!done) {
        done = true;
        cleanup();
        reject('Timeout');
      }
    }, 3000);
  });
}

// ── Types ────────────────────────────────────────────────────────────────────

type EngineStatus = 'IDLE' | 'ARMED' | 'PLAYING';
type SyncStatus = 'READY' | 'SYNCING' | 'CONNECTED';
type SpeedBtnState = 'idle' | 'testing' | 'done';

const INTERVAL_OPTIONS = [10000, 20000, 30000, 60000];
const PLAY_MODES: MusicSettings['play_mode'][] = ['sequence', 'loop_one', 'random'];
const PLAY_MODE_LABELS: Record<MusicSettings['play_mode'], string> = {
  sequence: '顺序',
  loop_one: '单曲',
  random: '随机',
};

function neteaseUrl(id: string) {
  return `https://music.163.com/song/media/outer/url?id=${id}.mp3`;
}

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  initialSongs: MusicSong[];
  initialSettings: MusicSettings;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function MusicPlayerApp({ initialSongs, initialSettings }: Props) {
  // Song list state
  const [songs, setSongs] = useState<MusicSong[]>(initialSongs);
  const [currentIdx, setCurrentIdx] = useState(0);

  // Settings state (local mirror of DB)
  const [manualOffset, setManualOffset] = useState(initialSettings.manual_offset);
  const [intervalMs, setIntervalMs] = useState(initialSettings.interval_ms);
  const [playMode, setPlayMode] = useState<MusicSettings['play_mode']>(initialSettings.play_mode);

  // Engine state
  const [engineStatus, setEngineStatus] = useState<EngineStatus>('IDLE');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('READY');
  const [timerText, setTimerText] = useState('---.---');
  const [targetSec, setTargetSec] = useState<number | null>(null);

  // Speed test button state
  const [speedState, setSpeedState] = useState<SpeedBtnState>('idle');
  const [speedLabel, setSpeedLabel] = useState('TEST SPEED');

  // Add-song form
  const [addId, setAddId] = useState('');
  const [addName, setAddName] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addErr, setAddErr] = useState('');

  // Modal states
  const [showCalibrate, setShowCalibrate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [importText, setImportText] = useState('');
  const [importErr, setImportErr] = useState('');

  // Refs
  const audioRef = useRef<HTMLAudioElement>(null);
  const animFrameRef = useRef<number>(0);
  const netOffsetRef = useRef<number>(0);
  const targetTimeRef = useRef<number>(0);
  const engineStatusRef = useRef<EngineStatus>('IDLE');
  const manualOffsetRef = useRef(manualOffset);
  const metronomeRef = useRef<NodeJS.Timeout | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Keep refs in sync
  useEffect(() => { engineStatusRef.current = engineStatus; }, [engineStatus]);
  useEffect(() => { manualOffsetRef.current = manualOffset; }, [manualOffset]);

  const getPreciseTime = useCallback(() => Date.now() + netOffsetRef.current, []);

  // ── NTP Sync ──────────────────────────────────────────────────────────────

  const doSync = useCallback(async () => {
    setSyncStatus('SYNCING');
    try {
      const offsets: number[] = [];
      for (let i = 0; i < 3; i++) {
        const o = await suningFetch();
        offsets.push(o);
        await new Promise(r => setTimeout(r, 300));
      }
      offsets.sort((a, b) => a - b);
      netOffsetRef.current = offsets[1]; // median
      setSyncStatus('CONNECTED');
    } catch {
      setSyncStatus('READY');
    }
  }, []);

  const testSpeed = useCallback(async () => {
    if (speedState === 'testing') return;
    setSpeedState('testing');
    setSpeedLabel('TESTING...');
    setSyncStatus('SYNCING');
    try {
      const offsets: number[] = [];
      for (let i = 0; i < 3; i++) {
        const o = await suningFetch();
        offsets.push(o);
        await new Promise(r => setTimeout(r, 300));
      }
      offsets.sort((a, b) => a - b);
      netOffsetRef.current = offsets[1];
      setSyncStatus('CONNECTED');
      setSpeedState('done');
      setSpeedLabel(`${Math.round(Math.abs(offsets[1]))} MS`);
      setTimeout(() => {
        setSpeedState('idle');
        setSpeedLabel('TEST SPEED');
      }, 3000);
    } catch {
      setSyncStatus('READY');
      setSpeedState('idle');
      setSpeedLabel('TEST SPEED');
    }
  }, [speedState]);

  useEffect(() => { doSync(); }, [doSync]);

  // ── RAF loop ──────────────────────────────────────────────────────────────

  const stopLoop = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }
  }, []);

  const startLoop = useCallback(() => {
    stopLoop();
    const tick = () => {
      if (engineStatusRef.current !== 'ARMED') return;
      const now = getPreciseTime();
      const remaining = targetTimeRef.current + manualOffsetRef.current - now;
      if (remaining <= 0) {
        audioRef.current?.play().catch(() => null);
        setEngineStatus('PLAYING');
        engineStatusRef.current = 'PLAYING';
        setTimerText('0.000');
        return;
      }
      setTimerText((remaining / 1000).toFixed(3));
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
  }, [getPreciseTime, stopLoop]);

  // ── Engine Controls ───────────────────────────────────────────────────────

  const arm = useCallback(() => {
    if (!songs.length) return;
    const now = getPreciseTime();
    let target = Math.ceil(now / intervalMs) * intervalMs;
    if (target - now < 4000) target += intervalMs;
    targetTimeRef.current = target;
    setTargetSec(Math.round(target / 1000) % 60);

    const song = songs[currentIdx];
    if (audioRef.current) {
      audioRef.current.src = neteaseUrl(song.netease_id);
      audioRef.current.load();
    }

    setEngineStatus('ARMED');
    engineStatusRef.current = 'ARMED';
    startLoop();
  }, [songs, currentIdx, getPreciseTime, intervalMs, startLoop]);

  const stop = useCallback(() => {
    stopLoop();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setEngineStatus('IDLE');
    engineStatusRef.current = 'IDLE';
    setTimerText('---.---');
    setTargetSec(null);
  }, [stopLoop]);

  const playNext = useCallback(() => {
    stop();
    let next: number;
    if (playMode === 'random') {
      next = Math.floor(Math.random() * songs.length);
    } else if (playMode === 'loop_one') {
      next = currentIdx;
    } else {
      next = (currentIdx + 1) % songs.length;
    }
    setCurrentIdx(next);
  }, [stop, playMode, songs.length, currentIdx]);

  const playPrev = useCallback(() => {
    stop();
    setCurrentIdx((i) => (i - 1 + songs.length) % songs.length);
  }, [stop, songs.length]);

  // Auto-arm next song when current finishes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => {
      let next: number;
      if (playMode === 'random') {
        next = Math.floor(Math.random() * songs.length);
      } else if (playMode === 'loop_one') {
        next = currentIdx;
      } else {
        next = (currentIdx + 1) % songs.length;
      }
      setCurrentIdx(next);
      // Re-arm after a short delay
      setTimeout(() => arm(), 100);
    };
    audio.addEventListener('ended', onEnded);
    return () => audio.removeEventListener('ended', onEnded);
  }, [arm, currentIdx, playMode, songs.length]);

  // Cleanup on unmount
  useEffect(() => () => { stopLoop(); }, [stopLoop]);

  // ── Keyboard shortcut ─────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const tag = (e.target as HTMLElement).tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
      if (showCalibrate || showImport || showSettings) return;
      e.preventDefault();
      if (engineStatusRef.current === 'IDLE') arm();
      else stop();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [arm, stop, showCalibrate, showImport, showSettings]);

  // ── Calibration metronome ─────────────────────────────────────────────────

  const beep = useCallback(() => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.1);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (showCalibrate) {
      const tick = () => {
        beep();
        metronomeRef.current = setTimeout(tick, 1000);
      };
      metronomeRef.current = setTimeout(tick, 1000);
    }
    return () => { if (metronomeRef.current) clearTimeout(metronomeRef.current); };
  }, [showCalibrate, beep]);

  // ── Add Song ──────────────────────────────────────────────────────────────

  const handleAddSong = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddErr('');
    setAddLoading(true);
    try {
      await addSong(addId, addName);
      setSongs(prev => [...prev, {
        id: crypto.randomUUID(),
        user_id: '',
        netease_id: addId.trim(),
        name: addName.trim(),
        sort_order: prev.length,
      }]);
      setAddId('');
      setAddName('');
    } catch (err: any) {
      setAddErr(err.message ?? 'Failed');
    } finally {
      setAddLoading(false);
    }
  };

  // ── Import Songs ──────────────────────────────────────────────────────────

  const handleImport = async () => {
    setImportErr('');
    let parsed: { id: string; name: string }[];
    try {
      parsed = JSON.parse(importText);
      if (!Array.isArray(parsed)) throw new Error();
    } catch {
      setImportErr('Invalid JSON array');
      return;
    }
    try {
      await importSongs(parsed);
      const newSongs = parsed.map((s, i) => ({
        id: crypto.randomUUID(),
        user_id: '',
        netease_id: s.id,
        name: s.name,
        sort_order: songs.length + i,
      }));
      setSongs(prev => [...prev, ...newSongs]);
      setImportText('');
      setShowImport(false);
    } catch (err: any) {
      setImportErr(err.message ?? 'Failed');
    }
  };

  // ── Delete Song ───────────────────────────────────────────────────────────

  const handleDelete = async (id: string, idx: number) => {
    try {
      await deleteSong(id);
      setSongs(prev => prev.filter(s => s.id !== id));
      if (currentIdx >= idx && currentIdx > 0) setCurrentIdx(i => i - 1);
    } catch { /* ignore */ }
  };

  // ── Save Settings ─────────────────────────────────────────────────────────

  const saveSettings = async () => {
    await updateMusicSettings({ manual_offset: manualOffset, interval_ms: intervalMs, play_mode: playMode });
    setShowSettings(false);
  };

  // ── Status Pill ───────────────────────────────────────────────────────────

  const pillInfo = (() => {
    if (engineStatus === 'ARMED')
      return { color: '#f59e0b', label: `ARMED: :${String(targetSec ?? 0).padStart(2, '0')}`, blink: false };
    if (engineStatus === 'PLAYING')
      return { color: '#10b981', label: 'PLAYING', blink: false };
    if (syncStatus === 'SYNCING')
      return { color: '#f59e0b', label: 'SYNCING', blink: true };
    if (syncStatus === 'CONNECTED')
      return { color: '#10b981', label: 'SUNING CONNECTED', blink: false };
    return { color: '#94a3b8', label: 'READY', blink: false };
  })();

  const currentSong = songs[currentIdx] ?? null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        .mc-root {
          --mc-primary: #6366f1;
          --mc-primary-hover: #4f46e5;
          --mc-bg: #0b0e14;
          --mc-surface: #151921;
          --mc-text-main: #f8fafc;
          --mc-text-sec: #94a3b8;
          --mc-border: #2d3748;
          --mc-accent: #22d3ee;
          --mc-success: #10b981;
          --mc-warn: #f59e0b;
          background: var(--mc-bg);
          color: var(--mc-text-main);
          font-family: 'Inter', system-ui, sans-serif;
        }
        @keyframes mc-blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes mc-pulse { 0%,100%{opacity:1} 50%{opacity:0.6} }
        .mc-blink { animation: mc-blink 1s infinite; }
        .mc-pulse { animation: mc-pulse 1.5s infinite; }
        .mc-glow { box-shadow: 0 0 8px var(--mc-success); }
        .mc-btn-circle {
          display:flex; align-items:center; justify-content:center;
          border-radius:50%; border:1px solid var(--mc-border);
          background:var(--mc-surface); color:var(--mc-text-main);
          cursor:pointer; transition:all 0.15s;
          outline:none;
        }
        .mc-btn-circle:hover { border-color:var(--mc-primary); background:#1e2233; }
        .mc-btn-circle:active { transform:scale(0.95); }
        .mc-btn-circle.active { background:var(--mc-primary); border-color:var(--mc-primary); }
        .mc-input {
          background:var(--mc-bg); border:1px solid var(--mc-border);
          color:var(--mc-text-main); border-radius:6px; padding:6px 10px;
          font-size:13px; outline:none; width:100%;
        }
        .mc-input:focus { border-color:var(--mc-primary); }
        .mc-btn {
          background:var(--mc-primary); color:#fff; border:none;
          border-radius:6px; padding:6px 14px; cursor:pointer;
          font-size:13px; font-weight:500; transition:background 0.15s;
          outline:none;
        }
        .mc-btn:hover { background:var(--mc-primary-hover); }
        .mc-btn:disabled { opacity:0.5; cursor:not-allowed; }
        .mc-btn-ghost {
          background:transparent; border:1px solid var(--mc-border);
          color:var(--mc-text-sec); border-radius:6px; padding:6px 14px;
          cursor:pointer; font-size:13px; transition:all 0.15s; outline:none;
        }
        .mc-btn-ghost:hover { border-color:var(--mc-primary); color:var(--mc-text-main); }
        .mc-song-item {
          display:flex; align-items:center; gap:8px; padding:7px 10px;
          border-radius:6px; cursor:pointer; transition:background 0.1s;
          border:1px solid transparent;
        }
        .mc-song-item:hover { background:#1a2035; }
        .mc-song-item.selected { background:#1e2a4a; border-color:var(--mc-primary); }
        .mc-modal-bg {
          position:fixed; inset:0; background:rgba(0,0,0,0.7);
          z-index:1000; display:flex; align-items:center; justify-content:center;
        }
        .mc-modal {
          background:var(--mc-surface); border:1px solid var(--mc-border);
          border-radius:12px; padding:24px; min-width:360px; max-width:520px; width:90%;
        }
        .mc-interval-btn {
          padding:5px 12px; border-radius:6px; font-size:12px; font-weight:600;
          border:1px solid var(--mc-border); background:var(--mc-bg);
          color:var(--mc-text-sec); cursor:pointer; transition:all 0.15s;
        }
        .mc-interval-btn.active {
          background:var(--mc-primary); border-color:var(--mc-primary); color:#fff;
        }
        .mc-speed-btn {
          font-size:11px; font-weight:700; letter-spacing:0.05em;
          padding:5px 12px; border-radius:6px; border:1px solid var(--mc-border);
          background:var(--mc-bg); color:var(--mc-text-sec); cursor:pointer;
          transition:all 0.2s; outline:none;
        }
        .mc-speed-btn.testing { color:var(--mc-warn); border-color:var(--mc-warn); }
        .mc-speed-btn.done { color:var(--mc-success); border-color:var(--mc-success); }
        .mc-speed-btn:hover { border-color:var(--mc-accent); color:var(--mc-accent); }
      `}</style>

      <div className="mc-root min-h-[calc(100vh-64px)] flex flex-col">
        {/* Hidden audio */}
        <audio ref={audioRef} preload="auto" />

        {/* Header */}
        <div style={{ borderBottom: '1px solid var(--mc-border)', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: '0.05em', color: 'var(--mc-accent)' }}>
            Jack&apos;s Sync V4.5
          </span>
          <div style={{ flex: 1 }} />
          <button
            className={`mc-speed-btn${speedState === 'testing' ? ' testing mc-pulse' : speedState === 'done' ? ' done' : ''}`}
            onClick={testSpeed}
          >
            {speedLabel}
          </button>
          <button
            className="mc-btn-ghost"
            style={{ padding: '5px 10px', fontSize: 16 }}
            onClick={() => setShowSettings(true)}
            title="Settings"
          >
            ⚙
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* Sidebar */}
          <div style={{ width: 340, minWidth: 340, borderRight: '1px solid var(--mc-border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Add Song Form */}
            <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--mc-border)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--mc-text-sec)', marginBottom: 8 }}>ADD SONG</div>
              <form onSubmit={handleAddSong} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    className="mc-input"
                    placeholder="NetEase ID"
                    value={addId}
                    onChange={e => setAddId(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button className="mc-btn" type="submit" disabled={addLoading || !addId.trim() || !addName.trim()} style={{ whiteSpace: 'nowrap', padding: '6px 12px' }}>
                    {addLoading ? '…' : '+'}
                  </button>
                </div>
                <input
                  className="mc-input"
                  placeholder="Song name"
                  value={addName}
                  onChange={e => setAddName(e.target.value)}
                />
                {addErr && <div style={{ fontSize: 11, color: '#f87171' }}>{addErr}</div>}
              </form>
            </div>

            {/* Song List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 10px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--mc-text-sec)', marginBottom: 6, paddingLeft: 4 }}>
                SONGS ({songs.length})
              </div>
              {songs.length === 0 && (
                <div style={{ color: 'var(--mc-text-sec)', fontSize: 13, textAlign: 'center', marginTop: 24 }}>No songs yet</div>
              )}
              {songs.map((s, i) => (
                <div
                  key={s.id}
                  className={`mc-song-item${i === currentIdx ? ' selected' : ''}`}
                  onClick={() => { stop(); setCurrentIdx(i); }}
                >
                  <span style={{ fontSize: 11, color: 'var(--mc-text-sec)', minWidth: 20, textAlign: 'right' }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--mc-text-sec)' }}>{s.netease_id}</div>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(s.id, i); }}
                    style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14, padding: '2px 4px', lineHeight: 1 }}
                    title="Delete"
                  >×</button>
                </div>
              ))}
            </div>

            {/* Import button */}
            <div style={{ padding: '10px 14px', borderTop: '1px solid var(--mc-border)' }}>
              <button className="mc-btn-ghost" style={{ width: '100%', fontSize: 12 }} onClick={() => setShowImport(true)}>
                IMPORT JSON
              </button>
            </div>
          </div>

          {/* Main Stage */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, padding: '32px 24px' }}>

            {/* Status Pill */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--mc-surface)', border: '1px solid var(--mc-border)', borderRadius: 999, padding: '6px 16px' }}>
              <span
                style={{ width: 9, height: 9, borderRadius: '50%', background: pillInfo.color, display: 'inline-block' }}
                className={pillInfo.blink ? 'mc-blink' : syncStatus === 'CONNECTED' && engineStatus === 'IDLE' ? 'mc-glow' : ''}
              />
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: pillInfo.color }}>
                {pillInfo.label}
              </span>
            </div>

            {/* Current song name */}
            {currentSong && (
              <div style={{ fontSize: 14, color: 'var(--mc-text-sec)', textAlign: 'center', maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {currentSong.name}
              </div>
            )}

            {/* Giant Timer */}
            <div style={{
              fontSize: 'clamp(60px, 10vw, 120px)',
              fontFamily: "'Roboto Mono', 'Courier New', monospace",
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: engineStatus === 'ARMED' ? 'var(--mc-warn)' : engineStatus === 'PLAYING' ? 'var(--mc-success)' : 'var(--mc-text-sec)',
              transition: 'color 0.3s',
              userSelect: 'none',
              lineHeight: 1,
            }}>
              {timerText}
            </div>

            {/* Player Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button className="mc-btn-circle" style={{ width: 44, height: 44, fontSize: 16 }} onClick={playPrev} title="Previous" disabled={!songs.length}>
                ◀◀
              </button>
              <button
                className={`mc-btn-circle${engineStatus !== 'IDLE' ? ' active' : ''}`}
                style={{ width: 60, height: 60, fontSize: 20 }}
                onClick={() => engineStatus === 'IDLE' ? arm() : stop()}
                title={engineStatus === 'IDLE' ? 'Play' : 'Stop'}
                disabled={!songs.length}
              >
                {engineStatus === 'IDLE' ? '▶' : '■'}
              </button>
              <button className="mc-btn-circle" style={{ width: 44, height: 44, fontSize: 16 }} onClick={playNext} title="Next" disabled={!songs.length}>
                ▶▶
              </button>
              <button
                className="mc-btn-circle"
                style={{ width: 40, height: 40, fontSize: 11, fontWeight: 700 }}
                onClick={() => {
                  const next = PLAY_MODES[(PLAY_MODES.indexOf(playMode) + 1) % PLAY_MODES.length];
                  setPlayMode(next);
                  updateMusicSettings({ play_mode: next }).catch(() => null);
                }}
                title="Play mode"
              >
                {PLAY_MODE_LABELS[playMode]}
              </button>
            </div>

            {/* Interval selector */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--mc-text-sec)', marginRight: 4 }}>INTERVAL</span>
              {INTERVAL_OPTIONS.map(ms => (
                <button
                  key={ms}
                  className={`mc-interval-btn${intervalMs === ms ? ' active' : ''}`}
                  onClick={() => {
                    setIntervalMs(ms);
                    updateMusicSettings({ interval_ms: ms }).catch(() => null);
                  }}
                >
                  {ms / 1000}s
                </button>
              ))}
            </div>

            {/* Bottom action buttons */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="mc-btn-ghost" style={{ fontSize: 12 }} onClick={() => setShowCalibrate(true)}>
                CALIBRATE
              </button>
              <button className="mc-btn-ghost" style={{ fontSize: 12 }} onClick={() => setShowImport(true)}>
                IMPORT
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Calibration Modal ── */}
      {showCalibrate && (
        <div className="mc-modal-bg" onClick={() => setShowCalibrate(false)}>
          <div className="mc-modal" onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, color: 'var(--mc-text-main)' }}>Calibration</div>
            <div style={{ color: 'var(--mc-text-sec)', fontSize: 13, marginBottom: 20 }}>
              Adjust manual offset to align playback. You&apos;ll hear a beep every second.
            </div>

            {/* Metronome visual */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
              <div style={{ width: 60, height: 60, borderRadius: '50%', border: '3px solid var(--mc-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }} className="mc-pulse">
                🔔
              </div>
            </div>

            {/* Offset control */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center', marginBottom: 20 }}>
              <button className="mc-btn" onClick={() => setManualOffset(v => v - 100)}>- 100ms</button>
              <span style={{ minWidth: 80, textAlign: 'center', fontFamily: 'monospace', fontSize: 16, color: 'var(--mc-accent)' }}>
                {manualOffset > 0 ? '+' : ''}{manualOffset} ms
              </span>
              <button className="mc-btn" onClick={() => setManualOffset(v => v + 100)}>+ 100ms</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center', marginBottom: 24 }}>
              <button className="mc-btn" onClick={() => setManualOffset(v => v - 10)}>- 10ms</button>
              <button className="mc-btn-ghost" onClick={() => setManualOffset(0)}>Reset</button>
              <button className="mc-btn" onClick={() => setManualOffset(v => v + 10)}>+ 10ms</button>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="mc-btn-ghost" onClick={() => setShowCalibrate(false)}>Cancel</button>
              <button className="mc-btn" onClick={async () => {
                await updateMusicSettings({ manual_offset: manualOffset });
                setShowCalibrate(false);
              }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Import Modal ── */}
      {showImport && (
        <div className="mc-modal-bg" onClick={() => setShowImport(false)}>
          <div className="mc-modal" onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, color: 'var(--mc-text-main)' }}>Import Songs</div>
            <div style={{ color: 'var(--mc-text-sec)', fontSize: 12, marginBottom: 10 }}>
              Paste JSON array: <code style={{ color: 'var(--mc-accent)' }}>[{'{'}&#34;id&#34;: &#34;xxx&#34;, &#34;name&#34;: &#34;Song&#34;{'}'}]</code>
            </div>
            <textarea
              className="mc-input"
              style={{ height: 160, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder='[{"id": "123456", "name": "Song Name"}]'
            />
            {importErr && <div style={{ color: '#f87171', fontSize: 12, marginTop: 6 }}>{importErr}</div>}

            <div style={{ marginTop: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--mc-text-sec)', marginBottom: 6 }}>NetEase Script (run in browser console on music.163.com):</div>
              <div style={{ background: 'var(--mc-bg)', border: '1px solid var(--mc-border)', borderRadius: 6, padding: 10, fontSize: 11, fontFamily: 'monospace', color: 'var(--mc-accent)', wordBreak: 'break-all' }}>
                {`JSON.stringify([...document.querySelectorAll('.f-hide')].map(e=>({id:e.href.match(/\\d+/)[0],name:e.innerText})))`}
              </div>
              <button
                className="mc-btn-ghost"
                style={{ marginTop: 6, fontSize: 11 }}
                onClick={() => {
                  navigator.clipboard.writeText(
                    `JSON.stringify([...document.querySelectorAll('.f-hide')].map(e=>({id:e.href.match(/\\d+/)[0],name:e.innerText})))`
                  ).catch(() => null);
                }}
              >
                Copy Script
              </button>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="mc-btn-ghost" onClick={() => { setShowImport(false); setImportErr(''); }}>Cancel</button>
              <button className="mc-btn" onClick={handleImport} disabled={!importText.trim()}>Import</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Settings Modal ── */}
      {showSettings && (
        <div className="mc-modal-bg" onClick={() => setShowSettings(false)}>
          <div className="mc-modal" onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, color: 'var(--mc-text-main)' }}>Settings</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--mc-text-sec)', marginBottom: 6 }}>INTERVAL</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {INTERVAL_OPTIONS.map(ms => (
                    <button key={ms} className={`mc-interval-btn${intervalMs === ms ? ' active' : ''}`} onClick={() => setIntervalMs(ms)}>
                      {ms / 1000}s
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, color: 'var(--mc-text-sec)', marginBottom: 6 }}>PLAY MODE</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {PLAY_MODES.map(m => (
                    <button key={m} className={`mc-interval-btn${playMode === m ? ' active' : ''}`} onClick={() => setPlayMode(m)}>
                      {PLAY_MODE_LABELS[m]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, color: 'var(--mc-text-sec)', marginBottom: 6 }}>MANUAL OFFSET</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button className="mc-btn" onClick={() => setManualOffset(v => v - 100)}>-100</button>
                  <button className="mc-btn" onClick={() => setManualOffset(v => v - 10)}>-10</button>
                  <span style={{ minWidth: 80, textAlign: 'center', fontFamily: 'monospace', color: 'var(--mc-accent)' }}>
                    {manualOffset > 0 ? '+' : ''}{manualOffset} ms
                  </span>
                  <button className="mc-btn" onClick={() => setManualOffset(v => v + 10)}>+10</button>
                  <button className="mc-btn" onClick={() => setManualOffset(v => v + 100)}>+100</button>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
              <button className="mc-btn-ghost" onClick={() => setShowSettings(false)}>Cancel</button>
              <button className="mc-btn" onClick={saveSettings}>Save</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
