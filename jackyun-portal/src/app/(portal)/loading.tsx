'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

const ROUTE_MESSAGES: Record<string, { emoji: string; message: string }> = {
  '/dashboard':     { emoji: '📊', message: '正在加载仪表盘...' },
  '/control':       { emoji: '📅', message: '正在加载日程中心...' },
  '/study':         { emoji: '📖', message: '正在打开学习计划...' },
  '/goal':          { emoji: '🎯', message: '正在加载目标数据...' },
  '/study-guide':   { emoji: '📚', message: '正在打开学习指南...' },
  '/time-management': { emoji: '⏰', message: '正在加载时间管理...' },
  '/pomodoro':      { emoji: '🍅', message: '正在准备番茄钟...' },
  '/vocab':         { emoji: '📝', message: '正在加载词汇宝库...' },
  '/music':         { emoji: '🎵', message: '音乐即将响起...' },
  '/music-sync':    { emoji: '🔁', message: '正在同步音乐...' },
  '/relax':         { emoji: '🌿', message: '正在准备放松空间...' },
  '/poem':          { emoji: '🏮', message: '正在打开诗词天地...' },
  '/settings':      { emoji: '⚙️', message: '正在加载设置...' },
  '/update':        { emoji: '📣', message: '正在加载更新日志...' },
  '/timetable-hub': { emoji: '🗓️', message: '正在打开日程生成器...' },
  '/quiz':          { emoji: '🧠', message: '正在准备刷题...' },
  '/mock-portal':   { emoji: '📝', message: '正在加载模拟考试...' },
  '/answer-sheet':  { emoji: '✍️', message: '正在打开答题卡...' },
  '/answer-sheet-sync': { emoji: '🔄', message: '正在同步答题卡...' },
  '/bilibili-sync': { emoji: '📺', message: '正在同步 B 站视频...' },
  '/md2word':       { emoji: '📄', message: '正在打开文档转换...' },
  '/tools':         { emoji: '🛠️', message: '正在加载工具箱...' },
  '/admin':         { emoji: '🛡️', message: '正在加载管理面板...' },
};

const FALLBACK_MESSAGES = [
  { emoji: '🚀', message: '正在进入 JackYun...' },
  { emoji: '💡', message: '正在汇聚灵感...' },
  { emoji: '⚡', message: '正在加速加载...' },
  { emoji: '🌟', message: '正在准备精彩内容...' },
];

export default function PortalLoading() {
  const pathname = usePathname();
  const [messageIndex, setMessageIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  const routeInfo = ROUTE_MESSAGES[pathname] || FALLBACK_MESSAGES[0];

  useEffect(() => {
    const fallbackIndex = Math.floor(Math.random() * FALLBACK_MESSAGES.length);
    setMessageIndex(fallbackIndex);

    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) return prev + 0.5;
        return prev + 2 + Math.random() * 3;
      });
    }, 200);

    return () => {
      clearInterval(progressInterval);
    };
  }, [pathname]);

  const display = ROUTE_MESSAGES[pathname]
    ? routeInfo
    : FALLBACK_MESSAGES[messageIndex % FALLBACK_MESSAGES.length];

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh]">
      {/* Animated loader */}
      <div className="relative w-24 h-24 mb-8">
        {/* Rotating ring */}
        <div className="absolute inset-0 rounded-full border-4 border-[#4285F4]/20 border-t-[#4285F4] animate-spin" />
        {/* Inner pulse */}
        <div className="absolute inset-3 rounded-full bg-gradient-to-br from-[#4285F4] to-[#34A853] opacity-20 animate-pulse" />
        {/* Center emoji */}
        <div className="absolute inset-0 flex items-center justify-center text-3xl animate-bounce">
          {display.emoji}
        </div>
      </div>

      {/* Message */}
      <p className="text-base font-medium text-[var(--foreground)] mb-4">
        {display.message}
      </p>

      {/* Google 4-color progress bar */}
      <div className="w-64 h-1.5 rounded-full bg-[var(--md-surface-variant, #F1F3F4)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${Math.min(100, progress)}%`,
            background: 'linear-gradient(90deg, #4285F4 0%, #EA4335 25%, #FBBC04 50%, #34A853 75%, #4285F4 100%)',
          }}
        />
      </div>
      <p className="mt-3 text-xs text-[var(--muted-foreground)]">
        正在加载中...
      </p>
    </div>
  );
}