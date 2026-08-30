'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * FlyingTimer — 悬浮计时小窗（跨 iframe 通讯版）
 *
 * 背景：Legacy 页面（Goal.html / IGCountdown.html）内部的 documentPictureInPicture
 * 在 Next.js iframe 的 sandbox 环境内无法正常工作（缺少顶层窗口权限）。
 *
 * 方案：门户层（Next.js）提供该组件，监听 iframe postMessage：
 *   { type: 'jackyun-open-pip', title: string, timeText: string, running: boolean }
 *   { type: 'jackyun-close-pip', title?: string }
 *   { type: 'jackyun-update-pip', title: string, timeText: string, running: boolean }
 *
 * 小窗支持拖动 + 常驻悬浮，不随页面切换消失。
 */
export default function FlyingTimer() {
  const [visible, setVisible] = useState(false);
  const [title, setTitle] = useState('计时器');
  const [timeText, setTimeText] = useState('--:--');
  const [secondaryText, setSecondaryText] = useState('');
  const [panelId, setPanelId] = useState('timer');
  const [statusColor, setStatusColor] = useState('#34a853');
  const [actionHref, setActionHref] = useState('');
  const [running, setRunning] = useState(true);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const sourceWindow = useRef<WindowProxy | null>(null);

  // 默认位置：屏幕中部偏右（不与右下角 MiniPlayer/AI FAB 冲突）
  useEffect(() => {
    queueMicrotask(() => setPosition({
      x: window.innerWidth - 260,
      y: window.innerHeight / 2 - 40,
    }));
  }, []);

  // 监听 iframe postMessage
  useEffect(() => {
    function safeText(value: unknown, fallback = '', max = 100) {
      return typeof value === 'string' ? value.trim().slice(0, max) : fallback;
    }
    function openGeneric(data: Record<string, unknown>, source: MessageEventSource | null) {
      setPanelId(safeText(data.panelId, 'page-tool', 60));
      setTitle(safeText(data.title, '页面工具', 80));
      setTimeText(safeText(data.primaryText ?? data.timeText, '--:--', 80));
      setSecondaryText(safeText(data.secondaryText, '', 100));
      setRunning(data.running !== false);
      setStatusColor(/^#[0-9a-f]{6}$/i.test(String(data.statusColor || '')) ? String(data.statusColor) : '#34a853');
      setActionHref(/^\/[a-z0-9/_-]*$/i.test(String(data.actionHref || '')) ? String(data.actionHref) : '');
      sourceWindow.current = source && 'postMessage' in source ? source as WindowProxy : null;
      setVisible(true);
    }
    function handleMessage(e: MessageEvent) {
      try {
        const data = e.data;
        if (!data || typeof data !== 'object') return;

        if (data.type === 'jackyun-open-pip') {
          openGeneric({ ...data, panelId: 'legacy-timer', primaryText: data.timeText }, e.source);
        } else if (data.type === 'jackyun-update-pip') {
          if (typeof data.timeText === 'string') setTimeText(data.timeText);
          if (typeof data.title === 'string' && data.title) setTitle(data.title);
          if (typeof data.running === 'boolean') setRunning(data.running);
        } else if (data.type === 'jackyun-open-floating-window') {
          openGeneric(data, e.source);
        } else if (data.type === 'jackyun-update-floating-window') {
          if (typeof data.primaryText === 'string') setTimeText(data.primaryText.slice(0, 80));
          if (typeof data.secondaryText === 'string') setSecondaryText(data.secondaryText.slice(0, 100));
          if (typeof data.title === 'string') setTitle(data.title.slice(0, 80));
          if (typeof data.running === 'boolean') setRunning(data.running);
        } else if (data.type === 'jackyun-close-pip') {
          setVisible(false);
        } else if (data.type === 'jackyun-close-floating-window' && (!data.panelId || data.panelId === panelId)) {
          setVisible(false);
        }
      } catch { /* ignore */ }
    }
    function handleCustomEvent(event: Event) {
      const detail = (event as CustomEvent<Record<string, unknown>>).detail;
      if (detail) openGeneric(detail, window);
    }
    window.addEventListener('message', handleMessage);
    window.addEventListener('jackyun-floating-window', handleCustomEvent);
    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('jackyun-floating-window', handleCustomEvent);
    };
  }, [panelId]);

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

  // 点击还原：通知 iframe 打开展开视图
  const handleExpand = useCallback(() => {
    try {
      sourceWindow.current?.postMessage({ type: 'jackyun-floating-window-action', panelId, action: 'expand' }, '*');
      if (actionHref && window.location.pathname !== actionHref) window.location.assign(actionHref);
      const frames = document.querySelectorAll('iframe');
      frames.forEach((f) => {
        try {
          const src = (f.getAttribute('src') || f.title || '').toLowerCase();
          if (src.includes('goal') || src.includes('igcountdown') || src.includes('timetablehub') || src.includes('control')) {
            f.contentWindow?.postMessage({ type: 'jackyun-pip-expand' }, '*');
          }
        } catch {}
      });
    } catch {}
  }, [actionHref, panelId]);

  if (!visible) return null;

  return (
    <div
      className="mobile-floating-timer"
      onMouseDown={handleMouseDown}
      onClick={handleExpand}
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: 9998,
        width: 'min(210px, calc(100vw - 16px))',
        background: 'rgba(17,24,39,0.92)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderRadius: '14px',
        border: '1px solid rgba(255,255,255,0.14)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        color: '#fff',
        padding: '10px 12px',
        cursor: dragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        fontFamily: "'Roboto Mono', 'Google Sans', sans-serif",
      }}
      title="点击返回页面 · 拖动可移动"
    >
      {/* 呼吸红点 */}
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: running ? statusColor : '#fbbc04',
          boxShadow: running ? `0 0 8px ${statusColor}99` : 'none',
          flexShrink: 0,
          animation: running ? 'pipPulse 1.6s ease-in-out infinite' : 'none',
        }}
      />
      <style>{`@keyframes pipPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, opacity: 0.7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {title}
        </div>
        <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.5px', fontFamily: "'Roboto Mono', monospace" }}>
          {timeText}
        </div>
        {secondaryText && <div style={{ fontSize: 10, marginTop: 2, opacity: 0.72, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{secondaryText}</div>}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          sourceWindow.current?.postMessage({ type: 'jackyun-floating-window-action', panelId, action: 'close' }, '*');
          setVisible(false);
        }}
        style={{
          border: 'none',
          background: 'rgba(255,255,255,0.12)',
          color: '#fff',
          borderRadius: 8,
          width: 24,
          height: 24,
          cursor: 'pointer',
          fontSize: 12,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        title="关闭悬浮窗"
      >
        ✕
      </button>
    </div>
  );
}
