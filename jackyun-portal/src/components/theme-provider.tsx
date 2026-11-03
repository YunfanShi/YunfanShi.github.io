'use client';
import { isRepositoryInitialized, workspaceStorage } from '@/lib/sync/repository';
import { CLOUD_STATE_APPLIED_EVENT } from '@/lib/local-workspace';


import { useEffect } from 'react';

const THEME_KEY = 'jackyun_theme';

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const applyTheme = () => {
      let saved: string | null = null;
      try { saved = isRepositoryInitialized() ? workspaceStorage.getItem(THEME_KEY) : localStorage.getItem(THEME_KEY); } catch {}
      const theme = saved === 'gray' || saved === 'dark' ? saved : 'light';
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme === 'light' ? 'light' : 'dark';
    };
    applyTheme();
    const onRepositoryChanged = (event: Event) => {
      const keys = (event as CustomEvent<{ keys?: string[] }>).detail?.keys;
      if (!keys || keys.includes(THEME_KEY)) applyTheme();
    };
    window.addEventListener(CLOUD_STATE_APPLIED_EVENT, onRepositoryChanged);
    return () => window.removeEventListener(CLOUD_STATE_APPLIED_EVENT, onRepositoryChanged);
  }, []);

  return children;
}
