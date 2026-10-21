import './admin-controls.css';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import ClientLoggerBoot from '@/components/layout/client-logger-boot';
import { AdminNavigation } from '@/components/admin/admin-navigation';
import { redirect } from 'next/navigation';
import { isAdminIdentity } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import BrandLogo from '@/components/brand-logo';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims) redirect('/dashboard');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', claims.sub).maybeSingle();
  const isAdmin = isAdminIdentity({ email: claims.email }, profile?.role);
  if (!isAdmin) redirect('/dashboard');
  if (profile?.role !== 'admin') {
    await createAdminClient()?.from('profiles').update({ role: 'admin', updated_at: new Date().toISOString() }).eq('id', claims.sub);
  }
  const name = (claims.user_metadata?.full_name as string | undefined) ?? claims.email ?? '管理员';
  return (
    <div data-theme="dark" className="flex h-[100dvh] min-h-0 flex-col overflow-hidden admin-shell bg-[#101012] text-zinc-100">
      <ClientLoggerBoot />
      <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between gap-2 border-b border-white/10 bg-[#141416]/95 px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur dark:border-white/10 dark:bg-[#141416]/95 sm:px-5 lg:h-16 lg:px-8 lg:py-0">
        <Link href="/admin" className="flex min-w-0 items-center gap-2 font-semibold tracking-tight sm:gap-3"><BrandLogo size={36} className="h-9 w-9 shrink-0" priority /><span className="truncate"><span className="sm:hidden">管理台</span><span className="hidden sm:inline">JackYun Admin</span></span></Link>
        <div className="flex shrink-0 items-center gap-2 text-sm text-zinc-400"><span className="hidden sm:inline">{name}</span><Link href="/dashboard" className="rounded-lg border border-white/15 px-3 py-1.5 font-medium hover:bg-white/5 dark:border-white/15 dark:hover:bg-white/10">返回工作台</Link></div>
      </header>
      <div className="border-b border-white/10 bg-[#141416] dark:border-white/10 dark:bg-[#141416] lg:hidden"><AdminNavigation compact /></div>
      <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1">
        <aside className="hidden w-64 shrink-0 overflow-y-auto border-r border-white/10 bg-[#141416] px-3 py-6 dark:border-white/10 dark:bg-[#141416] lg:block">
          <p className="px-3 pb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#98a2b3]">运营控制台</p>
          <AdminNavigation />
        </aside>
        <main data-scroll-region className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto scroll-smooth p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-5 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
