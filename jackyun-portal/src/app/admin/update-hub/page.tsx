import Link from 'next/link';
import { APP_VERSION } from '@/lib/utils';

const entries = [
  { version: `v${APP_VERSION}`, date: '2026-08-14', title: '时间管理与运营后台升级', text: '番茄钟云端同步、独立 Admin 管理控制台、通知中心、隐藏游客入口、安全头像上传与 Apple OAuth 登录入口。' },
  { version: 'v3.11.x', date: '2026-08', title: '学习体验持续优化', text: '学习规划、目标、日程与工具模块持续改进。' },
];

export default function UpdateHubPage() {
  return <div className="mx-auto max-w-4xl pb-10"><div className="mb-8"><p className="text-sm font-medium text-[#155eef]">产品运营</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">版本记录</h1><p className="mt-2 text-sm text-[#667085] dark:text-[#98a2b3]">面向运营人员的发布摘要与平台版本状态。</p></div><div className="space-y-4">{entries.map((entry) => <article key={entry.version} className="rounded-2xl border border-[#e4e7ec] bg-white p-6 dark:border-white/10 dark:bg-[#182230]"><div className="flex flex-wrap items-center gap-3"><span className="rounded-full bg-[#eff4ff] px-2.5 py-1 text-xs font-bold text-[#155eef]">{entry.version}</span><span className="text-sm text-[#667085] dark:text-[#98a2b3]">{entry.date}</span></div><h2 className="mt-4 text-lg font-semibold">{entry.title}</h2><p className="mt-2 text-sm leading-6 text-[#667085] dark:text-[#98a2b3]">{entry.text}</p></article>)}</div><Link href="/update" className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-[#155eef] hover:underline">查看用户可见的完整更新记录 <span className="material-icons-round text-base">arrow_forward</span></Link></div>;
}
