'use client';

import { useEffect, useRef, useState } from 'react';
import { type SettingsKey } from '@/actions/settings';
import { PREFERENCES_CHANGED, SETTINGS_PENDING_KEY } from '@/lib/page-preferences';
import { useAuthMode } from '@/components/auth/auth-mode-provider';

interface Field { key: string; label: string; description: string; type: 'boolean' | 'number' | 'select'; min?: number; max?: number; options?: Array<{ value: string; label: string }>; }
interface QuickSet { label: string; values: Record<string, unknown>; }

export default function CloudPreferencesPanel({ sectionKey, initialValue, fields, quickSets = [] }: { sectionKey: SettingsKey; initialValue: Record<string, unknown>; fields: Field[]; quickSets?: QuickSet[] }) {
  const { signedIn, userId } = useAuthMode();
  const owner = userId ?? 'guest';
  const savedRef = useRef(false);
  const dirtyFields = useRef(new Set<string>());
  function update(key: string, next: unknown) { dirtyFields.current.add(key); savedRef.current = false; setStatus('有未保存修改'); setValue(current => ({ ...current, [key]: next })); }
  function applyQuickSet(values: Record<string, unknown>) { for (const [key, next] of Object.entries(values)) update(key, next); }
  const initialRef = useRef(initialValue);
  const [value, setValue] = useState(initialValue);
  const [status, setStatus] = useState('');
  const localKey = `jackyun_settings_${sectionKey}`;
  useEffect(() => {
    const initialValue = initialRef.current;
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
        return;
      }
    } catch {}
    if (signedIn) queueMicrotask(() => setValue(initialValue));
  }, [localKey, sectionKey, signedIn]);

  function applySavedAppearance() {
    if (sectionKey !== 'appearance_preferences') return;
    const theme = value.theme === 'gray' || value.theme === 'dark' ? value.theme : 'light';
    const showFullscreen = value.showFullscreen !== false;
    localStorage.setItem('jackyun_theme', theme);
    localStorage.setItem('show_fullscreen_btn', String(showFullscreen));
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-density', value.density === 'compact' ? 'compact' : 'comfortable');
    document.documentElement.setAttribute('data-reduced-motion', value.reducedMotion === true ? 'true' : 'false');
    document.documentElement.dataset.dialogMotion = value.dialogAnimations === true ? 'true' : 'false';
    document.documentElement.style.setProperty('color-scheme', theme === 'light' ? 'light' : 'dark');
    document.querySelectorAll('iframe').forEach((frame) => frame.contentWindow?.postMessage({ type: 'jackyun-theme', theme }, '*'));
    window.dispatchEvent(new StorageEvent('storage', { key: 'show_fullscreen_btn', newValue: String(showFullscreen) }));
  }
  useEffect(() => {
    const acknowledged = () => {
      try { if (savedRef.current && !JSON.parse(localStorage.getItem(SETTINGS_PENDING_KEY) || '{}')[owner]?.[sectionKey]) setStatus('已保存到云端'); } catch {}
    };
    window.addEventListener('jackyun-settings-acknowledged', acknowledged);
    return () => window.removeEventListener('jackyun-settings-acknowledged', acknowledged);
  }, [sectionKey, owner]);
  function save() {
    if (!dirtyFields.current.size) { setStatus('设置没有修改'); return; }
    let stored: Record<string, unknown> = {};
    try { stored = JSON.parse(localStorage.getItem(localKey) || '{}'); } catch {}
    const changes = Object.fromEntries([...dirtyFields.current].map(key => [key, value[key]]));
    const next = { ...value, ...stored, ...changes };
    for (const field of fields) if (field.type === 'number') {
      const number = Number(next[field.key]);
      if (!Number.isFinite(number) || number < (field.min ?? -Infinity) || number > (field.max ?? Infinity)) { setStatus(`${field.label}请输入 ${field.min}～${field.max} 之间的数字`); return; }
    }
    try {
      localStorage.setItem(localKey, JSON.stringify(next));
      const pending = JSON.parse(localStorage.getItem(SETTINGS_PENDING_KEY) || '{}');
      const previous = pending[owner]?.[sectionKey] ? JSON.parse(pending[owner][sectionKey]) : null;
      const fieldKeys = [...new Set([...(previous?.fields || []), ...dirtyFields.current])];
      pending[owner] = { ...pending[owner], [sectionKey]: JSON.stringify({ value: next, fields: fieldKeys }) };
      localStorage.setItem(SETTINGS_PENDING_KEY, JSON.stringify(pending));
    } catch { setStatus('本机存储不可用，设置未保存，请释放空间后重试'); return; }
    dirtyFields.current.clear();
    savedRef.current = true;
    applySavedAppearance();
    if (sectionKey === 'learning_preferences') window.dispatchEvent(new Event('jackyun-learning-preferences'));
    setStatus(signedIn ? '已保存到本机，等待云端确认；断线后自动重试' : '已保存到本机；登录后自动同步');
    window.dispatchEvent(new Event(PREFERENCES_CHANGED));
  }
  return <div className="space-y-1">
    {quickSets.length > 0 && <div className="flex flex-wrap items-center gap-2 border-b border-[var(--card-border)] py-3"><span className="text-sm text-[var(--muted-foreground)]">快速设置</span>{quickSets.map((item) => <button key={item.label} type="button" onClick={() => applyQuickSet(item.values)} className="min-h-10 rounded-lg border border-[var(--card-border)] px-3 text-sm">{item.label}</button>)}</div>}
    {fields.map((field) => <label key={field.key} className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--card-border)] py-4 last:border-0"><span className="min-w-0 flex-1 basis-48"><strong className="block text-sm font-medium">{field.label}</strong><small className="mt-1 block leading-5 text-[var(--muted-foreground)]">{field.description}</small></span>{field.type === 'boolean' ? <input type="checkbox" checked={value[field.key] === true} onChange={(event) => update(field.key, event.target.checked)} className="h-5 w-5 shrink-0" /> : field.type === 'number' ? <input type="number" min={field.min} max={field.max} value={Number(value[field.key] ?? field.min ?? 0)} onChange={(event) => update(field.key, Number(event.target.value))} className="w-24 rounded-lg border border-[var(--card-border)] bg-[var(--background)] p-2" /> : <select value={String(value[field.key] ?? field.options?.[0]?.value ?? '')} onChange={(event) => update(field.key, event.target.value)} className="min-h-11 w-full sm:w-44 rounded-lg border border-[var(--card-border)] bg-[var(--background)] p-2">{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>}</label>)}
    <div className="flex flex-wrap items-center gap-3 pt-4"><button type="button" onClick={save} className="rounded-xl bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white dark:text-[#202124]">保存设置</button>{status && <span className="text-xs text-[var(--muted-foreground)]">{status}</span>}</div>
  </div>;
}
