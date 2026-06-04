'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { RelaxState } from '@/types/relax';
import { saveRelaxState } from '@/actions/relax';
import AIChat from './ai-chat';
import HydrationTracker from './hydration-tracker';

interface Props {
  initialTheme: RelaxState['theme'];
  hasApiKey: boolean;
  initialWaterCount: number;
  initialWaterDate: string | null;
  children: React.ReactNode;
}

const THEMES = {
  default: { bg: 'var(--background)', text: 'var(--foreground)', card: 'var(--card)', border: 'var(--card-border)' },
  dragon: { bg: '#0a0e1a', text: '#e2e8f0', card: '#111827', border: '#1e293b' },
  eri: { bg: '#fdf2f8', text: '#831843', card: '#fce7f3', border: '#fbcfe8' },
} as const;

export default function RelaxLayout({ initialTheme, hasApiKey, initialWaterCount, initialWaterDate, children }: Props) {
  const [theme, setTheme] = useState<RelaxState['theme']>(initialTheme);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  const startMatrix = useCallback((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const fontSize = 14;
    const cols = Math.floor(canvas.width / fontSize);
    const drops: number[] = Array(cols).fill(1);
    const chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノABCDEFGHIJ0123456789';

    const draw = () => {
      ctx.fillStyle = 'rgba(10,14,26,0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#00ff41';
      ctx.font = `${fontSize}px monospace`;

      for (let i = 0; i < drops.length; i++) {
        const char = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(char, i * fontSize, drops[i] * fontSize);
        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      }
      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    if (theme === 'dragon' && canvasRef.current) {
      const cleanup = startMatrix(canvasRef.current);
      return cleanup;
    } else {
      cancelAnimationFrame(rafRef.current);
    }
  }, [theme, startMatrix]);

  const switchTheme = (t: RelaxState['theme']) => {
    setTheme(t);
    saveRelaxState({ theme: t });
  };

  const t = THEMES[theme];

  return (
    <div
      className="relative flex flex-col h-full min-h-screen transition-colors duration-300"
      style={{ background: t.bg, color: t.text }}
    >
      {/* Matrix canvas (dragon only) */}
      {theme === 'dragon' && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none opacity-20"
          style={{ zIndex: 0 }}
        />
      )}

      <div className="relative z-10 flex flex-col h-full p-6 gap-6" style={{ minHeight: '100vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: t.text }}>
              {theme === 'dragon' ? '🐉 ' : theme === 'eri' ? '🌸 ' : '🧘 '}
              Jack&apos;s Sanctuary
            </h1>
            <p className="text-sm mt-0.5" style={{ color: theme === 'dragon' ? '#64748b' : theme === 'eri' ? '#be185d' : 'var(--muted-foreground)' }}>
              专注、呼吸、放松 · Focus, Breathe, Relax
            </p>
          </div>
          <div className="flex gap-2">
            {(['default', 'dragon', 'eri'] as const).map((t) => (
              <button
                key={t}
                onClick={() => switchTheme(t)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-all"
                style={{
                  background: theme === t
                    ? (t === 'dragon' ? '#1e3a5f' : t === 'eri' ? '#f9a8d4' : 'var(--primary)')
                    : 'transparent',
                  color: theme === t
                    ? (t === 'dragon' ? '#93c5fd' : t === 'eri' ? '#831843' : 'var(--primary-foreground)')
                    : THEMES[theme].text,
                  borderColor: t === 'dragon' ? '#1e3a5f' : t === 'eri' ? '#f9a8d4' : 'var(--border)',
                  opacity: theme === t ? 1 : 0.6,
                }}
              >
                {t === 'dragon' ? '🐉 Dragon' : t === 'eri' ? '🌸 Eri' : '☀️ Default'}
              </button>
            ))}
          </div>
        </div>

        {/* Body: tools + chat */}
        <div className="flex flex-1 gap-6 min-h-0" style={{ flexWrap: 'nowrap' as const }}>
          {/* Left: tools */}
          <div
            className="flex-1 min-w-0"
            style={{ '--card': t.card, '--card-border': t.border, '--foreground': t.text } as React.CSSProperties}
          >
            {children}
          </div>

          {/* Right: chat */}
          <div
            className="flex flex-col rounded-[12px] border p-4"
            style={{
              width: '400px',
              minWidth: '320px',
              maxWidth: '400px',
              flexShrink: 0,
              background: t.card,
              borderColor: t.border,
              height: 'calc(100vh - 200px)',
              position: 'sticky',
              top: '1rem',
            }}
          >
            <div className="flex-1 min-h-0 flex flex-col" style={{ overflow: 'hidden' }}>
              <AIChat hasApiKey={hasApiKey} theme={theme} />
            </div>
            <div
              className="border-t pt-3 mt-3"
              style={{ borderColor: t.border }}
            >
              <HydrationTracker
                initialCount={initialWaterCount}
                initialDate={initialWaterDate}
                theme={theme}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
