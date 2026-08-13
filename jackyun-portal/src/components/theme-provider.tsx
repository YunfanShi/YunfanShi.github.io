'use client';

import { useEffect } from 'react';

const THEME_KEY = 'jackyun_theme';

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    let theme: 'light' | 'dark' = 'light';
    try {
      theme = localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
    } catch {}
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, []);

  return children;
}
