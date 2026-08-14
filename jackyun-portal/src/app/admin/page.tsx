import Link from 'next/link';
import { getDashboardOverview } from '@/actions/admin';
import { DashboardPanel } from '@/components/admin/dashboard-panel';
import { AdminPageHeader } from '@/components/admin/page-header';

export default async function AdminPage() {
  const overview = await getDashboardOverview().catch(() => null);
  return <div className="mx-auto max-w-[1440px] space-y-6 pb-10"><AdminPageHeader title="运营总览" description="集中查看用户增长、反馈处理、公告排期和平台专注使用情况。" actions={<><Link href="/admin/announcements" className="rounded-lg border border-[#d0d5dd] px-3 py-2 text-sm font-semibold hover:bg-[#f9fafb] dark:border-white/15 dark:hover:bg-white/10">发布公告</Link><Link href="/admin/tickets" className="rounded-lg bg-[#155eef] px-3 py-2 text-sm font-semibold text-white hover:bg-[#004eeb]">查看工单</Link></>} />{overview ? <DashboardPanel initial={overview} /> : <section className="rounded-2xl border border-[#fecdca] bg-[#fffbfa] p-6 text-sm text-[#b42318]"><p className="font-semibold">暂时无法加载运营数据</p><p className="mt-1">请确认最新 Supabase migration 已部署，然后刷新页面。</p></section>}</div>;
}
