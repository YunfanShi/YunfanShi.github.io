'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * MiniPlayer — 后台单曲播放器（原生 HTML5 Audio）
 * 监听 jackyun-ai-music CustomEvent：
 *   { action: 'play', songId: string, songName?: string }
 *   { action: 'stop' }
 * 
 * 使用原生 <audio> 元素 + 网易云音频直链（music.163.com/song/media/outer/url?id={id}.mp3）
 * 提供完整的播放控制：播放/暂停、进度条、音量、歌曲信息显示
 */
export default function MiniPlayer() {
  const [songId, setSongId] = useState('');
  const [songName, setSongName] = useState('');
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const lastTimestamp = useRef(0);
  const mounted = useRef(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 初始化 audio 元素
  useEffect(() => {
    mounted.current = true;
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.volume = 0.8;
    audioRef.current = audio;

    audio.addEventListener('timeupdate', () => setCurrentTime(audio.currentTime));
    audio.addEventListener('loadedmetadata', () => {
      setDuration(audio.duration || 0);
      setLoading(false);
    });
    audio.addEventListener('play', () => setPlaying(true));
    audio.addEventListener('pause', () => setPlaying(false));
    audio.addEventListener('ended', () => setPlaying(false));
    audio.addEventListener('waiting', () => setLoading(true));
    audio.addEventListener('canplay', () => setLoading(false));
    audio.addEventListener('error', () => {
      setLoading(false);
      setError('音频加载失败，请检查网络或歌曲ID');
    });

    // 初始位置：右下角
    setPosition({
      x: typeof window !== 'undefined' ? window.innerWidth - 70 : 0,
      y: typeof window !== 'undefined' ? window.innerHeight - 120 : 0,
    });

    return () => {
      mounted.current = false;
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, []);

  // 清除 localStorage 命令（防复活）
  const clearCommand = useCallback(() => {
    try {
      localStorage.removeItem('jackyun_ai_music_command');
    } catch { /* ignore */ }
  }, []);

  // 播放指定歌曲
  const playSong = useCallback((id: string, name: string) => {
    if (!audioRef.current) return;
    setSongId(id);
    setSongName(name || `歌曲 ${id}`);
    setError('');
    setLoading(true);
    // 网易云音频直链
    const src = `https://music.163.com/song/media/outer/url?id=${id}.mp3`;
    audioRef.current.src = src;
    audioRef.current.play().catch(() => {
      setLoading(false);
      setError('播放失败，请检查网络或歌曲ID');
    });
  }, []);

  // 停止播放
  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.src = '';
    }
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setError('');
  }, []);

  // 只监听 CustomEvent（同页面内通信，不轮询 localStorage）
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;

      // 防止重复处理相同时间戳的指令
      const ts = detail.timestamp || Date.now();
      if (ts <= lastTimestamp.current) return;
      lastTimestamp.current = ts;

      if (detail.action === 'play') {
        const id = detail.songId || detail.playlistId || '';
        if (id && detail.type !== 'playlist') {
          // 只支持单曲模式
          setVisible(true);
          setExpanded(true);
          playSong(id, detail.songName || '');
        } else if (id && detail.type === 'playlist') {
          // 歌单模式改为播放歌单中可能的第一首歌（如果 AI 提供 songName 或有其他信息）
          setVisible(true);
          setExpanded(true);
          playSong(id, detail.songName || '正在播放');
        }
      } else if (detail.action === 'stop') {
        stopPlayback();
        setVisible(false);
        setExpanded(false);
      }
    };
    window.addEventListener('jackyun-ai-music', handler);

    const storageHandler = (e: StorageEvent) => {
      if (e.key !== 'jackyun_ai_music_command') return;
      if (!e.newValue) return;
      try {
        const cmd = JSON.parse(e.newValue);
        const ts = cmd.timestamp || Date.now();
        if (ts <= lastTimestamp.current) return;
        lastTimestamp.current = ts;
        if (cmd.action === 'play') {
          const id = cmd.songId || cmd.playlistId || '';
          if (id) {
            setVisible(true);
            setExpanded(true);
            playSong(id, cmd.songName || '');
          }
        } else if (cmd.action === 'stop') {
          stopPlayback();
          setVisible(false);
          setExpanded(false);
        }
      } catch { /* ignore */ }
    };
    window.addEventListener('storage', storageHandler);

    return () => {
      window.removeEventListener('jackyun-ai-music', handler);
      window.removeEventListener('storage', storageHandler);
    };
  }, [playSong, stopPlayback]);

  // 关闭并停止
  const handleClose = useCallback(() => {
    stopPlayback();
    setVisible(false);
    setExpanded(false);
    clearCommand();
    // 发送停止事件
    window.dispatchEvent(new CustomEvent('jackyun-ai-music', {
      detail: { action: 'stop', timestamp: Date.now() },
    }));
  }, [stopPlayback, clearCommand]);

  // 播放/暂停切换
  const handlePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !songId) return;
    if (audio.paused) {
      audio.play().catch(() => setError('播放失败'));
    } else {
      audio.pause();
    }
  }, [songId]);

  // 跳转进度
  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const time = parseFloat(e.target.value);
    audio.currentTime = time;
    setCurrentTime(time);
  }, [duration]);

  // 音量控制
  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setVolume(vol);
    if (audioRef.current) {
      audioRef.current.volume = vol;
    }
  }, []);

  // 点击折叠图标展开
  const handleIconClick = useCallback(() => {
    setExpanded(true);
  }, []);

  // 拖拽逻辑
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, ox: position.x, oy: position.y };
  }, [position]);

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent) => {
      setPosition({
        x: dragStart.current.ox + (e.clientX - dragStart.current.x),
        y: dragStart.current.oy + (e.clientY - dragStart.current.y),
      });
    };
    const handleUp = () => setDragging(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragging]);

  // 格式化时间 mm:ss
  const formatTime = (sec: number): string => {
    if (!isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (!visible) return null;

  // 折叠状态：只显示一个小圆点
  if (!expanded) {
    return (
      <div
        className="mobile-floating-player fixed z-[60] w-10 h-10 rounded-full bg-[#c20c0c] shadow-lg flex items-center justify-center cursor-pointer hover:scale-110 transition-transform animate-pulse"
        style={{ left: position.x, top: position.y }}
        onClick={handleIconClick}
        title={`播放中${songName ? ': ' + songName : ''}`}
      >
        <span className="material-icons-round text-white text-lg">music_note</span>
      </div>
    );
  }

  // 展开状态：原生播放器控件
  return (
    <div
      className="mobile-floating-player fixed z-[60] rounded-xl overflow-hidden shadow-2xl border border-[#333] bg-[#1a1a2e] select-none"
      style={{
        left: position.x,
        top: position.y,
        width: 'min(320px, calc(100vw - 16px))',
        cursor: dragging ? 'grabbing' : 'grab',
      }}
    >
      {/* 拖动标题栏 */}
      <div
        onMouseDown={handleMouseDown}
        className="flex items-center justify-between px-3 py-2 bg-[#16213e] text-white text-xs"
      >
        <span className="flex items-center gap-1.5 truncate">
          <span className="material-icons-round text-sm" style={{ color: '#c20c0c' }}>music_note</span>
          <span className="truncate font-medium">{songName || `歌曲 ${songId}`}</span>
        </span>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
            className="p-0.5 rounded hover:bg-white/10 text-white/60 hover:text-white"
            title="最小化"
          >
            <span className="material-icons-round text-sm">minimize</span>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleClose(); }}
            className="p-0.5 rounded hover:bg-white/10 text-white/60 hover:text-white"
            title="关闭"
          >
            <span className="material-icons-round text-sm">close</span>
          </button>
        </div>
      </div>

      {/* 播放控制区 */}
      <div className="p-3">
        {/* 歌曲信息 */}
        <div className="text-center mb-2">
          <p className="text-white text-sm font-medium truncate">{songName || `歌曲 ${songId}`}</p>
          <p className="text-white/50 text-[10px] mt-0.5 truncate">ID: {songId}</p>
          {error && (
            <p className="text-[#FF5252] text-[10px] mt-1">{error}</p>
          )}
        </div>

        {/* 播放/暂停按钮 + 加载状态 */}
        <div className="flex items-center justify-center gap-3 mb-2">
          <button
            onClick={handlePlayPause}
            disabled={loading || !songId}
            className="w-10 h-10 rounded-full bg-[#c20c0c] text-white flex items-center justify-center hover:bg-[#e02424] disabled:opacity-50 transition-colors"
            title={playing ? '暂停' : '播放'}
          >
            <span className="material-icons-round text-lg">
              {loading ? 'hourglass_top' : playing ? 'pause' : 'play_arrow'}
            </span>
          </button>
        </div>

        {/* 进度条 */}
        <div className="flex items-center gap-2">
          <span className="text-white/60 text-[10px] w-8 text-right">{formatTime(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={duration || 0}
            value={currentTime}
            onChange={handleSeek}
            disabled={!duration}
            className="flex-1 h-1 accent-[#c20c0c] cursor-pointer"
          />
          <span className="text-white/60 text-[10px] w-8">{formatTime(duration)}</span>
        </div>

        {/* 音量控制 */}
        <div className="flex items-center gap-2 mt-2">
          <span className="material-icons-round text-white/60 text-sm">volume_up</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={handleVolumeChange}
            className="flex-1 h-1 accent-[#c20c0c] cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
}
