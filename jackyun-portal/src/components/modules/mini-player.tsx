'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * MiniPlayer — 后台单曲播放器
 * 监听 jackyun-ai-music CustomEvent：
 *   { action: 'play', songId: string, songName?: string }
 *   { action: 'stop' }
 * 
 * type=2 = 单曲模式, height=66 = 仅播放条
 * 默认折叠为小圆点图标，点击展开播放条
 */
export default function MiniPlayer() {
  const [songId, setSongId] = useState('');
  const [songName, setSongName] = useState('');
  const [visible, setVisible] = useState(false);       // 是否正在播放
  const [expanded, setExpanded] = useState(false);      // 是否展开显示
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const lastTimestamp = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    // 初始位置：右下角
    setPosition({
      x: typeof window !== 'undefined' ? window.innerWidth - 70 : 0,
      y: typeof window !== 'undefined' ? window.innerHeight - 120 : 0,
    });
    return () => { mounted.current = false; };
  }, []);

  // 清除 localStorage 命令（防复活）
  const clearCommand = useCallback(() => {
    try {
      localStorage.removeItem('jackyun_ai_music_command');
    } catch { /* ignore */ }
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
        if (id) {
          setSongId(id);
          setSongName(detail.songName || '');
          setVisible(true);
          setExpanded(false); // 先折叠
        }
      } else if (detail.action === 'stop') {
        setVisible(false);
        setExpanded(false);
      }
    };
    window.addEventListener('jackyun-ai-music', handler);

    // 仅监听跨页面的 storage 事件（不主动轮询）
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
            setSongId(id);
            setSongName(cmd.songName || '');
            setVisible(true);
            setExpanded(false);
          }
        } else if (cmd.action === 'stop') {
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
  }, []);

  // 关闭并停止
  const handleClose = useCallback(() => {
    setVisible(false);
    setExpanded(false);
    clearCommand();
    // 发送停止事件
    window.dispatchEvent(new CustomEvent('jackyun-ai-music', {
      detail: { action: 'stop', timestamp: Date.now() },
    }));
  }, [clearCommand]);

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

  if (!visible) return null;

  const iframeSrc = `https://music.163.com/outchain/player?type=2&id=${songId}&auto=1&height=66`;

  // 折叠状态：只显示一个小圆点
  if (!expanded) {
    return (
      <div
        className="fixed z-[60] w-10 h-10 rounded-full bg-[#c20c0c] shadow-lg flex items-center justify-center cursor-pointer hover:scale-110 transition-transform animate-pulse"
        style={{ left: position.x, top: position.y }}
        onClick={handleIconClick}
        title={`播放中${songName ? ': ' + songName : ''}`}
      >
        <span className="material-icons-round text-white text-lg">music_note</span>
      </div>
    );
  }

  // 展开状态：显示播放条
  return (
    <div
      className="fixed z-[60] rounded-lg overflow-hidden shadow-2xl border border-[#333] bg-[#1a1a2e] select-none"
      style={{
        left: position.x,
        top: position.y,
        width: 350,
        cursor: dragging ? 'grabbing' : 'grab',
      }}
    >
      {/* 拖动标题栏 */}
      <div
        onMouseDown={handleMouseDown}
        className="flex items-center justify-between px-3 py-1.5 bg-[#16213e] text-white text-xs"
      >
        <span className="flex items-center gap-1.5 truncate">
          <span className="material-icons-round text-sm" style={{ color: '#c20c0c' }}>music_note</span>
          <span className="truncate">{songName || `歌曲 ${songId}`}</span>
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

      {/* 单曲播放条 (height=66 的 iframe，仅显示播放控件) */}
      <div className="w-full" style={{ height: 66, overflow: 'hidden' }}>
        <iframe
          src={iframeSrc}
          width="100%"
          height="66"
          frameBorder="no"
          allow="autoplay"
          style={{ display: 'block', border: 'none' }}
          title="音乐播放器"
        />
      </div>
    </div>
  );
}