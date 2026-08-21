'use client';

import { useEffect } from 'react';

export default function CloudSettingsHydrator({ appearance, signedIn }: { appearance: Record<string, unknown>; signedIn: boolean }) {
  useEffect(() => {
    if (!signedIn || Object.keys(appearance).length === 0) return;
    const theme = appearance.theme === 'gray' || appearance.theme === 'dark' ? appearance.theme : 'light';
    localStorage.setItem('jackyun_theme', theme);
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme === 'light' ? 'light' : 'dark';
    const showFullscreen = appearance.showFullscreen === true;
    localStorage.setItem('show_fullscreen_btn', String(showFullscreen));
    window.dispatchEvent(new StorageEvent('storage', { key: 'show_fullscreen_btn', newValue: String(showFullscreen) }));
    document.documentElement.dataset.density = appearance.density === 'compact' ? 'compact' : 'comfortable';
    document.documentElement.dataset.reducedMotion = appearance.reducedMotion === true ? 'true' : 'false';
  }, [appearance, signedIn]);
  return null;
}
