'use client';

import { useEffect } from 'react';

const LOCAL_KEY = 'jackyun_settings_appearance_preferences';
const LOCAL_UPDATED_KEY = `${LOCAL_KEY}__updated_at`;

export default function CloudSettingsHydrator({ appearance, updatedAt, signedIn }: { appearance: Record<string, unknown>; updatedAt: string | null; signedIn: boolean }) {
  useEffect(() => {
    if (!signedIn || Object.keys(appearance).length === 0) return;
    let resolved = appearance;
    try {
      const localRaw = localStorage.getItem(LOCAL_KEY);
      const localUpdatedAt = localStorage.getItem(LOCAL_UPDATED_KEY);
      let localTime = localUpdatedAt ? Date.parse(localUpdatedAt) : 0;
      if (localRaw && (!localUpdatedAt || !Number.isFinite(localTime))) {
        const migratedAt = new Date().toISOString();
        localStorage.setItem(LOCAL_UPDATED_KEY, migratedAt);
        localTime = Date.parse(migratedAt);
      }
      const cloudTime = updatedAt ? Date.parse(updatedAt) : 0;
      if (localRaw && localTime > cloudTime) {
        const parsed = JSON.parse(localRaw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) resolved = { ...appearance, ...parsed };
      } else {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(appearance));
        if (updatedAt) localStorage.setItem(LOCAL_UPDATED_KEY, updatedAt);
      }
    } catch {}
    const theme = resolved.theme === 'gray' || resolved.theme === 'dark' ? resolved.theme : 'light';
    localStorage.setItem('jackyun_theme', theme);
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme === 'light' ? 'light' : 'dark';
    const showFullscreen = resolved.showFullscreen !== false;
    localStorage.setItem('show_fullscreen_btn', String(showFullscreen));
    window.dispatchEvent(new StorageEvent('storage', { key: 'show_fullscreen_btn', newValue: String(showFullscreen) }));
    document.documentElement.dataset.density = resolved.density === 'compact' ? 'compact' : 'comfortable';
    document.documentElement.dataset.reducedMotion = resolved.reducedMotion === true ? 'true' : 'false';
  }, [appearance, signedIn, updatedAt]);
  return null;
}
