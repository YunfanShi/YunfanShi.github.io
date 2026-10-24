/* eslint-disable @next/next/no-html-link-for-pages -- These navigation controls deliberately reload the auth or embedded-document context. */
'use client';

import Link from 'next/link';
import FullscreenButton, { type FullscreenAction } from './fullscreen-button';
import UserAvatar from '@/components/auth/user-avatar';
import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { getDialogContainer } from '@/components/ui/dialog';
import { usePathname } from 'next/navigation';
import { NAVIGATION_ITEMS, navigationIdFromPath } from '@/lib/navigation';
import { useLanguage } from '@/components/language-provider';
import { saveSettingsField } from '@/actions/settings';
import { t } from '@/lib/i18n';
import NotificationInbox from '@/components/modules/notification-inbox';
import SyncStatusIndicator from '@/components/layout/sync-status-indicator';
import OfflineQueueStatus from '@/components/layout/offline-queue-status';
import GlobalSearch, { OPEN_GLOBAL_SEARCH_EVENT } from '@/components/layout/global-search';
import { APP_VERSION } from '@/lib/utils';
import LogoutButton from '@/components/auth/logout-button';

interface TopbarProps {
  user: {
    id: string;
    email?: string;
    user_metadata: Record<string, unknown>;
  } | null;
  betaActive?: boolean;
  isAdmin?: boolean;
}

type Theme = 'light' | 'gray' | 'dark';

const THEME_META: Record<Theme, { next: Theme; label: string; icon: string }> = {
  light: { next: 'gray', label: '切换到灰色主题', icon: 'contrast' },
  gray: { next: 'dark', label: '切换到黑色主题', icon: 'dark_mode' },
  dark: { next: 'light', label: '切换到亮色主题', icon: 'light_mode' },
};

export default function Topbar({ user, betaActive = false, isAdmin = false }: TopbarProps) {
  const { lang } = useLanguage();
  const pathname = usePathname();
  const currentItem = NAVIGATION_ITEMS.find((item) => item.id === navigationIdFromPath(pathname));
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(true);
  const [theme, setTheme] = useState<Theme>('light');
  const [moreOpen, setMoreOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const fullscreenAction = useRef<FullscreenAction>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const listener = (event: Event) => setNavigationOpen(Boolean((event as CustomEvent<{ open: boolean }>).detail.open));
    window.addEventListener('mobile-sidebar-state', listener);
    return () => window.removeEventListener('mobile-sidebar-state', listener);
  }, []);

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
    const update = () => {
      const current = document.documentElement.dataset.theme;
      setTheme(current === 'gray' || current === 'dark' ? current : 'light');
    };
    queueMicrotask(update);
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const toggleTheme = () => {
    const current = document.documentElement.dataset.theme;
    const next = THEME_META[current === 'gray' || current === 'dark' ? current : 'light'].next;
    setTheme(next);
    try {
      localStorage.setItem('jackyun_theme', next);
      const key = 'jackyun_settings_appearance_preferences';
      const saved = JSON.parse(localStorage.getItem(key) || '{}') as Record<string, unknown>;
      localStorage.setItem(key, JSON.stringify({ ...saved, theme: next }));
      localStorage.setItem(`${key}__updated_at`, new Date().toISOString());
    } catch {}
    if (user) void saveSettingsField('appearance_preferences', 'theme', next);
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next === 'light' ? 'light' : 'dark';
    document.querySelectorAll('iframe').forEach((frame) => {
      frame.contentWindow?.postMessage({ type: 'jackyun-theme', theme: next }, '*');
    });
  };

  return (
    <header className="flex min-h-16 shrink-0 items-center justify-between gap-1 border-b border-[var(--sidebar-border)] bg-[var(--card)] px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:gap-2 sm:px-6 lg:h-16 lg:py-0">
      <div className="flex min-w-0 items-center gap-1.5 sm:gap-3">
        <Button
          variant="ghost" size="icon"
          className="portal-touch-menu grid h-11 w-11 shrink-0 place-items-center rounded-lg text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)] lg:hidden"
          aria-label="打开导航菜单"
          aria-controls="portal-navigation"
          aria-expanded={navigationOpen}
          onClick={() => window.dispatchEvent(new Event('toggle-mobile-sidebar'))}
        >
          <span className="material-icons-round" aria-hidden="true">menu</span>
        </Button>
        <span className="truncate text-sm font-semibold lg:hidden">{currentItem ? t(currentItem.labelKey, lang) : 'JackYun'}</span>
        <div className="hidden min-w-0 lg:block">
          <p className="hidden text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)] sm:block">JackYun Workspace</p>
          <div className="mt-0.5 text-base font-medium text-[var(--foreground)]">
            {t('topbar.brand', lang)}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 sm:gap-2">
        <Button type="button" variant="ghost" size="icon" aria-label={lang === 'zh' ? '全站搜索' : 'Search everywhere'} title={lang === 'zh' ? '搜索页面、任务和错题（Ctrl K）' : 'Search pages, tasks, and reviews (Ctrl K)'} onClick={() => window.dispatchEvent(new Event(OPEN_GLOBAL_SEARCH_EVENT))}>
          <span aria-hidden="true" className="material-icons-round text-lg">search</span>
        </Button>
        <OfflineQueueStatus userId={user?.id ?? null} />
        {betaActive && (
          <Link href="/beta" prefetch={false} className="hidden rounded-full bg-[#7f56d9] px-2.5 py-1 text-[10px] font-bold tracking-wide text-white shadow-sm transition hover:bg-[#6941c6] lg:inline-flex sm:text-xs" title="打开 BETA 测试中心">
            BETA v{APP_VERSION}
          </Link>
        )}
        <SyncStatusIndicator signedIn={Boolean(user)} />
        <div className="portal-desktop-actions hidden lg:flex items-center gap-2"><Button
          variant="ghost" size="icon"
          onClick={toggleTheme}

          title={THEME_META[theme].label}
          aria-label={THEME_META[theme].label}
        >
          <span className="material-icons-round text-lg" aria-hidden="true">{THEME_META[theme].icon}</span>
        </Button>
        {showFullscreen && <FullscreenButton />}
        </div>
        {user && <NotificationInbox key={user.id} />}
        <div className="portal-touch-actions lg:hidden">
          <DropdownMenu open={moreOpen} onOpenChange={setMoreOpen}>
            <DropdownMenuTrigger asChild><Button ref={moreRef} variant="ghost" size="icon" aria-label="更多页面操作" onPointerDown={event => setPortalContainer(getDialogContainer(event.currentTarget))} onKeyDown={event => setPortalContainer(getDialogContainer(event.currentTarget))}><span aria-hidden="true" className="material-icons-round">more_horiz</span></Button></DropdownMenuTrigger>
            <DropdownMenuContent portalContainer={portalContainer} align="end" onCloseAutoFocus={event => { if (logoutOpen || document.querySelector('[data-ui-dialog][data-state="open"]')) event.preventDefault(); }}>
              <DropdownMenuItem onSelect={() => window.location.reload()}>{lang === 'en' ? 'Refresh page' : '刷新网页'}</DropdownMenuItem>
              <DropdownMenuItem onSelect={toggleTheme}>{THEME_META[theme].label}</DropdownMenuItem>
              {showFullscreen && <DropdownMenuItem onSelect={() => { if (moreRef.current) fullscreenAction.current?.toggle(moreRef.current); }}>全屏</DropdownMenuItem>}
              {betaActive && <DropdownMenuItem asChild><Link href="/beta" prefetch={false}>BETA 测试中心</Link></DropdownMenuItem>}
              {user && <><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => setLogoutOpen(true)}>{t('topbar.logout', lang)}</DropdownMenuItem></>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {showFullscreen && <FullscreenButton hideTrigger actionRef={fullscreenAction} restoreFocusTo={moreRef} />}
        {user ? (
          <>
            <UserAvatar user={user} />
            <div className="hidden lg:block"><LogoutButton open={logoutOpen} onOpenChange={setLogoutOpen} restoreFocusTo={moreRef} portalContainer={portalContainer} /></div>
          </>
        ) : (
          <Button asChild variant="ghost" className="p-2"><a
            href="/login" aria-label="登录并同步"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-sm text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)] sm:h-9 sm:w-auto sm:gap-1 sm:px-3"
          >
            <span className="material-icons-round text-lg">account_circle</span>
            <span className="hidden sm:inline">登录并同步</span>
          </a></Button>
        )}
      </div>
      <GlobalSearch userId={user?.id ?? null} betaActive={betaActive} isAdmin={isAdmin} />
    </header>
  );
}
