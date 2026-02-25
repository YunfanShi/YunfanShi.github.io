'use client';

import { useState, useCallback } from 'react';

interface Color {
  h: number; s: number; l: number;
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`.toUpperCase();
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

function randomPastel(): Color {
  return {
    h: Math.floor(Math.random() * 360),
    s: Math.floor(Math.random() * 30 + 50),  // 50-80%
    l: Math.floor(Math.random() * 20 + 65),  // 65-85%
  };
}

function generatePalette(): Color[] {
  return Array.from({ length: 5 }, randomPastel);
}

const ACCENT = '#4285F4';

export default function ColorPicker() {
  const [palette, setPalette]       = useState<Color[]>(() => generatePalette());
  const [selected, setSelected]     = useState<number>(0);
  const [copied, setCopied]         = useState(false);

  const active = palette[selected];
  const hex    = hslToHex(active.h, active.s, active.l);
  const [r, g, b] = hslToRgb(active.h, active.s, active.l);

  const handleGenerate = useCallback(() => {
    setPalette(generatePalette());
    setSelected(0);
    setCopied(false);
  }, []);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(hex);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }, [hex]);

  return (
    <div className="flex flex-col gap-5">
      {/* Large color preview */}
      <div
        className="w-full rounded-[12px] flex items-center justify-center"
        style={{ height: 120, backgroundColor: hex, transition: 'background-color 0.3s ease' }}
      />

      {/* Palette row */}
      <div className="flex gap-2">
        {palette.map((c, i) => {
          const h = hslToHex(c.h, c.s, c.l);
          const active = i === selected;
          return (
            <button
              key={i}
              onClick={() => { setSelected(i); setCopied(false); }}
              className="flex-1 rounded-[8px] transition-transform"
              style={{
                height: 44,
                backgroundColor: h,
                outline: active ? `2.5px solid ${ACCENT}` : '2.5px solid transparent',
                outlineOffset: 2,
                transform: active ? 'scale(1.08)' : 'scale(1)',
              }}
              title={h}
            />
          );
        })}
      </div>

      {/* Color info */}
      <div className="rounded-[10px] border border-[var(--card-border)] bg-[var(--background)] px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-[var(--muted-foreground)]">HEX</span>
          <span className="font-mono font-semibold text-[var(--foreground)]">{hex}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-[var(--muted-foreground)]">RGB</span>
          <span className="font-mono font-semibold text-[var(--foreground)]">{r}, {g}, {b}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-[var(--muted-foreground)]">HSL</span>
          <span className="font-mono font-semibold text-[var(--foreground)]">{active.h}°, {active.s}%, {active.l}%</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleCopy}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-[10px] border border-[var(--card-border)] py-2 text-sm font-medium transition-colors"
          style={{ color: copied ? '#34A853' : 'var(--foreground)' }}
        >
          <span className="material-icons-round text-base">{copied ? 'check' : 'content_copy'}</span>
          {copied ? '已复制!' : '复制 HEX'}
        </button>
        <button
          onClick={handleGenerate}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-[10px] py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: ACCENT }}
        >
          <span className="material-icons-round text-base">refresh</span>
          生成配色
        </button>
      </div>
    </div>
  );
}
