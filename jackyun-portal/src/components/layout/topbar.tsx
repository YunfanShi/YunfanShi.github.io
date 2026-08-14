'use client';

import { User } from '@supabase/supabase-js';
import UserAvatar from '@/components/auth/user-avatar';
import { signOut } from '@/actions/auth';
import { useState, useEffect } from 'react';
import { useLanguage } from '@/components/language-provider';
import { t } from '@/lib/i18n';
import NotificationInbox from '@/components/modules/notification-inbox';

interface TopbarProps {
  user: User | null;
}

type Theme = 'light' | 'gray' | 'dark';

const THEME_META: Record<Theme, { next: Theme; label: string; icon: string }> = {
  light: { next: 'gray', label: '切换到灰色主题', icon: 'contrast' },
  gray: { next: 'dark', label: '切换到黑色主题', icon: 'dark_mode' },
  dark: { next: 'light', label: '切换到亮色主题', icon: 'light_mode' },
};

const showFullscreenDefault = typeof window !== 'undefined' ? localStorage.getItem('show_fullscreen_btn') === 'true' : false;

export default function Topbar({ user }: TopbarProps) {
  const { lang } = useLanguage();
  const [showFullscreen, setShowFullscreen] = useState(showFullscreenDefault);
  const [isFullscreen, setIsFullscreen] = useState(false);
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
    const handler = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handler);

    // Listen for setting changes from other tabs
    const storageHandler = (e: StorageEvent) => {
      if (e.key === 'show_fullscreen_btn') {
        setShowFullscreen(e.newValue === 'true');
      }
    };
    window.addEventListener('storage', storageHandler);

    return () => {
      document.removeEventListener('fullscreenchange', handler);
      window.removeEventListener('storage', storageHandler);
    };
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('jackyun_theme');
      setTheme(saved === 'gray' || saved === 'dark' ? saved : 'light');
    } catch {}
  }, []);

  const toggleTheme = () => {
    const next = THEME_META[theme].next;
    setTheme(next);
    try { localStorage.setItem('jackyun_theme', next); } catch {}
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next === 'light' ? 'light' : 'dark';
    document.querySelectorAll('iframe').forEach((frame) => {
      frame.contentWindow?.postMessage({ type: 'jackyun-theme', theme: next }, '*');
    });
  };

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
      setIsFullscreen(true);
      // Collapse sidebar by dispatching a custom event
      window.dispatchEvent(new CustomEvent('toggle-sidebar-collapse', { detail: { collapsed: true } }));
    } else {
      await document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  return (
    <header className="flex h-16 items-center justify-between border-b border-[var(--sidebar-border)] bg-[var(--card)] px-4 sm:px-6">
      <div>
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">JackYun Workspace</p>
        <div className="mt-0.5 text-base font-medium text-[var(--foreground)]">
          {t('topbar.brand', lang)}
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={toggleTheme}
          className="flex h-9 items-center gap-1 rounded-lg px-3 text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[#f1f3f4] hover:text-[var(--foreground)] dark:hover:bg-[#3c4043]"
          title={THEME_META[theme].label}
          aria-label={THEME_META[theme].label}
        >
          <span className="material-icons-round text-lg">{THEME_META[theme].icon}</span>
        </button>
        {showFullscreen && (
          <button
            onClick={toggleFullscreen}
            className="flex h-9 items-center gap-1 rounded-lg px-3 text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[#f1f3f4] hover:text-[var(--foreground)] dark:hover:bg-[#3c4043]"
            title={isFullscreen ? t('topbar.exit-fullscreen', lang) : t('topbar.fullscreen', lang)}
          >
            <span className="material-icons-round text-lg">
              {isFullscreen ? 'fullscreen_exit' : 'fullscreen'}
            </span>
          </button>
        )}
        {user && <NotificationInbox />}
        {user ? (
          <>
            <UserAvatar user={user} />
            <form action={signOut}>
              <button
                type="submit"
                className="flex h-9 items-center gap-1 rounded-lg px-3 text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[#f1f3f4] hover:text-[var(--foreground)] dark:hover:bg-[#3c4043]"
              >
                <span className="material-icons-round text-lg">logout</span>
                <span className="hidden sm:inline">{t('topbar.logout', lang)}</span>
              </button>
            </form>
          </>
        ) : (
          <a
            href="/login"
            className="flex h-9 items-center gap-1 rounded-lg px-3 text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[#f1f3f4] hover:text-[var(--foreground)] dark:hover:bg-[#3c4043]"
          >
            <span className="material-icons-round text-lg">account_circle</span>
            <span className="hidden sm:inline">{t('topbar.login', lang)}</span>
          </a>
        )}
      </div>
    </header>
  );
}
