import type { Metadata } from 'next';
import NovelWorkbench from '@/components/modules/ielts/novel-workbench';
import { getReaderBootstrap } from '@/actions/reader';

export const metadata: Metadata = {
  title: 'Reading 阅读器 · JackYun',
  description: '支持跨设备进度同步、私有书架与会员小说商店的沉浸式阅读器。',
};

export default async function ReadingPage() {
  const bootstrap = await getReaderBootstrap();
  const access = bootstrap.features.reading;
  if (access && !access.allowed) return <div className="mx-auto max-w-2xl rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-8 text-center"><span className="material-icons-round text-6xl text-[#7f56d9]">lock</span><h1 className="mt-4 text-2xl font-bold">Reading 阅读器暂未开放</h1><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">{!access.enabled ? '管理员暂时关闭了此功能。' : access.betaOnly && !bootstrap.betaActive ? '此功能目前仅向 BETA 用户开放。' : `此功能需要 ${access.minimumPlan.toUpperCase()} 或更高会员。`}</p></div>;
  return <NovelWorkbench bootstrap={bootstrap} />;
}
