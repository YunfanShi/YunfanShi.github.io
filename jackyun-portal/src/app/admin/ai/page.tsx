import { getAiAdminData } from '@/actions/ai-admin';
import AiPlatformPanel from '@/components/admin/ai-platform-panel';
import { AdminPageHeader } from '@/components/admin/page-header';

export default async function AdminAiPage() {
  const data = await getAiAdminData();
  return <div className="mx-auto max-w-[1440px] space-y-6 pb-10"><AdminPageHeader title="AI 与配额" description="管理模型目录、套餐可用范围、服务连接和平台成本。" /><AiPlatformPanel initial={data} /></div>;
}
