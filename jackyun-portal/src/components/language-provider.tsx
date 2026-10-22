'use client';

import { createContext, startTransition, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { type Language, getStoredLanguage, storeLanguage, STORAGE_KEY, DEFAULT_LANGUAGE } from '@/lib/i18n';
import { saveLanguagePreference } from '@/actions/settings';

interface LanguageContextValue {
  lang: Language;
  setLanguage: (lang: Language) => void;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: DEFAULT_LANGUAGE,
  setLanguage: () => {},
});

export function useLanguage() {
  return useContext(LanguageContext);
}

export default function LanguageProvider({ children, initialLanguage = DEFAULT_LANGUAGE, signedIn = false }: { children: ReactNode; initialLanguage?: Language; signedIn?: boolean }) {
  const [lang, setLang] = useState<Language>(initialLanguage);

  useEffect(() => {
    // Keep the Provider mounted from SSR onward. Replacing a Fragment after
    // hydration would remount every page and discard in-flight UI state.
    let stored = initialLanguage;
    try { if (localStorage.getItem(STORAGE_KEY)) stored = getStoredLanguage(); } catch { /* Keep the server language when storage is blocked. */ }
    queueMicrotask(() => {
      startTransition(() => setLang(stored));
    });
  }, [initialLanguage]);

  const setLanguage = useCallback((newLang: Language) => {
    setLang(newLang);
    storeLanguage(newLang);
    document.documentElement.lang = newLang === 'en' ? 'en' : 'zh-CN';
    window.dispatchEvent(new CustomEvent('jackyun-language-change', { detail: { language: newLang } }));
    if (signedIn) void saveLanguagePreference(newLang);
  }, [signedIn]);

  // Listen for language changes from other tabs
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        const newLang = e.newValue as Language | null;
        if (newLang === 'zh' || newLang === 'en') {
          setLang(newLang);
        }
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  return (
    <LanguageContext.Provider value={{ lang, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}
