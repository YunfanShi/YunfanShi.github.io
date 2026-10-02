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
      const timestamp = localStorage.getItem(`${key}__updated_at`);
      const localTime = timestamp ? Date.parse(timestamp) : 0;
      const cloudTime = learningUpdatedAt ? Date.parse(learningUpdatedAt) : 0;
      if (local && (!timestamp || !Number.isFinite(localTime))) {
        localStorage.setItem(`${key}__updated_at`, new Date().toISOString());
      } else if (!local || localTime <= cloudTime) {
        localStorage.setItem(key, JSON.stringify(learning));
        if (learningUpdatedAt) localStorage.setItem(`${key}__updated_at`, learningUpdatedAt);
      }
      window.dispatchEvent(new Event('jackyun-learning-preferences'));
    } catch {}
  }, [learning, learningUpdatedAt, signedIn]);
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
    if (Object.keys(interfaceCustomization).length) {
      const accent = ['green', 'purple', 'orange'].includes(String(interfaceCustomization.accent)) ? String(interfaceCustomization.accent) : 'blue';
      const cornerStyle = interfaceCustomization.cornerStyle === 'soft' ? 'soft' : 'rounded';
      document.documentElement.dataset.accent = accent;
      document.documentElement.dataset.cornerStyle = cornerStyle;
      localStorage.setItem('jackyun_interface_customization', JSON.stringify({ accent, cornerStyle }));
      localStorage.removeItem('jackyun_hide_homepage_ai');
    }
  }, [appearance, interfaceCustomization, signedIn, updatedAt]);
  return null;
}
