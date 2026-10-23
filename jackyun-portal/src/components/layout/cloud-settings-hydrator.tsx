'use client';

import { useEffect } from 'react';

const LOCAL_KEY = 'jackyun_settings_appearance_preferences';
const LOCAL_UPDATED_KEY = `${LOCAL_KEY}__updated_at`;

export default function CloudSettingsHydrator({ appearance, interfaceCustomization = {}, learning = {}, learningUpdatedAt, updatedAt, signedIn }: { learning?: Record<string, unknown>; learningUpdatedAt?: string | null; appearance: Record<string, unknown>; interfaceCustomization?: Record<string, unknown>; updatedAt: string | null; signedIn: boolean }) {
  useEffect(() => {
    if (!signedIn || !Object.keys(learning).length) return;
    const key = 'jackyun_settings_learning_preferences';
    try {
      const local = localStorage.getItem(key);
      // Bootstrap only missing data. Versioned sync owns later reconciliation;
      // neither a server render nor a device clock may overwrite local edits.
      if (local === null) {
        localStorage.setItem(key, JSON.stringify(learning));
        if (learningUpdatedAt) localStorage.setItem(`${key}__updated_at`, learningUpdatedAt);
      }
      window.dispatchEvent(new Event('jackyun-learning-preferences'));
    } catch {}
  }, [learning, learningUpdatedAt, signedIn]);
  useEffect(() => {
    let resolved = appearance;
    try {
      const localRaw = localStorage.getItem(LOCAL_KEY);
      if (localRaw !== null) {
        const parsed = JSON.parse(localRaw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) resolved = { ...appearance, ...parsed };
      } else {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(appearance));
        if (updatedAt) localStorage.setItem(LOCAL_UPDATED_KEY, updatedAt);
      }
    } catch {}
    document.documentElement.dataset.dialogMotion = resolved.dialogAnimations === true ? 'true' : 'false';
    if (!signedIn || Object.keys(appearance).length === 0) return;
    const theme = resolved.theme === 'gray' || resolved.theme === 'dark' ? resolved.theme : 'light';
    localStorage.setItem('jackyun_theme', theme);
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme === 'light' ? 'light' : 'dark';
    const showFullscreen = resolved.showFullscreen !== false;
    localStorage.setItem('show_fullscreen_btn', String(showFullscreen));
    window.dispatchEvent(new StorageEvent('storage', { key: 'show_fullscreen_btn', newValue: String(showFullscreen) }));
    document.documentElement.dataset.density = resolved.density === 'compact' ? 'compact' : 'comfortable';
    document.documentElement.dataset.reducedMotion = resolved.reducedMotion === true ? 'true' : 'false';
    if (Object.keys(interfaceCustomization).length) {
      let customization=interfaceCustomization;
      try { const raw=localStorage.getItem('jackyun_interface_customization');if(raw!==null) customization=JSON.parse(raw); } catch { return; }
      const accent = ['green', 'purple', 'orange'].includes(String(customization?.accent)) ? String(customization.accent) : 'blue';
      const cornerStyle = customization?.cornerStyle === 'soft' ? 'soft' : 'rounded';
      document.documentElement.dataset.accent = accent;
      document.documentElement.dataset.cornerStyle = cornerStyle;
      if(localStorage.getItem('jackyun_interface_customization')===null)localStorage.setItem('jackyun_interface_customization', JSON.stringify({ accent, cornerStyle }));
      localStorage.removeItem('jackyun_hide_homepage_ai');
    }
  }, [appearance, interfaceCustomization, signedIn, updatedAt]);
  return null;
}
