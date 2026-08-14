import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { deletionRecoveryHtml, suspendedAccountHtml } from '@/lib/account-status-templates';
import AccountAppealPanel from '@/components/account/account-appeal-panel';

export default async function AccountStatusPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_status, suspended_reason, suspended_explanation, deleted_at')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile) redirect('/login');
  if (profile.account_status !== 'suspended' && !profile.deleted_at) redirect('/dashboard');

  const ticketType = profile.deleted_at ? 'deletion_recovery' as const : 'suspension_appeal' as const;
  const deadline = profile.deleted_at
    ? new Date(new Date(profile.deleted_at).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
    : null;
  const canAppeal = !deadline || Date.now() <= new Date(deadline).getTime();
  const html = profile.deleted_at && deadline
    ? deletionRecoveryHtml(profile.deleted_at, deadline)
    : suspendedAccountHtml(profile.suspended_reason, profile.suspended_explanation);

  const { data: existingTicket } = await supabase
    .from('bug_reports')
    .select('id')
    .eq('user_id', user.id)
    .eq('ticket_type', ticketType)
    .neq('status', 'closed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  async function signOut() {
    'use server';
    const client = await createClient();
    await client.auth.signOut();
    redirect('/login');
  }

  return (
    <main className="min-h-screen bg-[#f6f8fc] px-4 py-8 dark:bg-[#111827] sm:py-12">
      <div className="mx-auto max-w-3xl">
        <header className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#155eef] font-bold text-white">J</span>
            <div><p className="font-semibold text-[var(--foreground)]">JackYun</p><p className="text-xs text-[var(--muted-foreground)]">账户服务中心</p></div>
          </div>
          <form action={signOut}><button type="submit" className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--muted-foreground)] hover:bg-white dark:hover:bg-white/10">退出登录</button></form>
        </header>
        <article className="rounded-3xl border border-[#e4e7ec] bg-white p-6 shadow-sm sm:p-9" dangerouslySetInnerHTML={{ __html: html }} />
        <AccountAppealPanel ticketType={ticketType} existingTicketId={existingTicket?.id ?? null} canAppeal={canAppeal} />
        <p className="mt-5 text-center text-xs text-[#98a2b3]">为保护账户安全，受限期间仅开放账户状态和客服沟通功能。</p>
      </div>
    </main>
  );
}
