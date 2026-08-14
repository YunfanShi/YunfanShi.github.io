import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import ClientLoggerBoot from '@/components/layout/client-logger-boot';

const nav = [
  { href: '/admin', icon: 'space_dashboard', label: '运营总览' },
  { href: '/admin#notifications', icon: 'campaign', label: '通知中心' },
  { href: '/admin#access', icon: 'manage_accounts', label: '账号与权限' },
  { href: '/admin#system', icon: 'monitoring', label: '系统与数据' },
  { href: '/admin/enforcer', icon: 'timer', label: '专注管控' },
  { href: '/admin/update-hub', icon: 'history', label: '版本记录' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const name = (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? '管理员';
  return (
    <div className="min-h-screen bg-[#f6f8fc] text-[#182230] dark:bg-[#111827] dark:text-white">
      <ClientLoggerBoot />
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[#e4e7ec] bg-white/95 px-5 backdrop-blur dark:border-white/10 dark:bg-[#111827]/95 lg:px-8">
        <Link href="/admin" className="flex items-center gap-3 font-semibold tracking-tight"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#155eef] text-white">J</span><span>JackYun Admin</span></Link>
        <div className="flex items-center gap-3 text-sm text-[#667085] dark:text-[#98a2b3]"><span className="hidden sm:inline">{name}</span><Link href="/dashboard" className="rounded-lg border border-[#d0d5dd] px-3 py-1.5 font-medium hover:bg-[#f9fafb] dark:border-white/15 dark:hover:bg-white/10">返回工作台</Link></div>
      </header>
      <div className="mx-auto flex max-w-[1600px]">
        <aside className="hidden w-64 shrink-0 border-r border-[#e4e7ec] bg-white px-3 py-6 dark:border-white/10 dark:bg-[#111827] lg:block">
          <p className="px-3 pb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#98a2b3]">运营控制台</p>
          <nav className="space-y-1">{nav.map((item) => <Link key={item.href} href={item.href} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-[#475467] transition hover:bg-[#eff4ff] hover:text-[#155eef] dark:text-[#cbd5e1] dark:hover:bg-white/10"><span className="material-icons-round text-lg">{item.icon}</span>{item.label}</Link>)}</nav>
        </aside>
        <main className="min-w-0 flex-1 p-5 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
