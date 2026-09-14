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
    totalErrorCount: model.total_error_count,
    lastErrorAt: model.last_error_at,
    testRunCount: model.test_run_count,
    testAttemptCount: model.test_attempt_count,
    lastTestAt: model.last_test_at,
    lastTestAttemptCount: model.last_test_attempt_count,
    lastTestAvailable: model.last_test_available,
    lastTestLog: model.last_test_log,
  }));
  return <div className="mx-auto max-w-[1440px] space-y-6 pb-10"><AdminPageHeader title="AI 模型测试" description="双并发检测平台模型；失败最多重试 2 次，并保存延迟、速度与每次尝试日志。" /><AiModelTestPanel initialModels={models} /></div>;
}
