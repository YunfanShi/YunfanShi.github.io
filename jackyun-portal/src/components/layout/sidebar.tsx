'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const NAV_ITEMS = [
  { label: 'Dashboard', icon: 'dashboard', href: '/dashboard' },
  { label: '学习计划', icon: 'school', href: '/study' },
  { label: '词汇宝库', icon: 'menu_book', href: '/vocab' },
  { label: '音乐播放器', icon: 'music_note', href: '/music' },
  { label: '诗词天地', icon: 'auto_stories', href: '/poem' },
  { label: '倒计时', icon: 'timer', href: '/countdown' },
  { label: '放松一下', icon: 'sports_esports', href: '/relax' },
  { label: '控制中心', icon: 'tune', href: '/control' },
  { label: 'Mock 刷题', icon: 'quiz', href: '/mock-portal' },
  { label: '工具箱', icon: 'build', href: '/tools' },
  { label: '离线版', icon: 'cloud_off', href: '/offline' },
  { label: '设置', icon: 'settings', href: '/settings' },
  { label: '管理员', icon: 'admin_panel_settings', href: '/admin' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`flex flex-col border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] transition-all duration-200 ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Header */}
      <div className="flex h-14 items-center justify-between px-4 border-b border-[var(--sidebar-border)]">
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

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto py-4 space-y-1 px-2">
        {NAV_ITEMS.map((item) => {
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
  );
}
