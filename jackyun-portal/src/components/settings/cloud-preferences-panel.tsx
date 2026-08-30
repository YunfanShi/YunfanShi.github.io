'use client';

import { useEffect, useState } from 'react';
import { saveSettingsSection, type SettingsKey } from '@/actions/settings';
import { useAuthMode } from '@/components/auth/auth-mode-provider';

interface Field { key: string; label: string; description: string; type: 'boolean' | 'number' | 'select'; min?: number; max?: number; options?: Array<{ value: string; label: string }>; }

export default function CloudPreferencesPanel({ sectionKey, initialValue, fields }: { sectionKey: SettingsKey; initialValue: Record<string, unknown>; fields: Field[] }) {
  const { signedIn } = useAuthMode();
  const [value, setValue] = useState(initialValue);
  const [status, setStatus] = useState('');
  const localKey = `jackyun_settings_${sectionKey}`;
  useEffect(() => {
    if (signedIn) {
      queueMicrotask(() => setValue(initialValue));
      return;
    }
    try {
      const local = localStorage.getItem(localKey);
      if (local) {
        const saved = { ...initialValue, ...JSON.parse(local) };
        if (sectionKey === 'appearance_preferences') {
          const currentTheme = localStorage.getItem('jackyun_theme');
          const fullscreen = localStorage.getItem('show_fullscreen_btn');
          if (currentTheme === 'light' || currentTheme === 'gray' || currentTheme === 'dark') saved.theme = currentTheme;
          if (fullscreen !== null) saved.showFullscreen = fullscreen !== 'false';
        }
        queueMicrotask(() => setValue(saved));
      }
    } catch {}
  }, [initialValue, localKey, sectionKey, signedIn]);

  function applySavedAppearance() {
    if (sectionKey !== 'appearance_preferences') return;
    const theme = value.theme === 'gray' || value.theme === 'dark' ? value.theme : 'light';
    const showFullscreen = value.showFullscreen !== false;
    localStorage.setItem('jackyun_theme', theme);
    localStorage.setItem('show_fullscreen_btn', String(showFullscreen));
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.density = value.density === 'compact' ? 'compact' : 'comfortable';
    document.documentElement.dataset.reducedMotion = value.reducedMotion === true ? 'true' : 'false';
    document.documentElement.style.colorScheme = theme === 'light' ? 'light' : 'dark';
    document.querySelectorAll('iframe').forEach((frame) => frame.contentWindow?.postMessage({ type: 'jackyun-theme', theme }, '*'));
    window.dispatchEvent(new StorageEvent('storage', { key: 'show_fullscreen_btn', newValue: String(showFullscreen) }));
  }
  async function save() {
    setStatus('保存中…');
    try { localStorage.setItem(localKey, JSON.stringify(value)); } catch {}
    applySavedAppearance();
    if (!signedIn) { setStatus('已保存到本机；登录后自动同步'); return; }
    const result = await saveSettingsSection(sectionKey, value);
    setStatus(result.error ? '已保存到本机；云同步暂时不可用' : '已保存到本机并同步到云端');
  }
  return <div className="space-y-1">
    {fields.map((field) => <label key={field.key} className="flex items-center justify-between gap-5 border-b border-[var(--card-border)] py-4 last:border-0"><span><strong className="block text-sm font-medium">{field.label}</strong><small className="mt-1 block leading-5 text-[var(--muted-foreground)]">{field.description}</small></span>{field.type === 'boolean' ? <input type="checkbox" checked={value[field.key] === true} onChange={(event) => setValue({ ...value, [field.key]: event.target.checked })} className="h-5 w-5 shrink-0" /> : field.type === 'number' ? <input type="number" min={field.min} max={field.max} value={Number(value[field.key] ?? field.min ?? 0)} onChange={(event) => setValue({ ...value, [field.key]: Number(event.target.value) })} className="w-24 rounded-lg border border-[var(--card-border)] bg-[var(--background)] p-2" /> : <select value={String(value[field.key] ?? field.options?.[0]?.value ?? '')} onChange={(event) => setValue({ ...value, [field.key]: event.target.value })} className="w-36 rounded-lg border border-[var(--card-border)] bg-[var(--background)] p-2">{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>}</label>)}
    <div className="flex items-center gap-3 pt-4"><button type="button" onClick={save} className="rounded-xl bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white dark:text-[#202124]">保存设置</button>{status && <span className="text-xs text-[var(--muted-foreground)]">{status}</span>}</div>
  </div>;
}
