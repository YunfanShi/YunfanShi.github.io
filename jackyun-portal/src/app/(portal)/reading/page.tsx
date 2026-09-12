import type { Metadata } from 'next';
import ReadingWorkbench from '@/components/modules/ielts/reading-workbench';
import { getReaderBootstrap } from '@/actions/reader';

export const metadata: Metadata = {
  title: 'Reading · JackYun',
  description: 'Read Chinese and English books, create level-controlled English articles, look up words in context, and keep precise reading progress.',
};

export default async function ReadingPage() {
  const bootstrap = await getReaderBootstrap();
  const access = bootstrap.features.reading;
  if (access && !access.allowed) return <div className="mx-auto max-w-2xl rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-8 text-center"><span className="material-icons-round text-6xl text-[#7f56d9]">lock</span><h1 className="mt-4 text-2xl font-bold">Reading 阅读器暂未开放</h1><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">{!access.enabled ? '管理员暂时关闭了此功能。' : access.betaOnly && !bootstrap.betaActive ? '此功能目前仅向 BETA 用户开放。' : `此功能需要 ${access.minimumPlan.toUpperCase()} 或更高会员。`}</p></div>;
  return <ReadingWorkbench bootstrap={bootstrap} />;
}
