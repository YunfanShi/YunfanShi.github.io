/* eslint-disable @next/next/no-html-link-for-pages -- These navigation controls deliberately reload the auth or embedded-document context. */
'use client';

import Link from 'next/link';
import BrandLogo from '@/components/brand-logo';
import FullscreenButton from './fullscreen-button';
import UserAvatar from '@/components/auth/user-avatar';
import { useState, useEffect } from 'react';
import { useLanguage } from '@/components/language-provider';
import { saveSettingsField } from '@/actions/settings';
import { t } from '@/lib/i18n';
import NotificationInbox from '@/components/modules/notification-inbox';
import SyncStatusIndicator from '@/components/layout/sync-status-indicator';
import { APP_VERSION } from '@/lib/utils';
import LogoutButton from '@/components/auth/logout-button';

interface TopbarProps {
  user: {
    id: string;
    email?: string;
    user_metadata: Record<string, unknown>;
  } | null;
  betaActive?: boolean;
}

type Theme = 'light' | 'gray' | 'dark';

const THEME_META: Record<Theme, { next: Theme; label: string; icon: string }> = {
  light: { next: 'gray', label: '切换到灰色主题', icon: 'contrast' },
  gray: { next: 'dark', label: '切换到黑色主题', icon: 'dark_mode' },
  dark: { next: 'light', label: '切换到亮色主题', icon: 'light_mode' },
};

export default function Topbar({ user, betaActive = false }: TopbarProps) {
  const { lang } = useLanguage();
  const [showFullscreen, setShowFullscreen] = useState(true);
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    // Expose the signed-in user's display name to legacy (iframe) HTML pages
    // so they can replace any hardcoded names with the account name.
    if (user) {
      const displayName =
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.user_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined) ??
        (user.email?.split('@')[0] as string | undefined) ??
        'User';
      try {
        localStorage.setItem('jackyun_user_display_name', displayName);
      } catch {}
    }
  }, [user]);

  useEffect(() => {
    try { queueMicrotask(() => setShowFullscreen(localStorage.getItem('show_fullscreen_btn') !== 'false')); } catch {}

    // Listen for setting changes from other tabs
    const storageHandler = (e: StorageEvent) => {
      if (e.key === 'show_fullscreen_btn') {
        setShowFullscreen(e.newValue === 'true');
      }
    };
    window.addEventListener('storage', storageHandler);

    return () => {
      window.removeEventListener('storage', storageHandler);
    };
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('jackyun_theme');
      const localTheme = saved === 'gray' || saved === 'dark' ? saved : 'light';
      queueMicrotask(() => setTheme(localTheme));
    } catch {}
  }, [user]);

  const toggleTheme = () => {
    const next = THEME_META[theme].next;
    setTheme(next);
    try {
      localStorage.setItem('jackyun_theme', next);
      const key = 'jackyun_settings_appearance_preferences';
      const saved = JSON.parse(localStorage.getItem(key) || '{}') as Record<string, unknown>;
      localStorage.setItem(key, JSON.stringify({ ...saved, theme: next }));
      localStorage.setItem(`${key}__updated_at`, new Date().toISOString());
    } catch {}
    void saveSettingsField('appearance_preferences', 'theme', next);
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next === 'light' ? 'light' : 'dark';
    document.querySelectorAll('iframe').forEach((frame) => {
      frame.contentWindow?.postMessage({ type: 'jackyun-theme', theme: next }, '*');
    });
  };

  return (
    <header className="flex min-h-16 items-center justify-between gap-1 border-b border-[var(--sidebar-border)] bg-[var(--card)] px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:gap-2 sm:px-6 md:h-16 md:py-0">
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
        <button
          type="button"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-[var(--muted-foreground)] transition-colors hover:bg-[#f1f3f4] hover:text-[var(--foreground)] dark:hover:bg-[#3c4043] md:hidden"
          aria-label="打开导航菜单"
          aria-controls="portal-navigation"
          onClick={() => window.dispatchEvent(new Event('toggle-mobile-sidebar'))}
        >
          <span className="material-icons-round">menu</span>
        </button>
        <Link href="/dashboard" aria-label="JackYun 主页" className="grid h-11 w-8 shrink-0 place-items-center md:hidden"><BrandLogo size={32} className="h-8 w-8 shrink-0" priority /></Link>
        <div className="hidden min-w-0 md:block">
          <p className="hidden text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)] sm:block">JackYun Workspace</p>
          <div className="mt-0.5 text-base font-medium text-[var(--foreground)]">
            {t('topbar.brand', lang)}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 sm:gap-2">
        {betaActive && (
          <Link href="/beta" className="hidden rounded-full bg-[#7f56d9] px-2.5 py-1 text-[10px] font-bold tracking-wide text-white shadow-sm transition hover:bg-[#6941c6] md:inline-flex sm:text-xs" title="打开 BETA 测试中心">
            BETA v{APP_VERSION}
          </Link>
        )}
        <SyncStatusIndicator signedIn={Boolean(user)} />
        <div className="hidden md:flex items-center gap-2">        <button
          type="button"
          onClick={toggleTheme}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[#f1f3f4] hover:text-[var(--foreground)] dark:hover:bg-[#3c4043] sm:h-9 sm:w-auto sm:px-3"
          title={THEME_META[theme].label}
          aria-label={THEME_META[theme].label}
        >
          <span className="material-icons-round text-lg">{THEME_META[theme].icon}</span>
        </button>
        {showFullscreen && <FullscreenButton />}
        </div>
        {user && <NotificationInbox />}
        <button type="button" onClick={() => window.location.reload()} aria-label="刷新网页" title="刷新网页" className="grid h-11 w-11 place-items-center rounded-xl text-[var(--muted-foreground)] md:hidden"><span className="material-icons-round">refresh</span></button>
        <details className="relative md:hidden">
          <summary aria-label="更多页面操作" className="grid h-11 w-11 list-none place-items-center rounded-xl cursor-pointer"><span className="material-icons-round">more_horiz</span></summary>
          <div className="absolute right-0 top-12 z-50 flex min-w-48 flex-col gap-2 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-3 shadow-xl">
            <button type="button" onClick={toggleTheme} aria-label={THEME_META[theme].label} className="min-h-11 text-left px-3">{THEME_META[theme].label}</button>
            {showFullscreen && <FullscreenButton />}
            {betaActive && <Link href="/beta" className="min-h-11 px-3 py-3">BETA 测试中心</Link>}
            {user && <LogoutButton />}
          </div>
        </details>
        {user ? (
          <>
            <UserAvatar user={user} />
            <div className="hidden md:block"><LogoutButton /></div>
          </>
        ) : (
          <a
            href="/login"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[#f1f3f4] hover:text-[var(--foreground)] dark:hover:bg-[#3c4043] sm:h-9 sm:w-auto sm:gap-1 sm:px-3"
          >
            <span className="material-icons-round text-lg">account_circle</span>
            <span className="hidden sm:inline">登录并同步</span>
          </a>
        )}
      </div>
    </header>
  );
}
