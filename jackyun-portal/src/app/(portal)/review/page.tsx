import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import ReviewSession from '@/components/modules/review/review-session';
import type { ReviewItem } from '@/types/review';

export const metadata = { title: '错题复习 · JackYun Portal' };

export default async function ReviewPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return (
      <div className="page-enter mx-auto max-w-3xl py-16 text-center">
        <span className="material-icons-round text-5xl text-[#1a73e8]">history_edu</span>
        <h1 className="mt-4 text-2xl font-semibold">登录后建立跨设备错题本</h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">游客 Quiz 仍保存在本机；登录后错题会自动进入间隔复习队列。</p>
        <Link href="/login" className="mt-6 inline-flex rounded-lg bg-[#1a73e8] px-4 py-2 text-sm font-semibold text-white">前往登录</Link>
      </div>
    );
  }

  const now = new Date().toISOString();
  const [{ data: dueItems, error }, { count: activeCount }, { count: masteredCount }] = await Promise.all([
    supabase.from('review_items').select('*').eq('user_id', user.id).eq('status', 'active').lte('next_review_at', now).order('next_review_at').limit(50),
    supabase.from('review_items').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'active'),
    supabase.from('review_items').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'mastered'),
  ]);
  if (error) throw new Error(error.message);

  return (
    <div className="page-enter mx-auto max-w-4xl pb-12">
      <header className="border-b border-[var(--card-border)] pb-7">
        <p className="text-xs font-semibold uppercase tracking-[.15em] text-[#1a73e8]">Spaced review</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-.04em]">错题复习</h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">答错的题目会自动进入队列，根据每次自评安排下一次复习。</p>
      </header>
      <section className="my-6 grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4"><p className="text-xs text-[var(--muted-foreground)]">今日到期</p><strong className="mt-2 block text-2xl">{dueItems?.length ?? 0}</strong></div>
        <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4"><p className="text-xs text-[var(--muted-foreground)]">学习中</p><strong className="mt-2 block text-2xl">{activeCount ?? 0}</strong></div>
        <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4"><p className="text-xs text-[var(--muted-foreground)]">已掌握</p><strong className="mt-2 block text-2xl">{masteredCount ?? 0}</strong></div>
      </section>
      <ReviewSession initialItems={(dueItems ?? []) as ReviewItem[]} />
    </div>
  );
}
