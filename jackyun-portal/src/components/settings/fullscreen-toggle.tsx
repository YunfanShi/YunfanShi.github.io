'use client';

import { useState, useEffect } from 'react';

export default function FullscreenToggle() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(localStorage.getItem('show_fullscreen_btn') === 'true');
  }, []);

  const handleToggle = () => {
    const newVal = !enabled;
    setEnabled(newVal);
    localStorage.setItem('show_fullscreen_btn', newVal ? 'true' : 'false');
    // Broadcast to other tabs
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'show_fullscreen_btn',
      newValue: newVal ? 'true' : 'false',
    }));
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