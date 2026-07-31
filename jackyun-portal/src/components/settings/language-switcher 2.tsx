'use client';

import { useLanguage } from '@/components/language-provider';
import { t } from '@/lib/i18n';
import { useState } from 'react';

export default function LanguageSwitcher() {
  const { lang, setLanguage } = useLanguage();
  const [flash, setFlash] = useState(false);

  const handleSwitch = (newLang: 'zh' | 'en') => {
    if (newLang === lang) return;
    setLanguage(newLang);
    setFlash(true);
    setTimeout(() => setFlash(false), 2000);
  };

  return (
    <section className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="material-icons-round text-[var(--muted-foreground)] text-lg">language</span>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
          {t('language.title', lang)}
        </h2>
      </div>

      <p className="text-sm text-[var(--muted-foreground)] mb-4">
        {t('language.current', lang)}：<span className="font-medium text-[var(--foreground)]">{lang === 'zh' ? '中文' : 'English'}</span>
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => handleSwitch('zh')}
          className={`flex-1 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all ${
            lang === 'zh'
              ? 'border-[#4285F4] bg-[#4285F4]/10 text-[#4285F4]'
              : 'border-[var(--card-border)] text-[var(--foreground)] hover:border-[#4285F4]/30'
          }`}
        >
          🇨🇳 中文
        </button>
        <button
          type="button"
          onClick={() => handleSwitch('en')}
          className={`flex-1 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all ${
            lang === 'en'
              ? 'border-[#4285F4] bg-[#4285F4]/10 text-[#4285F4]'
              : 'border-[var(--card-border)] text-[var(--foreground)] hover:border-[#4285F4]/30'
          }`}
        >
          🇬🇧 English
        </button>
      </div>

      {flash && (
        <p className="mt-3 text-xs text-[#34A853] transition-opacity">
          {t('language.changed', lang)}{lang === 'zh' ? '中文' : 'English'} ✓
        </p>
      )}
    </section>
  );
}