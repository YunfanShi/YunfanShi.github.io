import Link from 'next/link';
import { checkHasPassword } from '@/actions/auth';
import { getAiConfig } from '@/actions/settings';
import { createClient } from '@/lib/supabase/server';
import AiConfigPanel from '@/components/settings/ai-config-panel';
import ChangePasswordPanel from '@/components/admin/change-password-panel';
import ExportDataPanel from '@/components/settings/export-data-panel';

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
  const hasPassword = await checkHasPassword();
  const aiConfig = await getAiConfig().catch(() => ({ baseUrl: '', apiKey: '', model: '' }));

  // Get current user profile
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const displayName = user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? '';
  const avatarUrl = user?.user_metadata?.avatar_url ?? '';

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-8">
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">设置</h1>
        <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">账户与应用配置</p>
      </div>

      {/* Profile */}
      <ProfileSection initialName={displayName as string} initialAvatar={avatarUrl as string} userId={user?.id ?? ''} />

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
      <QuizLanguageSection />

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
    </div>
  );
}

function ProfileSection({ initialName, initialAvatar, userId }: { initialName: string; initialAvatar: string; userId: string }) {
  return (
    <section className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-5">
      <SectionHeader icon="person" title="个人资料" />
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          {initialAvatar ? (
            <img src={initialAvatar} alt="头像" className="w-16 h-16 rounded-full border border-[var(--card-border)] object-cover" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-[#4285F4]/10 flex items-center justify-center">
              <span className="material-icons-round text-3xl text-[#4285F4]">person</span>
            </div>
          )}
          <div>
            <p className="font-medium text-[var(--foreground)]">{initialName || '未设置'}</p>
            <p className="text-xs text-[var(--muted-foreground)] mt-1">
              通过 OAuth 提供商（Google/GitHub）登录的用户，头像和名称会自动同步。可前往管理员页面关联第三方账号。
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function QuizLanguageSection() {
  return (
    <section className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-5">
      <SectionHeader icon="translate" title="QuizWise 语言与回答偏好" />
      <p className="text-sm text-[var(--muted-foreground)] mb-4">
        自定义 AI 分析题目时的回答语言和格式偏好。
      </p>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
            UI 语言
          </label>
          <select
            defaultValue="zh"
            className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4] transition-colors"
            onChange={e => { if (typeof window !== 'undefined') localStorage.setItem('quizwise_ui_lang', e.target.value); }}
          >
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
            回答语言偏好
          </label>
          <select
            defaultValue="zh_kw_en"
            className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4] transition-colors"
            onChange={e => { if (typeof window !== 'undefined') localStorage.setItem('quizwise_answer_lang', e.target.value); }}
          >
            <option value="zh_kw_en">中文回答 + 关键词英文（推荐）</option>
            <option value="zh">全中文</option>
            <option value="en">全英文（English）</option>
            <option value="en_kw_zh">English answer + Chinese keywords</option>
            <option value="bilingual">中英双语</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
            反馈详细程度
          </label>
          <select
            defaultValue="normal"
            className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4] transition-colors"
            onChange={e => { if (typeof window !== 'undefined') localStorage.setItem('quizwise_feedback_level', e.target.value); }}
          >
            <option value="brief">简洁（要点提示）</option>
            <option value="normal">标准（详细解释）</option>
            <option value="detailed">详细（含步骤推导）</option>
          </select>
        </div>
      </div>
    </section>
  );
}