'use client';

import { useLanguage } from '@/components/language-provider';
import { t } from '@/lib/i18n';
import Link from 'next/link';
import ProfileEditor from '@/components/settings/profile-editor';
import ChangePasswordPanel from '@/components/admin/change-password-panel';
import AiConfigPanel from '@/components/settings/ai-config-panel';
import QuizLanguageSectionWrapper from '@/components/settings/quiz-language-section';
import LoggerViewerWrapper from '@/components/settings/logger-viewer-wrapper';
import DeleteAccountPanel from '@/components/settings/delete-account-panel';
import FullscreenToggle from '@/components/settings/fullscreen-toggle';
import SidebarPrefsPanel from '@/components/settings/sidebar-prefs-panel';
import TtsConfigPanel from '@/components/settings/tts-config-panel';
import LanguageSwitcher from '@/components/settings/language-switcher';
import ExportDataPanel from '@/components/settings/export-data-panel';
import BugReportPanel from '@/components/settings/bug-report-panel';
import { APP_VERSION } from '@/lib/utils';

function SectionHeader({ icon, titleKey }: { icon: string; titleKey: string }) {
  const { lang } = useLanguage();
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="material-icons-round text-[var(--muted-foreground)] text-lg">{icon}</span>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
        {t(titleKey, lang)}
      </h2>
    </div>
  );
}

interface SettingsContentProps {
  hasPassword: boolean;
  aiConfig: { baseUrl: string; apiKey: string; model: string };
  displayName: string;
  avatarUrl: string;
  userId: string;
  sidebarPrefs: { musicMode: 'player' | 'sync'; answerSheetMode: 'standard' | 'sync' };
}

export default function SettingsContent({
  hasPassword,
  aiConfig,
  displayName,
  avatarUrl,
  userId,
  sidebarPrefs,
}: SettingsContentProps) {
  const { lang } = useLanguage();

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-8">
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">{t('settings.title', lang)}</h1>
        <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">{t('settings.subtitle', lang)}</p>
      </div>

      {/* Language / 语言 */}
      <LanguageSwitcher />

      {/* 个人资料 */}
      <section className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-5">
        <SectionHeader icon="person" titleKey="settings.section.profile" />
        <ProfileEditor initialName={displayName} initialAvatar={avatarUrl} userId={userId} />
      </section>

      {/* 账户安全 */}
      <section className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-5">
        <SectionHeader icon="lock" titleKey="settings.section.security" />
        <ChangePasswordPanel hasPassword={hasPassword} />
        <div className="mt-3">
          <Link
            href="/reset-password"
            className="flex items-center gap-2 text-sm text-[#4285F4] hover:underline"
          >
            <span className="material-icons-round text-base">email</span>
            {t('settings.reset-password', lang)}
          </Link>
        </div>
      </section>

      {/* AI 配置 */}
      <section className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-5">
        <SectionHeader icon="smart_toy" titleKey="settings.section.ai" />
        <p className="text-sm text-[var(--muted-foreground)] mb-4">
          {t('settings.section.ai-desc', lang)}
        </p>
        <AiConfigPanel initialBaseUrl={aiConfig.baseUrl} initialApiKey={aiConfig.apiKey} initialModel={aiConfig.model} />
      </section>

      {/* QuizWise Language Settings */}
      <QuizLanguageSectionWrapper />

      {/* 界面设置 */}
      <section className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-5">
        <SectionHeader icon="display_settings" titleKey="settings.section.ui" />
        <FullscreenToggle />
      </section>

      {/* 模块显示偏好 */}
      <SidebarPrefsPanel initialPrefs={sidebarPrefs} />

      {/* 语音设置 */}
      <section className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-5">
        <SectionHeader icon="record_voice_over" titleKey="settings.section.voice" />
        <TtsConfigPanel />
      </section>

      {/* 更新日志 */}
      <section className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-5">
        <SectionHeader icon="history" titleKey="settings.section.changelog" />
        <p className="text-sm text-[var(--muted-foreground)] mb-4">
          {t('settings.section.changelog-desc', lang)}
        </p>
        <Link
          href="/update"
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--card-border)] text-sm font-medium text-[var(--foreground)] hover:bg-[#4285F4]/5 hover:border-[#4285F4]/30 transition-colors w-fit"
        >
          <span className="material-icons-round text-base text-[#4285F4]">history</span>
          {t('settings.view-changelog', lang)}
        </Link>
      </section>

      {/* 关于 */}
      <section className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-5">
        <SectionHeader icon="info" titleKey="settings.section.about" />
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#4285F4]/10 flex items-center justify-center">
            <span className="material-icons-round text-[#4285F4]">rocket_launch</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--foreground)]">JackYun Portal</p>
            <p className="text-xs text-[var(--muted-foreground)]">
              {lang === 'zh' ? '版本' : 'Version'} v{APP_VERSION}
            </p>
          </div>
        </div>
      </section>

      {/* 数据管理 */}
      <section className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-5">
        <SectionHeader icon="download" titleKey="settings.section.data" />
        <p className="text-sm text-[var(--muted-foreground)] mb-4">
          {t('settings.section.data-desc', lang)}
        </p>
        <ExportDataPanel />
      </section>

      <BugReportPanel />

      {/* 客户端日志 */}
      <LoggerViewerWrapper />

      {/* 危险区域 - 账户注销 */}
      <DeleteAccountPanel />
    </div>
  );
}
