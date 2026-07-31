'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import type { SidebarPreferences } from '@/actions/settings';
import { saveSidebarPreferences } from '@/actions/settings';
import { useLanguage } from '@/components/language-provider';
import { t } from '@/lib/i18n';

const ALL_NAV_ITEMS: { labelKey: string; icon: string; href: string; id?: string; group?: 'music' | 'answerSheet'; mode?: 'player' | 'sync' | 'standard' }[] = [
  { labelKey: 'nav.dashboard', icon: 'dashboard', href: '/dashboard' },
  { labelKey: 'nav.study-plan', icon: 'school', href: '/study' },
  // Goal 计划显示器：移到学习计划下面
  { labelKey: 'nav.goal', icon: 'flag', href: '/goal' },
  { labelKey: 'nav.study-guide', icon: 'auto_stories', href: '/study-guide' },
  { labelKey: 'nav.vocab', icon: 'menu_book', href: '/vocab' },
  // 时间管理：主页 + 3 个工具
  { labelKey: 'nav.time-management', icon: 'timer', href: '/time-management' },
  // Music pair
  { id: 'music-player', labelKey: 'nav.music-player', icon: 'music_note', href: '/music', group: 'music' as const, mode: 'player' as const },
  { id: 'music-sync', labelKey: 'nav.music-sync', icon: 'sync_alt', href: '/music-sync', group: 'music' as const, mode: 'sync' as const },
  { labelKey: 'nav.bilibili-sync', icon: 'smart_display', href: '/bilibili-sync' },
  { labelKey: 'nav.poem', icon: 'auto_stories', href: '/poem' },
  { labelKey: 'nav.relax', icon: 'sports_esports', href: '/relax' },
  { labelKey: 'nav.schedule', icon: 'calendar_month', href: '/control' },
  // Answer sheet pair
  { id: 'answer-sheet', labelKey: 'nav.answer-sheet', icon: 'content_paste', href: '/answer-sheet', group: 'answerSheet' as const, mode: 'standard' as const },
  { id: 'answer-sheet-sync', labelKey: 'nav.answer-sheet-sync', icon: 'sync', href: '/answer-sheet-sync', group: 'answerSheet' as const, mode: 'sync' as const },
  { labelKey: 'nav.mock', icon: 'quiz', href: '/mock-portal' },
  { labelKey: 'nav.quizwise', icon: 'psychology', href: '/quiz' },
  { labelKey: 'nav.md2word', icon: 'description', href: '/md2word' },
  { labelKey: 'nav.tools', icon: 'build', href: '/tools' },
  { labelKey: 'nav.settings', icon: 'settings', href: '/settings' },
  { labelKey: 'nav.update', icon: 'history', href: '/update' },
];

const ADMIN_ITEM = { labelKey: 'nav.admin', icon: 'admin_panel_settings', href: '/admin' };

const TIMESTAMPS_KEY = 'jackyun_nav_timestamps';

interface NavItem {
  id?: string;
  labelKey: string;
  icon: string;
  href: string;
  group?: 'music' | 'answerSheet';
  mode?: 'player' | 'sync' | 'standard';
}

interface Props {
  initialPrefs: SidebarPreferences;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86400000);

  const pad = (n: number) => String(n).padStart(2, '0');
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;

  if (diffDays === 0) return time;
  if (diffDays === 1) return `昨天 ${time}`;
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${time}`;
}

export default function Sidebar({ initialPrefs }: Props) {
  const pathname = usePathname();
  const { lang } = useLanguage();
  const [collapsed, setCollapsed] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [prefs, setPrefs] = useState<SidebarPreferences>(initialPrefs);
  const [showFirstTimeDialog, setShowFirstTimeDialog] = useState(false);
  const [timestamps, setTimestamps] = useState<Record<string, string>>({});

  // Load timestamps and record current page visit
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(TIMESTAMPS_KEY);
      const data = raw ? JSON.parse(raw) : {};
      setTimestamps(data);
      // Record current page visit
      if (pathname) {
        const now = new Date().toISOString();
        const updated = { ...data, [pathname]: now };
        localStorage.setItem(TIMESTAMPS_KEY, JSON.stringify(updated));
        setTimestamps(updated);
      }
    } catch (e) {
      // ignore
    }
  }, [pathname]);

  // Detect first-time user: if prefs match defaults exactly, they haven't configured yet
  useEffect(() => {
    // We check if the user has ever saved preferences by seeing if initialPrefs came from DB.
    // Since getSidebarPreferences returns defaults when no data, we treat that as first-time.
    // A simple heuristic: store a flag in sessionStorage to not show repeatedly.
    const dismissed = sessionStorage.getItem('sidebar-prefs-dismissed');
    if (!dismissed && initialPrefs.musicMode === 'player' && initialPrefs.answerSheetMode === 'standard') {
      setShowFirstTimeDialog(true);
    }
  }, [initialPrefs]);

  useEffect(() => {
    // Listen for fullscreen collapse from topbar
    const handleCollapse = (e: CustomEvent) => {
      if (e.detail?.collapsed === true) {
        setCollapsed(true);
      }
    };
    window.addEventListener('toggle-sidebar-collapse', handleCollapse as EventListener);

    return () => {
      window.removeEventListener('toggle-sidebar-collapse', handleCollapse as EventListener);
    };
  }, []);

  // Separate effect for admin check
  useEffect(() => {
    fetch('/api/llm-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _get_config_only: true, _check_admin: true }),
    })
      .then(res => res.json().then(data => setIsAdmin(!!data.isAdmin)).catch(() => setIsAdmin(false)))
      .catch(() => setIsAdmin(false));
  }, []);

  // Filter nav items based on preferences
  const filterItems = (items: NavItem[]): NavItem[] => {
    return items.filter((item) => {
      if (item.group === 'music') {
        return item.mode === prefs.musicMode;
      }
      if (item.group === 'answerSheet') {
        return item.mode === prefs.answerSheetMode;
      }
      return true;
    });
  };

  const displayItems = filterItems(isAdmin ? [...ALL_NAV_ITEMS, ADMIN_ITEM] : ALL_NAV_ITEMS);

  const handleFirstTimeSave = async (musicMode: 'player' | 'sync', answerSheetMode: 'standard' | 'sync') => {
    const newPrefs: SidebarPreferences = { musicMode, answerSheetMode };
    setPrefs(newPrefs);
    setShowFirstTimeDialog(false);
    sessionStorage.setItem('sidebar-prefs-dismissed', 'true');
    // Fire and forget - save to server
    await saveSidebarPreferences(newPrefs);
  };

  return (
    <>
      <aside
        className={`flex flex-col border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] transition-all duration-200 ${
          collapsed ? 'w-16' : 'w-60'
        }`}
      >
        {/* Header */}
        <div className="flex h-14 items-center justify-between px-4 border-b border-[var(--sidebar-border)] flex-shrink-0">
          {!collapsed && (
            <span className="text-base font-semibold text-[var(--foreground)]">
              JackYun
            </span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ml-auto"
            aria-label="Toggle sidebar"
          >
            <span className="material-icons-round text-xl text-[var(--muted-foreground)]">
              {collapsed ? 'menu_open' : 'menu'}
            </span>
          </button>
        </div>

        {/* Nav items - scrollable with hidden scrollbar */}
        <nav
          className="flex-1 overflow-y-auto py-4 space-y-1 px-2
            [&::-webkit-scrollbar]:hidden
            [-ms-overflow-style:none]
            [scrollbar-width:none]"
        >
          {displayItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            const ts = timestamps[item.href];
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-[#4285F4]/10 text-[#4285F4]'
                    : 'text-[var(--foreground)] hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <span
                  className={`material-icons-round text-xl flex-shrink-0 ${
                    isActive ? 'text-[#4285F4]' : 'text-[var(--muted-foreground)]'
                  }`}
                >
                  {item.icon}
                </span>
                {!collapsed && (
                  <span className="flex-1 min-w-0">
                    <span className="block truncate">{t(item.labelKey, lang)}</span>
                    {ts && (
                      <span className="block text-[10px] leading-tight text-[var(--muted-foreground)] opacity-70 group-hover:opacity-100 transition-opacity">
                        {formatTimestamp(ts)}
                      </span>
                    )}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* First-time setup dialog */}
      {showFirstTimeDialog && (
        <FirstTimeDialog onSave={handleFirstTimeSave} onSkip={() => {
          setShowFirstTimeDialog(false);
          sessionStorage.setItem('sidebar-prefs-dismissed', 'true');
        }} />
      )}
    </>
  );
}

function FirstTimeDialog({
  onSave,
  onSkip,
}: {
  onSave: (musicMode: 'player' | 'sync', answerSheetMode: 'standard' | 'sync') => void;
  onSkip: () => void;
}) {
  const [musicMode, setMusicMode] = useState<'player' | 'sync'>('player');
  const [answerSheetMode, setAnswerSheetMode] = useState<'standard' | 'sync'>('standard');
  const { lang } = useLanguage();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 rounded-[16px] border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-2xl animate-scale-in">
        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-1">
          {t('sidebar.first-time.title', lang)}
        </h2>
        <p className="text-sm text-[var(--muted-foreground)] mb-5">
          {t('sidebar.first-time.desc', lang)}
        </p>

        {/* Music module selection */}
        <div className="mb-5">
          <p className="text-sm font-medium text-[var(--foreground)] mb-2">{t('sidebar.first-time.music', lang)}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMusicMode('player')}
              className={`flex-1 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                musicMode === 'player'
                  ? 'border-[#4285F4] bg-[#4285F4]/10 text-[#4285F4]'
                  : 'border-[var(--card-border)] text-[var(--foreground)] hover:border-[#4285F4]/30'
              }`}
            >
              {t('sidebar.first-time.player', lang)}
            </button>
            <button
              type="button"
              onClick={() => setMusicMode('sync')}
              className={`flex-1 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                musicMode === 'sync'
                  ? 'border-[#4285F4] bg-[#4285F4]/10 text-[#4285F4]'
                  : 'border-[var(--card-border)] text-[var(--foreground)] hover:border-[#4285F4]/30'
              }`}
            >
              {t('sidebar.first-time.sync', lang)}
            </button>
          </div>
        </div>

        {/* Answer sheet module selection */}
        <div className="mb-6">
          <p className="text-sm font-medium text-[var(--foreground)] mb-2">{t('sidebar.first-time.answer', lang)}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAnswerSheetMode('standard')}
              className={`flex-1 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                answerSheetMode === 'standard'
                  ? 'border-[#4285F4] bg-[#4285F4]/10 text-[#4285F4]'
                  : 'border-[var(--card-border)] text-[var(--foreground)] hover:border-[#4285F4]/30'
              }`}
            >
              {t('sidebar.first-time.standard', lang)}
            </button>
            <button
              type="button"
              onClick={() => setAnswerSheetMode('sync')}
              className={`flex-1 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                answerSheetMode === 'sync'
                  ? 'border-[#4285F4] bg-[#4285F4]/10 text-[#4285F4]'
                  : 'border-[var(--card-border)] text-[var(--foreground)] hover:border-[#4285F4]/30'
              }`}
            >
              {t('sidebar.first-time.answer-sync', lang)}
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSkip}
            className="flex-1 px-4 py-2 rounded-lg border border-[var(--card-border)] text-sm font-medium text-[var(--muted-foreground)] hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            {t('sidebar.first-time.skip', lang)}
          </button>
          <button
            type="button"
            onClick={() => onSave(musicMode, answerSheetMode)}
            className="flex-1 px-4 py-2 rounded-lg bg-[#4285F4] text-white text-sm font-medium hover:bg-[#3367D6] transition-colors"
          >
            {t('sidebar.first-time.confirm', lang)}
          </button>
        </div>
      </div>
    </div>
  );
}