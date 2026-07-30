'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * MiniPlayer — 可拖拽的小型音乐弹窗播放器
 * 监听 jackyun-ai-music CustomEvent：
 *   { action: 'play', playlistId: string }
 *   { action: 'stop' }
 */
export default function MiniPlayer() {
  const [visible, setVisible] = useState(false);
  const [playlistId, setPlaylistId] = useState('17652191106');
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const initialized = useRef(false);

  // 初始化位置：右下角（AI FAB 上方）
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    setPosition({
      x: typeof window !== 'undefined' ? window.innerWidth - 380 : 0,
      y: typeof window !== 'undefined' ? window.innerHeight - 560 : 0,
    });
  }, []);

  // 监听自定义事件
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      if (detail.action === 'play') {
        setPlaylistId(detail.playlistId || '17652191106');
        setVisible(true);
      } else if (detail.action === 'stop') {
        setVisible(false);
      }
    };
    window.addEventListener('jackyun-ai-music', handler);

    // 也监听 localStorage 变化（同页面跨组件通信）
    const checkStorage = () => {
      try {
        const raw = localStorage.getItem('jackyun_ai_music_command');
        if (raw) {
          const cmd = JSON.parse(raw);
          if (cmd.action === 'play') {
            setPlaylistId(cmd.playlistId || '17652191106');
            setVisible(true);
          } else if (cmd.action === 'stop') {
            setVisible(false);
          }
        }
      } catch { /* ignore */ }
    };

    // 定期检查 localStorage（用于跨页面通信）
    const interval = setInterval(checkStorage, 1000);
    // 页面加载时立即检查一次
    checkStorage();

    return () => {
      window.removeEventListener('jackyun-ai-music', handler);
      clearInterval(interval);
    };
  }, []);

  // 拖拽逻辑
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, ox: position.x, oy: position.y };
  }, [position]);

  useEffect(() => {
    if (!dragging) return;

    const handleMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setPosition({
        x: dragStart.current.ox + dx,
        y: dragStart.current.oy + dy,
      });
    };

    const handleUp = () => {
      setDragging(false);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragging]);

  if (!visible) return null;

  const iframeSrc = `https://music.163.com/outchain/player?type=0&id=${playlistId}&auto=1&height=430`;

  return (
    <div
      className="fixed z-[60] rounded-xl overflow-hidden shadow-2xl border border-[var(--card-border)] bg-[#1a1a2e] select-none"
      style={{
        left: position.x,
        top: position.y,
        width: 350,
        cursor: dragging ? 'grabbing' : 'grab',
      }}
    >
      {/* 标题栏 */}
      <div
        onMouseDown={handleMouseDown}
        className="flex items-center justify-between px-3 py-2 bg-[#16213e] text-white text-xs font-medium"
      >
        <span className="flex items-center gap-1.5">
          <span className="material-icons-round text-sm" style={{ color: '#c20c0c' }}>music_note</span>
          🎵 音乐播放
        </span>
        <button
          onClick={() => setVisible(false)}
          className="p-0.5 rounded hover:bg-white/10 transition-colors text-white/70 hover:text-white"
          title="关闭播放器"
        >
          <span className="material-icons-round text-sm">close</span>
        </button>
      </div>

      {/* iframe 播放器 */}
      <div className="w-full" style={{ height: 430 }}>
        <iframe
          src={iframeSrc}
          width="100%"
          height="100%"
          frameBorder="no"
          marginWidth={0}
          marginHeight={0}
          allow="autoplay"
          style={{ display: 'block', border: 'none' }}
          title="音乐播放器"
        />
      </div>
    </div>
  );
}