'use client';
import { workspaceStorage } from '@/lib/sync/repository';


import { useEffect } from 'react';

const THEME_KEY = 'jackyun_theme';

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    let theme: 'light' | 'gray' | 'dark' = 'light';
    try {
      const saved = workspaceStorage.getItem(THEME_KEY);
      theme = saved === 'gray' || saved === 'dark' ? saved : 'light';
    } catch {}
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme === 'light' ? 'light' : 'dark';
  }, []);

  return children;
}
