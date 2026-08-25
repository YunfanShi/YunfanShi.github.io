'use client';

import { useState, useEffect } from 'react';
import { saveSettingsField } from '@/actions/settings';

export default function FullscreenToggle({ initialEnabled = false }: { initialEnabled?: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);

  useEffect(() => {
    const local = localStorage.getItem('show_fullscreen_btn');
    queueMicrotask(() => setEnabled(local === null ? initialEnabled : local === 'true'));
    if (local === null) localStorage.setItem('show_fullscreen_btn', initialEnabled ? 'true' : 'false');
  }, [initialEnabled]);

  const handleToggle = () => {
    const newVal = !enabled;
    setEnabled(newVal);
    localStorage.setItem('show_fullscreen_btn', newVal ? 'true' : 'false');
    // Broadcast to other tabs
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'show_fullscreen_btn',
      newValue: newVal ? 'true' : 'false',
    }));
    void saveSettingsField('appearance_preferences', 'showFullscreen', newVal);
  };

  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-sm font-medium text-[var(--foreground)]">全屏按钮</div>
        <div className="text-xs text-[var(--muted-foreground)] mt-0.5">在顶栏显示全屏切换按钮（点击自动全屏并折叠侧栏）</div>
      </div>
      <button
        onClick={handleToggle}
        className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${
          enabled ? 'bg-[#4285F4]' : 'bg-gray-300 dark:bg-gray-600'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
            enabled ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}
