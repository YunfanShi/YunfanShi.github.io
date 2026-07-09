'use client';

import { User } from '@supabase/supabase-js';
import UserAvatar from '@/components/auth/user-avatar';
import { signOut } from '@/actions/auth';
import { useState, useEffect } from 'react';

interface TopbarProps {
  user: User | null;
}

const showFullscreenDefault = typeof window !== 'undefined' ? localStorage.getItem('show_fullscreen_btn') === 'true' : false;

export default function Topbar({ user }: TopbarProps) {
  const [showFullscreen, setShowFullscreen] = useState(showFullscreenDefault);
  const [isFullscreen, setIsFullscreen] = useState(false);

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
        JackYun Portal
      </div>
      <div className="flex items-center gap-4">
        {showFullscreen && (
          <button
            onClick={toggleFullscreen}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title={isFullscreen ? '退出全屏' : '全屏模式'}
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
                <span className="hidden sm:inline">退出</span>
              </button>
            </form>
          </>
        ) : (
          <a
            href="/login"
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <span className="material-icons-round text-lg">account_circle</span>
            <span className="hidden sm:inline">登录 / 注册</span>
          </a>
        )}
      </div>
    </header>
  );
}