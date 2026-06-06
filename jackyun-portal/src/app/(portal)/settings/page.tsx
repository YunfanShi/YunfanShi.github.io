import Link from 'next/link';
import { checkHasPassword } from '@/actions/auth';
import { getAiConfig } from '@/actions/settings';
import { createClient } from '@/lib/supabase/server';
import AiConfigPanel from '@/components/settings/ai-config-panel';
import ProfileEditor from '@/components/settings/profile-editor';
import ChangePasswordPanel from '@/components/admin/change-password-panel';
import ExportDataPanel from '@/components/settings/export-data-panel';
import QuizLanguageSectionWrapper from '@/components/settings/quiz-language-section';
import LoggerViewerWrapper from '@/components/settings/logger-viewer-wrapper';
import FullscreenToggle from '@/components/settings/fullscreen-toggle';

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
  // Wrap ALL async calls in try/catch to prevent page crash
  let hasPassword = false;
  let aiConfig = { baseUrl: '', apiKey: '', model: '' };
  let displayName = '';
  let avatarUrl = '';
  let userId = '';

  try {
    hasPassword = await checkHasPassword();
  } catch { /* fallback: no password set */ }

  try {
    aiConfig = await getAiConfig();
  } catch { /* fallback: empty config */ }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    displayName = user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? '';
    avatarUrl = user?.user_metadata?.avatar_url ?? '';
    userId = user?.id ?? '';
  } catch { /* fallback: not authenticated, show empty profile */ }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-8">
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">设置</h1>
        <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">账户与应用配置</p>
      </div>

      {/* Profile */}
      <ProfileSection initialName={displayName} initialAvatar={avatarUrl} userId={userId} />

      {/* 账户安全 */}
      <section className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-5">
        <SectionHeader icon="lock" title="账户安全" />
        <ChangePasswordPanel hasPassword={hasPassword} />
        <div className="mt-3">
          <Link
            href="/reset-password"
            className="flex items-center gap-2 text-sm text-[#4285F4] hover:underline"
          >
            <span className="material-icons-round text-base">email</span>
            通过邮件重置密码
          </Link>
        </div>
      </section>

      {/* AI 配置 */}
      <section className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-5">
        <SectionHeader icon="smart_toy" title="AI 配置" />
        <p className="text-sm text-[var(--muted-foreground)] mb-4">
          配置一次即可在全站使用 AI 功能。支持 OpenAI、DeepSeek、Gemini 等兼容接口。
        </p>
        <AiConfigPanel initialBaseUrl={aiConfig.baseUrl} initialApiKey={aiConfig.apiKey} initialModel={aiConfig.model} />
      </section>

      {/* QuizWise Language Settings */}
      <QuizLanguageSectionWrapper />

      {/* 界面设置 */}
      <section className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-5">
        <SectionHeader icon="display_settings" title="界面设置" />
        <FullscreenToggle />
      </section>

      {/* 更新日志 */}
      <section className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-5">
        <SectionHeader icon="history" title="更新日志" />
        <p className="text-sm text-[var(--muted-foreground)] mb-4">
          查看 JackYun Portal 的版本更新历史。
        </p>
        <Link
          href="/update-hub"
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--card-border)] text-sm font-medium text-[var(--foreground)] hover:bg-[#4285F4]/5 hover:border-[#4285F4]/30 transition-colors w-fit"
        >
          <span className="material-icons-round text-base text-[#4285F4]">history</span>
          查看更新历史
        </Link>
      </section>

      {/* 数据管理 */}
      <section className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-5">
        <SectionHeader icon="download" title="数据管理" />
        <p className="text-sm text-[var(--muted-foreground)] mb-4">
          导出你的所有数据，包括词汇、学习计划、诗词等。
        </p>
        <ExportDataPanel />
      </section>

      {/* 客户端日志 */}
      <LoggerViewerWrapper />
    </div>
  );
}

function ProfileSection({ initialName, initialAvatar, userId }: { initialName: string; initialAvatar: string; userId: string }) {
  return (
    <section className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-5">
      <SectionHeader icon="person" title="个人资料" />
      <ProfileEditor initialName={initialName} initialAvatar={initialAvatar} userId={userId} />
    </section>
  );
}

