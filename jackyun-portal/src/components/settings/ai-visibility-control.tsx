'use client';

import { useEffect, useState } from 'react';

export default function AiVisibilityControl() {
  const [hidden, setHidden] = useState(false); const [notice, setNotice] = useState('');
  useEffect(() => { queueMicrotask(() => setHidden(localStorage.getItem('jackyun_hide_homepage_ai') === 'true')); }, []);
  const update = async (nextHidden: boolean) => {
    let appearance: Record<string, unknown> = {}; try { appearance = JSON.parse(localStorage.getItem('jackyun_settings_appearance_preferences') || '{}'); } catch {}
    const before = { ...appearance, hideHomepageAi: hidden }; const after = { ...appearance, hideHomepageAi: nextHidden };
    localStorage.setItem('jackyun_hide_homepage_ai', String(nextHidden)); setHidden(nextHidden); window.dispatchEvent(new Event('jackyun-ai-visibility'));
    const response = await fetch('/api/ui-customization', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ before, after, summary: nextHidden ? '在设置中隐藏主页 AI' : '在设置中恢复主页 AI', source: 'user' }) });
    setNotice(response.ok ? '已保存到本地和云端。' : '已保存在本地；云端备份仅对 BETA 用户开放。');
  };
  return <div><div className="flex items-center justify-between gap-4"><div><p className="text-sm font-medium">主页 AI 助手</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">即使隐藏，也可以随时回到这里重新显示。</p></div><button type="button" onClick={() => void update(!hidden)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${hidden ? 'bg-[#ecfdf3] text-[#027a48]' : 'bg-[#fef3f2] text-[#b42318]'}`}>{hidden ? '重新显示' : '隐藏 AI'}</button></div>{notice && <p className="mt-2 text-xs text-[var(--muted-foreground)]">{notice}</p>}</div>;
}

