import { getAiConfig } from '@/actions/settings';
import AiConfigPanel from '@/components/settings/ai-config-panel';
import ChangePasswordPanel from '@/components/admin/change-password-panel';

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="material-icons-round text-[var(--muted-foreground)] text-lg">{icon}</span>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
        {title}
      </h2>
    </div>
  );
}

export default async function SettingsPage() {
  const aiConfig = await getAiConfig().catch(() => ({ baseUrl: '', apiKey: '' }));

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-8">
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">设置</h1>
        <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">账户与应用配置</p>
      </div>

      {/* 账户安全 */}
      <section className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-5">
        <SectionHeader icon="lock" title="账户安全" />
        <ChangePasswordPanel />
      </section>

      {/* AI 配置 */}
      <section className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-5">
        <SectionHeader icon="smart_toy" title="AI 配置" />
        <p className="text-sm text-[var(--muted-foreground)] mb-4">
          配置自定义 AI 接口，用于应用内 AI 功能。
        </p>
        <AiConfigPanel initialBaseUrl={aiConfig.baseUrl} initialApiKey={aiConfig.apiKey} />
      </section>
    </div>
  );
}
