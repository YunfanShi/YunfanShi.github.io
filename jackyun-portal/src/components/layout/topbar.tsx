'use client';

import { User } from '@supabase/supabase-js';
import UserAvatar from '@/components/auth/user-avatar';
import { signOut } from '@/actions/auth';
import { useState, useEffect } from 'react';
import { useLanguage } from '@/components/language-provider';
import { t } from '@/lib/i18n';

interface TopbarProps {
  user: User | null;
}

const showFullscreenDefault = typeof window !== 'undefined' ? localStorage.getItem('show_fullscreen_btn') === 'true' : false;

export default function Topbar({ user }: TopbarProps) {
  const { lang } = useLanguage();
  const [showFullscreen, setShowFullscreen] = useState(showFullscreenDefault);
  const [isFullscreen, setIsFullscreen] = useState(false);

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
    <header className="flex h-14 items-center justify-between border-b border-[var(--sidebar-border)] bg-[var(--card)] px-6">
      <div className="text-base font-medium text-[var(--foreground)]">
        {t('topbar.brand', lang)}
      </div>
      <div className="flex items-center gap-4">
        {showFullscreen && (
          <button
            onClick={toggleFullscreen}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title={isFullscreen ? t('topbar.exit-fullscreen', lang) : t('topbar.fullscreen', lang)}
          >
            <span className="material-icons-round text-lg">
              {isFullscreen ? 'fullscreen_exit' : 'fullscreen'}
            </span>
          </button>
        )}
        {user ? (
          <>
            <UserAvatar user={user} />
            <form action={signOut}>
              <button
                type="submit"
                className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <span className="material-icons-round text-lg">logout</span>
                <span className="hidden sm:inline">{t('topbar.logout', lang)}</span>
              </button>
            </form>
          </>
        ) : (
          <a
            href="/login"
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <span className="material-icons-round text-lg">account_circle</span>
            <span className="hidden sm:inline">{t('topbar.login', lang)}</span>
          </a>
        )}
      </div>
    </header>
  );
}