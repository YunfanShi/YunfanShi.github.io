'use client';

import { useState } from 'react';
import TextTools from '@/components/modules/tools/text-tools';
import TimeSync from '@/components/modules/tools/time-sync';
import ClipboardShare from '@/components/modules/tools/clipboard-share';

const TABS = [
  { id: 'text', label: '文本工具', icon: 'text_snippet', color: '#4285F4' },
  { id: 'time', label: '时间同步', icon: 'schedule', color: '#34A853' },
  { id: 'clipboard', label: '剪贴板', icon: 'content_paste', color: '#FBBC05' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function ToolsTabs() {
  const [active, setActive] = useState<TabId>('text');

  const activeTab = TABS.find((t) => t.id === active)!;

  return (
    <div className="flex flex-col gap-5">
      {/* Tab bar */}
      <div className="flex gap-1 rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className="flex flex-1 items-center justify-center gap-2 rounded-[9px] py-2.5 text-sm font-medium transition-all"
            style={{
              backgroundColor: active === tab.id ? tab.color : 'transparent',
              color: active === tab.id ? '#fff' : 'var(--muted-foreground)',
            }}
          >
            <span className="material-icons-round text-base">{tab.icon}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content card */}
      <div className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-5">
        <div className="flex items-center gap-2 mb-5">
          <span className="material-icons-round text-xl" style={{ color: activeTab.color }}>
            {activeTab.icon}
          </span>
          <h2 className="font-semibold text-[var(--foreground)]">{activeTab.label}</h2>
        </div>

        {active === 'text' && <TextTools />}
        {active === 'time' && <TimeSync />}
        {active === 'clipboard' && <ClipboardShare />}
      </div>
    </div>
  );
}
