'use client';

import { useEffect, useState } from 'react';

type Accent = 'blue' | 'green' | 'purple' | 'orange';
type CornerStyle = 'soft' | 'rounded';
type Customization = { accent: Accent; cornerStyle: CornerStyle };
const defaults: Customization = { accent: 'blue', cornerStyle: 'rounded' };

function readCustomization(): Customization {
  try {
    const saved = JSON.parse(localStorage.getItem('jackyun_interface_customization') || '{}') as Partial<Customization>;
    return { accent: ['green', 'purple', 'orange'].includes(saved.accent ?? '') ? saved.accent as Accent : 'blue', cornerStyle: saved.cornerStyle === 'soft' ? 'soft' : 'rounded' };
  } catch { return defaults; }
}

function applyCustomization(value: Customization) {
  document.documentElement.dataset.accent = value.accent;
  document.documentElement.dataset.cornerStyle = value.cornerStyle;
  localStorage.setItem('jackyun_interface_customization', JSON.stringify(value));
  localStorage.removeItem('jackyun_hide_homepage_ai');
}

export default function AiVisibilityControl() {
  const [value, setValue] = useState<Customization>(defaults);
  const [notice, setNotice] = useState('');
  useEffect(() => { const saved = readCustomization(); applyCustomization(saved); queueMicrotask(() => setValue(saved)); }, []);
  const update = async (next: Customization, source: 'user' | 'restore' = 'user') => {
    const before = value;
    setValue(next);
    applyCustomization(next);
    const response = await fetch('/api/ui-customization', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ before, after: next, summary: source === 'restore' ? '恢复默认界面' : `强调色=${next.accent}，圆角=${next.cornerStyle}`, source }) });
    setNotice(response.ok ? '界面状态已应用并备份。' : '已应用到本机；云端备份仅对 BETA 用户开放。');
  };
  return <div className="space-y-4"><p className="text-sm leading-6 text-[var(--muted-foreground)]">AI 只生成经过校验的界面状态，不会隐藏助手，也不会执行任意 HTML、CSS 或 JavaScript。</p><div><p className="text-sm font-medium">强调色</p><div className="mt-2 flex flex-wrap gap-2">{(['blue', 'green', 'purple', 'orange'] as const).map((accent) => <button key={accent} type="button" onClick={() => void update({ ...value, accent })} aria-pressed={value.accent === accent} className={`h-9 rounded-lg border px-3 text-xs font-semibold capitalize ${value.accent === accent ? 'border-[var(--brand)] bg-[var(--brand)] text-white' : 'border-[var(--card-border)]'}`}>{accent}</button>)}</div></div><div className="flex items-center justify-between gap-4"><div><p className="text-sm font-medium">卡片轮廓</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">调整主要卡片和面板的圆角状态。</p></div><select value={value.cornerStyle} onChange={(event) => void update({ ...value, cornerStyle: event.target.value as CornerStyle })} className="rounded-lg border border-[var(--card-border)] bg-[var(--background)] p-2 text-sm"><option value="rounded">圆润</option><option value="soft">轻圆角</option></select></div><button type="button" onClick={() => void update(defaults, 'restore')} className="rounded-lg border border-[var(--card-border)] px-3 py-2 text-xs font-semibold">恢复默认微调</button>{notice && <p className="text-xs text-[var(--muted-foreground)]">{notice}</p>}</div>;
}
