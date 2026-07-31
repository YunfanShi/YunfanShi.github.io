'use client';

import { useEffect, useState } from 'react';

const LOADING_MESSAGES = [
  '🍅 番茄正在成熟中...',
  '⏳ 倒计时准备就绪...',
  '📚 学习资料正在整理...',
  '🎯 目标正在加载...',
  '🎵 音乐即将响起...',
  '🧠 大脑正在连接AI...',
  '🏃 时间正在流动...',
  '💡 灵感正在汇聚...',
];

export default function PortalLoading() {
  const [messageIndex, setMessageIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const msgInterval = setInterval(() => {
      setMessageIndex(prev => (prev + 1) % LOADING_MESSAGES.length);
    }, 1200);

    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) return prev + 0.5;
        return prev + 2 + Math.random() * 3;
      });
    }, 200);

    return () => {
      clearInterval(msgInterval);
      clearInterval(progressInterval);
    };
  }, []);

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
          {['🍅', '⏳', '📚', '🎯'][messageIndex % 4]}
        </div>
      </div>

      {/* Message */}
      <p className="text-base font-medium text-[var(--foreground)] mb-4">
        {LOADING_MESSAGES[messageIndex]}
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