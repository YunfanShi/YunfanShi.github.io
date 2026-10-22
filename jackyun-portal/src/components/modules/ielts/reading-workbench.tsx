'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import type { ReaderBootstrap } from '@/actions/reader';
import NovelWorkbench from '@/components/modules/ielts/novel-workbench';

const AiReadingStudio = dynamic(() => import('./ai-reading-studio'), {
  loading: () => <div role="status" aria-live="polite" className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-4 py-5 text-sm text-[var(--muted-foreground)]">正在加载 AI 阅读工坊…</div>,
});

export default function ReadingWorkbench({ bootstrap }: { bootstrap: ReaderBootstrap }) {
  const [experience, setExperience] = useState<'novels' | 'ai'>('novels');
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('jy-early-click-ready', { detail: { key: 'reading-ai-studio' } }));
  }, []);
  if (experience === 'novels') return <NovelWorkbench bootstrap={bootstrap} onOpenAiStudio={() => setExperience('ai')} />;
  return <div className="space-y-4"><button type="button" onClick={() => setExperience('novels')} className="min-h-11 rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-4 text-sm font-bold text-[#0f766e]"><span className="material-icons-round mr-2 align-middle">arrow_back</span>返回小说书架</button><AiReadingStudio /></div>;
}
