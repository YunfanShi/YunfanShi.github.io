'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const nav = [
  { href: '/admin', icon: 'space_dashboard', label: '运营总览', exact: true }, { href: '/admin/users', icon: 'groups', label: '用户' }, { href: '/admin/tickets', icon: 'confirmation_number', label: '工单' }, { href: '/admin/announcements', icon: 'campaign', label: '公告' }, { href: '/admin/access', icon: 'manage_accounts', label: '访问控制' }, { href: '/admin/system', icon: 'monitoring', label: '系统健康' }, { href: '/admin/enforcer', icon: 'timer', label: '专注管控' }, { href: '/admin/update-hub', icon: 'history', label: '更新日志' },
];

export function AdminNavigation({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();
  return <nav className={compact ? 'flex gap-1 overflow-x-auto p-2' : 'space-y-1'}>{nav.map((item) => { const active = item.exact ? pathname === item.href : pathname.startsWith(item.href); return <Link key={item.href} href={item.href} className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${active ? 'bg-[#eff4ff] text-[#155eef] dark:bg-[#155eef]/20 dark:text-[#b2ddff]' : 'text-[#475467] hover:bg-[#f2f4f7] hover:text-[#155eef] dark:text-[#cbd5e1] dark:hover:bg-white/10'}`}><span className="material-icons-round text-lg">{item.icon}</span><span>{item.label}</span></Link>; })}</nav>;
}
