'use client';

import { useState, useTransition } from 'react';
import { updateMastery } from '@/actions/poem';

interface Poem {
  id: string;
  title: string;
  author: string | null;
  content: string;
  mastery_level: number;
}

interface ReciteModeProps {
  poem: Poem;
  onClose: () => void;
}

export default function ReciteMode({ poem, onClose }: ReciteModeProps) {
  const lines = poem.content.split('\n').filter((l) => l.trim());
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [mastery, setMastery] = useState(poem.mastery_level);
  const [isPending, startTransition] = useTransition();

  function toggleLine(idx: number) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  }

  function handleHideAll() {
    setHidden(new Set(lines.map((_, i) => i)));
  }

  function handleRevealAll() {
    setHidden(new Set());
  }

  function handleMastery(level: number) {
    setMastery(level);
    startTransition(() => updateMastery(poem.id, level));
  }

  const STAR_COLORS = ['#EA4335', '#FBBC05', '#FBBC05', '#34A853', '#34A853'];

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto"
      style={{ backgroundColor: '#0a0a0a', color: '#f5f5f5' }}
    >
      {/* Top bar */}
      <div
        className="sticky top-0 z-10 flex items-center justify-between px-6 py-4"
        style={{ backgroundColor: '#0a0a0a', borderBottom: '1px solid #1f1f1f' }}
      >
        <div>
          <h2 className="text-xl font-bold tracking-wide">{poem.title}</h2>
          {poem.author && (
            <p className="mt-0.5 text-sm" style={{ color: '#888' }}>
              {poem.author}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleHideAll}
            title="隐藏全部"
            className="flex items-center gap-1 rounded-[8px] px-3 py-1.5 text-xs transition-colors hover:bg-[#1f1f1f]"
            style={{ color: '#aaa' }}
          >
            <span className="material-icons-round text-base">visibility_off</span>
            <span className="hidden sm:inline">隐藏全部</span>
          </button>
          <button
            onClick={handleRevealAll}
            title="显示全部"
            className="flex items-center gap-1 rounded-[8px] px-3 py-1.5 text-xs transition-colors hover:bg-[#1f1f1f]"
            style={{ color: '#aaa' }}
          >
            <span className="material-icons-round text-base">visibility</span>
            <span className="hidden sm:inline">显示全部</span>
          </button>
          <button
            onClick={onClose}
            title="退出"
            className="flex items-center justify-center rounded-full p-2 transition-colors hover:bg-[#1f1f1f]"
            style={{ color: '#aaa' }}
          >
            <span className="material-icons-round text-xl">close</span>
          </button>
        </div>
      </div>

      {/* Poem lines */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-xl space-y-4">
          {lines.map((line, idx) => (
            <button
              key={idx}
              onClick={() => toggleLine(idx)}
              className="group w-full rounded-[10px] px-5 py-4 text-left text-2xl font-medium tracking-widest transition-all duration-200"
              style={{
                backgroundColor: hidden.has(idx) ? '#1a1a1a' : '#141414',
                color: hidden.has(idx) ? 'transparent' : '#f0f0f0',
                border: '1px solid #222',
                textShadow: hidden.has(idx) ? 'none' : undefined,
                userSelect: 'none',
              }}
              title={hidden.has(idx) ? '点击显示' : '点击隐藏'}
            >
              {hidden.has(idx) ? (
                <span
                  className="flex items-center justify-center gap-2 text-sm"
                  style={{ color: '#555' }}
                >
                  <span className="material-icons-round text-base">visibility_off</span>
                  点击显示
                </span>
              ) : (
                line
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Bottom bar — mastery */}
      <div
        className="sticky bottom-0 flex flex-col items-center gap-3 px-6 py-5"
        style={{ backgroundColor: '#0a0a0a', borderTop: '1px solid #1f1f1f' }}
      >
        <p className="text-xs" style={{ color: '#666' }}>
          掌握程度
        </p>
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4, 5].map((level) => (
            <button
              key={level}
              onClick={() => handleMastery(level)}
              disabled={isPending}
              title={`${level} 星`}
              className="transition-transform hover:scale-110 disabled:opacity-50"
            >
              <span
                className="material-icons-round text-3xl"
                style={{
                  color: level <= mastery ? STAR_COLORS[level - 1] : '#333',
                }}
              >
                {level <= mastery ? 'star' : 'star_border'}
              </span>
            </button>
          ))}
        </div>
        {mastery > 0 && (
          <p className="text-xs" style={{ color: '#555' }}>
            {['', '初识', '熟悉', '较熟', '熟练', '完全掌握'][mastery]}
          </p>
        )}
      </div>
    </div>
  );
}
