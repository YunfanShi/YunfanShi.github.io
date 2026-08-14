import EnforcerApp from '@/components/admin/enforcer-app';
import { AdminPageHeader } from '@/components/admin/page-header';

export default function EnforcerPage() {
  return <div className="mx-auto max-w-5xl space-y-6 pb-10"><AdminPageHeader eyebrow="运营工具" title="专注管控" description="为需要严格节奏的场景配置专注计时与限制策略。" /><section className="rounded-2xl border border-[#e4e7ec] bg-white p-5 dark:border-white/10 dark:bg-[#182230]"><EnforcerApp /></section></div>;
}
