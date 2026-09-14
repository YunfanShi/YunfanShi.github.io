import { getAiAdminData } from '@/actions/ai-admin';
import AiModelTestPanel from '@/components/admin/ai-model-test-panel';
import { AdminPageHeader } from '@/components/admin/page-header';

export default async function AdminAiTestPage() {
  const data = await getAiAdminData();
  const providerNames = new Map(data.providers.map((provider) => [provider.id, provider.display_name]));
  const models = data.models.map((model) => ({
    id: model.id,
    displayName: model.display_name,
    modelId: model.model_id,
    providerName: providerNames.get(model.provider_id) ?? '未知服务',
    description: model.description,
    capabilities: model.capabilities,
    enabled: model.enabled,
    sortOrder: model.sort_order,
    consecutiveFailures: model.consecutive_failures,
    lastFailureDetail: model.last_failure_detail,
  }));
  return <div className="mx-auto max-w-[1440px] space-y-6 pb-10"><AdminPageHeader title="AI 模型测试" description="顺序检测平台模型的连接、首字延迟、总耗时、生成速度与实际可用性。" /><AiModelTestPanel initialModels={models} /></div>;
}
