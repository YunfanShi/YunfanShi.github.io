import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import ClientLoggerBoot from '@/components/layout/client-logger-boot';
import { AdminNavigation } from '@/components/admin/admin-navigation';
import { redirect } from 'next/navigation';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/dashboard');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const adminUsers = (process.env.ADMIN_USERS ?? process.env.AUTHORIZED_GITHUB_USERS ?? '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  const username = (user.user_metadata?.user_name as string | undefined)?.toLowerCase();
  if (profile?.role !== 'admin' && (!username || !adminUsers.includes(username))) redirect('/dashboard');
  const name = (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? '管理员';
  return (
    <div className="min-h-screen bg-[#f6f8fc] text-[#182230] dark:bg-[#111827] dark:text-white">
      <ClientLoggerBoot />
      <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between gap-2 border-b border-[#e4e7ec] bg-white/95 px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur dark:border-white/10 dark:bg-[#111827]/95 sm:px-5 lg:h-16 lg:px-8 lg:py-0">
        <Link href="/admin" className="flex min-w-0 items-center gap-2 font-semibold tracking-tight sm:gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#155eef] text-white">J</span><span className="truncate"><span className="sm:hidden">管理台</span><span className="hidden sm:inline">JackYun Admin</span></span></Link>
        <div className="flex shrink-0 items-center gap-2 text-sm text-[#667085] dark:text-[#98a2b3]"><span className="hidden sm:inline">{name}</span><Link href="/dashboard" className="rounded-lg border border-[#d0d5dd] px-3 py-1.5 font-medium hover:bg-[#f9fafb] dark:border-white/15 dark:hover:bg-white/10">返回工作台</Link></div>
      </header>
      <div className="border-b border-[#e4e7ec] bg-white dark:border-white/10 dark:bg-[#111827] lg:hidden"><AdminNavigation compact /></div>
      <div className="mx-auto flex max-w-[1600px]">
        <aside className="hidden w-64 shrink-0 border-r border-[#e4e7ec] bg-white px-3 py-6 dark:border-white/10 dark:bg-[#111827] lg:block">
          <p className="px-3 pb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#98a2b3]">运营控制台</p>
          <AdminNavigation />
        </aside>
        <main className="min-w-0 flex-1 overflow-x-hidden p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-5 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
