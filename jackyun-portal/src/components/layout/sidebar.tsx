'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import type { SidebarPreferences } from '@/actions/settings';
import { saveSidebarPreferences } from '@/actions/settings';

const ALL_NAV_ITEMS = [
  { label: 'Dashboard', icon: 'dashboard', href: '/dashboard' },
  { label: '日程中心', icon: 'calendar_month', href: '/control' },
  { label: '学习计划', icon: 'school', href: '/study' },
  { label: '词汇宝库', icon: 'menu_book', href: '/vocab' },
  // Music pair
  { id: 'music-player', label: '音乐播放器', icon: 'music_note', href: '/music', group: 'music' as const, mode: 'player' as const },
  { id: 'music-sync', label: '同步音乐', icon: 'sync_alt', href: '/music-sync', group: 'music' as const, mode: 'sync' as const },
  { label: 'B站同步', icon: 'smart_display', href: '/bilibili-sync' },
  { label: '诗词天地', icon: 'auto_stories', href: '/poem' },
  { label: '倒计时', icon: 'timer', href: '/countdown' },
  { label: '放松一下', icon: 'sports_esports', href: '/relax' },
  { label: '控制中心', icon: 'tune', href: '/timetable-hub' },
  // Answer sheet pair
  { id: 'answer-sheet', label: '答题卡', icon: 'content_paste', href: '/answer-sheet', group: 'answerSheet' as const, mode: 'standard' as const },
  { id: 'answer-sheet-sync', label: '同步答题卡', icon: 'sync', href: '/answer-sheet-sync', group: 'answerSheet' as const, mode: 'sync' as const },
  { label: '计划显示器', icon: 'flag', href: '/goal' },
  { label: '考试倒计时', icon: 'hourglass_empty', href: '/igcountdown' },
  { label: 'Mock 刷题', icon: 'quiz', href: '/mock-portal' },
  { label: 'QuizWise 刷题', icon: 'psychology', href: '/quiz' },
  { label: 'Markdown → Word', icon: 'description', href: '/md2word' },
  { label: '工具箱', icon: 'build', href: '/tools' },
  { label: '设置', icon: 'settings', href: '/settings' },
];

const ADMIN_ITEM = { label: '管理员', icon: 'admin_panel_settings', href: '/admin' };

interface NavItem {
  id?: string;
  label: string;
  icon: string;
  href: string;
  group?: 'music' | 'answerSheet';
  mode?: 'player' | 'sync' | 'standard';
}

interface Props {
  initialPrefs: SidebarPreferences;
}

export default function Sidebar({ initialPrefs }: Props) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [prefs, setPrefs] = useState<SidebarPreferences>(initialPrefs);
  const [showFirstTimeDialog, setShowFirstTimeDialog] = useState(false);

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
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
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
                {!collapsed && <span>{item.label}</span>}
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 rounded-[16px] border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-2xl animate-scale-in">
        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-1">
          欢迎使用 JackYun Portal
        </h2>
        <p className="text-sm text-[var(--muted-foreground)] mb-5">
          请选择你偏好的模块版本，之后可以在设置中随时更改。
        </p>

        {/* Music module selection */}
        <div className="mb-5">
          <p className="text-sm font-medium text-[var(--foreground)] mb-2">🎵 音乐模块</p>
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
              音乐播放器
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
              同步音乐
            </button>
          </div>
        </div>

        {/* Answer sheet module selection */}
        <div className="mb-6">
          <p className="text-sm font-medium text-[var(--foreground)] mb-2">📝 答题卡模块</p>
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
              答题卡
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
              同步答题卡
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSkip}
            className="flex-1 px-4 py-2 rounded-lg border border-[var(--card-border)] text-sm font-medium text-[var(--muted-foreground)] hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            跳过
          </button>
          <button
            type="button"
            onClick={() => onSave(musicMode, answerSheetMode)}
            className="flex-1 px-4 py-2 rounded-lg bg-[#4285F4] text-white text-sm font-medium hover:bg-[#3367D6] transition-colors"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}