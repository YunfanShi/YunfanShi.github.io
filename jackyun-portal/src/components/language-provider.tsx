'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { type Language, getStoredLanguage, storeLanguage, STORAGE_KEY, DEFAULT_LANGUAGE } from '@/lib/i18n';

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

export default function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Language>(DEFAULT_LANGUAGE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Read from localStorage on mount
    const stored = getStoredLanguage();
    setLang(stored);
    setHydrated(true);
  }, []);

  const setLanguage = useCallback((newLang: Language) => {
    setLang(newLang);
    storeLanguage(newLang);
  }, []);

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

  if (!hydrated) {
    // Prevent flash of wrong language, render children with default
    // (hydration will correct it instantly in the next tick)
    return <>{children}</>;
  }

  return (
    <LanguageContext.Provider value={{ lang, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}