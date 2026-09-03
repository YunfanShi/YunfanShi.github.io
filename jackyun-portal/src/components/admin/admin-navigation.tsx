'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

const nav = [
  { href: '/admin', icon: 'space_dashboard', label: '运营总览', exact: true }, { href: '/admin/users', icon: 'groups', label: '用户' }, { href: '/admin/ai', icon: 'smart_toy', label: 'AI 与配额' }, { href: '/admin/network', icon: 'router', label: '网络设备' }, { href: '/admin/tickets', icon: 'confirmation_number', label: '工单' }, { href: '/admin/announcements', icon: 'campaign', label: '公告' }, { href: '/admin/access', icon: 'manage_accounts', label: '访问控制' }, { href: '/admin/system', icon: 'monitoring', label: '系统健康' }, { href: '/admin/enforcer', icon: 'timer', label: '专注管控' }, { href: '/admin/update-hub', icon: 'history', label: '更新日志' },
];

export function AdminNavigation({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!compact) return;
    navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [compact, pathname]);

  return <nav ref={navRef} aria-label="后台导航" className={compact ? 'flex gap-1 overflow-x-auto p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden' : 'space-y-1'}>{nav.map((item) => { const active = item.exact ? pathname === item.href : pathname.startsWith(item.href); return <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} className={`flex min-h-11 shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${active ? 'bg-[#eff4ff] text-[#155eef] dark:bg-[#155eef]/20 dark:text-[#b2ddff]' : 'text-[#475467] hover:bg-[#f2f4f7] hover:text-[#155eef] dark:text-[#cbd5e1] dark:hover:bg-white/10'}`}><span className="material-icons-round text-lg">{item.icon}</span><span>{item.label}</span></Link>; })}</nav>;
}
