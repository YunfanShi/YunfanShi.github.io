import { getAiAdminData } from '@/actions/ai-admin';
import AiPlatformPanel from '@/components/admin/ai-platform-panel';
import { AdminPageHeader } from '@/components/admin/page-header';

export default async function AdminAiPage() {
  const data = await getAiAdminData();
  return <div className="mx-auto max-w-[1440px] space-y-6 pb-10"><AdminPageHeader title="AI 与配额" description="配置平台模型、四档 Token 套餐、成本统计和 AI 界面备份。" /><AiPlatformPanel initial={data} /></div>;
}

