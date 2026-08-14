import EnforcerApp from '@/components/admin/enforcer-app';

export default function EnforcerPage() {
  return <div className="mx-auto max-w-5xl space-y-6 pb-10"><div><p className="text-sm font-medium text-[#155eef]">运营工具</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">专注管控</h1><p className="mt-2 text-sm text-[#667085] dark:text-[#98a2b3]">为需要严格节奏的场景配置专注计时与限制策略。</p></div><section className="rounded-2xl border border-[#e4e7ec] bg-white p-5 dark:border-white/10 dark:bg-[#182230]"><EnforcerApp /></section></div>;
}
