'use client';

import { useLanguage } from '@/components/language-provider';
import { t } from '@/lib/i18n';
import { useState } from 'react';

export default function LanguageSwitcher() {
  const { lang, setLanguage } = useLanguage();
  const [showModal, setShowModal] = useState(false);

  const handleSwitch = (newLang: 'zh' | 'en') => {
    setLanguage(newLang);
    setShowModal(false);
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

      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--card-border)] text-sm font-medium text-[var(--foreground)] hover:bg-[#4285F4]/5 hover:border-[#4285F4]/30 transition-colors w-fit"
      >
        <span className="material-icons-round text-base text-[#4285F4]">translate</span>
        {t('language.switch-to', lang)} {lang === 'zh' ? 'English' : '中文'}
      </button>

      {/* Language selection modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" className="mx-4 max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-[16px] border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-2xl animate-scale-in sm:p-6">
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-1">
              {t('language.title', lang)}
            </h2>
            <p className="text-sm text-[var(--muted-foreground)] mb-5">
              {t('language.current', lang)}：<span className="font-medium">{lang === 'zh' ? '中文' : 'English'}</span>
            </p>

            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => handleSwitch('zh')}
                className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg border text-sm font-medium transition-all ${
                  lang === 'zh'
                    ? 'border-[#4285F4] bg-[#4285F4]/10 text-[#4285F4]'
                    : 'border-[var(--card-border)] text-[var(--foreground)] hover:border-[#4285F4]/30 hover:bg-[#4285F4]/5'
                }`}
              >
                <span className="text-xl">🇨🇳</span>
                <div className="text-left">
                  <p className="font-medium">中文</p>
                  <p className="text-xs text-[var(--muted-foreground)]">Chinese</p>
                </div>
                {lang === 'zh' && (
                  <span className="material-icons-round text-[#4285F4] ml-auto">check_circle</span>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleSwitch('en')}
                className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg border text-sm font-medium transition-all ${
                  lang === 'en'
                    ? 'border-[#4285F4] bg-[#4285F4]/10 text-[#4285F4]'
                    : 'border-[var(--card-border)] text-[var(--foreground)] hover:border-[#4285F4]/30 hover:bg-[#4285F4]/5'
                }`}
              >
                <span className="text-xl">🇬🇧</span>
                <div className="text-left">
                  <p className="font-medium">English</p>
                  <p className="text-xs text-[var(--muted-foreground)]">英文</p>
                </div>
                {lang === 'en' && (
                  <span className="material-icons-round text-[#4285F4] ml-auto">check_circle</span>
                )}
              </button>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-lg border border-[var(--card-border)] text-sm font-medium text-[var(--muted-foreground)] hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                {lang === 'zh' ? '取消' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
