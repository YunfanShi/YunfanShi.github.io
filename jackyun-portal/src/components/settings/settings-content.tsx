'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import ProfileEditor from '@/components/settings/profile-editor';
import ChangePasswordPanel from '@/components/admin/change-password-panel';
import AiConfigPanel from '@/components/settings/ai-config-panel';
import QuizLanguageSectionWrapper from '@/components/settings/quiz-language-section';
import LoggerViewerWrapper from '@/components/settings/logger-viewer-wrapper';
import DeleteAccountPanel from '@/components/settings/delete-account-panel';
import SidebarPrefsPanel from '@/components/settings/sidebar-prefs-panel';
import TtsConfigPanel from '@/components/settings/tts-config-panel';
import LanguageSwitcher from '@/components/settings/language-switcher';
import ExportDataPanel from '@/components/settings/export-data-panel';
import BugReportPanel from '@/components/settings/bug-report-panel';
import CloudPreferencesPanel from '@/components/settings/cloud-preferences-panel';
import CompanionSettingsPanel, { type CompanionDeviceView } from '@/components/settings/companion-settings-panel';
import SyncCenterPanel from '@/components/settings/sync-center-panel';
import type { SidebarPreferences } from '@/actions/settings';
import { APP_VERSION } from '@/lib/utils';
import AiQuotaCard, { type AiQuotaSummary } from '@/components/settings/ai-quota-card';
import AiVisibilityControl from '@/components/settings/ai-visibility-control';

const categories = [
  { id: 'general', label: '常规', icon: 'tune', keywords: '语言 时区 启动 通知' },
  { id: 'account', label: '账户与安全', icon: 'manage_accounts', keywords: '头像 密码 个人资料 登录' },
  { id: 'appearance', label: '外观', icon: 'palette', keywords: '主题 动画 密度 全屏' },
  { id: 'navigation', label: '侧边栏与导航', icon: 'view_sidebar', keywords: '拖拽 顺序 隐藏 固定 自适应' },
  { id: 'companion', label: 'Companion 与同步', icon: 'devices', keywords: '扩展 设备 时间 同步 隐私' },
  { id: 'learning', label: '学习与专注', icon: 'school', keywords: '目标 番茄钟 Quiz 提醒' },
  { id: 'ai', label: 'AI 与语音', icon: 'smart_toy', keywords: '模型 API Key TTS 朗读' },
  { id: 'data', label: '数据与隐私', icon: 'storage', keywords: '导出 保留 清除' },
  { id: 'advanced', label: '高级', icon: 'terminal', keywords: '日志 实验 诊断 反馈' },
  { id: 'about', label: '关于与支持', icon: 'info', keywords: '版本 更新 帮助 注销' },
] as const;
type CategoryId = (typeof categories)[number]['id'];

function Panel({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 sm:p-6"><h2 className="text-lg font-semibold text-[var(--foreground)]">{title}</h2>{description && <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">{description}</p>}<div className="mt-5">{children}</div></section>;
}

interface Props {
  hasPassword: boolean;
  aiConfig: { baseUrl: string; apiKey: string; model: string; providerMode: 'cloud' | 'personal' };
  displayName: string;
  avatarUrl: string;
  userId: string;
  sidebarPrefs: SidebarPreferences;
  cloudSettings: Record<string, Record<string, unknown>>;
  companionDevices: CompanionDeviceView[];
  initialSection?: string;
  aiQuota: AiQuotaSummary;
}

export default function SettingsContent(props: Props) {
  const isGuest = !props.userId;
  const [active, setActive] = useState<CategoryId>(() => categories.some((item) => item.id === props.initialSection) ? props.initialSection as CategoryId : 'general');
  const [query, setQuery] = useState('');
  function choose(id: CategoryId) { setActive(id); const url = new URL(location.href); url.searchParams.set('section', id); history.replaceState({}, '', url); }
  const visibleCategories = useMemo(() => { const needle = query.trim().toLowerCase(); return needle ? categories.filter((item) => `${item.label} ${item.keywords}`.toLowerCase().includes(needle)) : categories; }, [query]);
  const settings = props.cloudSettings;

  return <div className="page-enter mx-auto max-w-7xl">
    <div className="mb-6"><h1 className="text-3xl font-bold tracking-[-.04em] text-[var(--foreground)]">设置</h1><p className="mt-1 text-sm text-[var(--muted-foreground)]">{isGuest ? '游客设置保存在当前设备；登录后自动合并并同步。' : '账户、外观、导航、同步和隐私设置会保存到你的 JackYun 账号。'}</p></div>
    {isGuest && <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-[#f9ab00]/40 bg-[#fef7e0] p-4 text-sm text-[#7a4b00] dark:bg-[#3d2f12] dark:text-[#fdd663] sm:flex-row sm:items-center sm:justify-between"><span><strong>当前为游客模式。</strong> 学习数据与偏好保存在此设备，不会自动出现在其他设备。</span><Link href="/login?next=/settings" className="shrink-0 rounded-xl bg-[#1a73e8] px-4 py-2 font-semibold text-white">登录并开启云同步</Link></div>}
    <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="min-w-0 self-start overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-3 lg:sticky lg:top-0 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto">
        <label className="flex items-center gap-2 rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5"><span className="material-icons-round text-lg text-[var(--muted-foreground)]">search</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索设置…" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
        <select value={active} onChange={(event) => choose(event.target.value as CategoryId)} className="mt-3 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-3 lg:hidden">{categories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
        <nav className="mt-3 hidden space-y-1 lg:block">{visibleCategories.map((item) => <button key={item.id} type="button" onClick={() => choose(item.id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium ${active === item.id ? 'bg-[#e8f0fe] text-[#174ea6] dark:bg-[#174ea6]/50 dark:text-[#d2e3fc]' : 'text-[var(--foreground)] hover:bg-[var(--background)]'}`}><span className="material-icons-round shrink-0 text-lg">{item.icon}</span><span className="min-w-0 flex-1">{item.label}</span></button>)}</nav>
      </aside>
      <main className="min-w-0 space-y-5">
        {active === 'general' && <><Panel title="语言"><LanguageSwitcher /></Panel><Panel title="常规" description="控制启动、通知和时间显示。"><CloudPreferencesPanel sectionKey="general_preferences" initialValue={{ startPage: 'dashboard', timezone: 'auto', notifications: true, ...(settings.general_preferences || {}) }} fields={[{ key: 'startPage', label: '登录后的启动页面', description: '完成登录后默认打开的模块', type: 'select', options: [{ value: 'dashboard', label: 'Dashboard' }, { value: 'study', label: '学习计划' }, { value: 'time-management', label: '时间管理' }] }, { key: 'timezone', label: '时区', description: '自动跟随浏览器，或固定使用中国标准时间', type: 'select', options: [{ value: 'auto', label: '自动' }, { value: 'Asia/Shanghai', label: 'Asia/Shanghai' }] }, { key: 'notifications', label: '网站通知', description: '允许任务、专注和同步状态提醒', type: 'boolean' }]} /></Panel></>}
        {active === 'account' && (isGuest ? <Panel title="账户与安全" description="游客没有云端账户资料。"><Link href="/login?next=/settings" className="inline-flex items-center gap-2 rounded-xl bg-[#1a73e8] px-4 py-2.5 text-sm font-semibold text-white"><span className="material-icons-round text-lg">login</span>登录或注册</Link></Panel> : <><Panel title="个人资料"><ProfileEditor initialName={props.displayName} initialAvatar={props.avatarUrl} userId={props.userId} /></Panel><Panel title="账户安全"><ChangePasswordPanel hasPassword={props.hasPassword} /><Link href="/reset-password" className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[#1a73e8]"><span className="material-icons-round text-lg">email</span>通过邮件重置密码</Link></Panel></>)}
        {active === 'appearance' && <><Panel title="外观" description="修改会先保留为草稿，点击保存后才应用并同步。"><CloudPreferencesPanel sectionKey="appearance_preferences" initialValue={{ theme: 'light', density: 'comfortable', reducedMotion: false, showFullscreen: true, ...(settings.appearance_preferences || {}) }} fields={[{ key: 'theme', label: '主题', description: '选择亮色、灰色或深色界面', type: 'select', options: [{ value: 'light', label: '亮色' }, { value: 'gray', label: '灰色' }, { value: 'dark', label: '深色' }] }, { key: 'density', label: '界面密度', description: '调整列表和卡片的间距', type: 'select', options: [{ value: 'comfortable', label: '舒适' }, { value: 'compact', label: '紧凑' }] }, { key: 'reducedMotion', label: '减少动态效果', description: '减少页面转场和悬浮动画；默认关闭', type: 'boolean' }, { key: 'showFullscreen', label: '全屏按钮', description: '在顶栏显示全屏切换按钮；新设备默认开启', type: 'boolean' }]} /></Panel><Panel title="AI 界面微调" description="让 AI 输出安全的界面状态来改变外观，不控制 AI 助手的显示。"><AiVisibilityControl /></Panel></>}
        {active === 'navigation' && <Panel title="侧边栏与导航" description="拖拽调整分组和项目；固定项目优先，自适应只在组内排序。"><SidebarPrefsPanel initialPrefs={props.sidebarPrefs} /></Panel>}
        {active === 'companion' && (isGuest ? <Panel title="Companion 与同步" description="登录后才能使用跨设备同步。"><Link href="/login?next=/settings?section=companion" className="inline-flex rounded-xl bg-[#1a73e8] px-4 py-2.5 text-sm font-semibold text-white">登录后管理同步</Link></Panel> : <><Panel title="网页与 PWA 同步" description="修改会先持久保存在本机；断线恢复后自动上传，冲突不会被静默覆盖。"><SyncCenterPanel /></Panel><Panel title="Companion 扩展" description="管理扩展设备、有效时间统计和同步隐私。"><CompanionSettingsPanel initialPreferences={settings.companion_preferences || {}} devices={props.companionDevices} /></Panel></>)}
        {active === 'learning' && <><Panel title="每日学习目标"><CloudPreferencesPanel sectionKey="companion_preferences" initialValue={{ enabled: true, countAI: true, idleSeconds: 60, goalMinutes: 120, retentionDays: 365, savePageTitles: false, ...(settings.companion_preferences || {}) }} fields={[{ key: 'goalMinutes', label: '每日学习目标', description: 'Dashboard 与 Companion 使用同一目标', type: 'number', min: 10, max: 1440 }]} /></Panel><Panel title="提醒与专注"><CloudPreferencesPanel sectionKey="learning_preferences" initialValue={{ streakReminder: true, focusNotifications: true, quizUiLanguage: 'zh', quizAnswerLanguage: 'zh_kw_en', quizFeedbackLevel: 'normal', ...(settings.learning_preferences || {}) }} fields={[{ key: 'streakReminder', label: '连续学习提醒', description: '当天目标尚未完成时提醒', type: 'boolean' }, { key: 'focusNotifications', label: '专注完成通知', description: '番茄钟结束时发送通知', type: 'boolean' }]} /></Panel><QuizLanguageSectionWrapper /></>}
        {active === 'ai' && <><Panel title="平台额度" description="平台云端 API 按输入 Token + 输出 Token × 2 计费；个人 Key 不消耗套餐额度。"><AiQuotaCard value={props.aiQuota} /></Panel><Panel title="AI 配置" description="可选择管理员提供的云端 API，或使用自己的加密 API Key。"><AiConfigPanel initialBaseUrl={props.aiConfig.baseUrl} initialApiKey={props.aiConfig.apiKey} initialModel={props.aiConfig.model} initialProviderMode={props.aiConfig.providerMode} /></Panel><Panel title="语音"><TtsConfigPanel /></Panel></>}
        {active === 'data' && <Panel title="数据与隐私" description={isGuest ? '游客数据存储在当前浏览器的本地空间中。' : '导出账户数据，检查同步范围和数据保留。'}>{isGuest ? <p className="text-sm leading-6 text-[var(--muted-foreground)]">登录后，非敏感学习数据会自动合并到云端。API Key、密码、登录令牌和设备标识始终排除在通用同步之外。</p> : <ExportDataPanel />}</Panel>}
        {active === 'advanced' && <><Panel title="高级设置" description="发布通道由管理员邀请和你的明确同意共同决定；收到 BETA 邀请时系统会显示测试协议。"><CloudPreferencesPanel sectionKey="advanced_preferences" initialValue={{ diagnostics: false, ...(settings.advanced_preferences || {}) }} fields={[{ key: 'diagnostics', label: '诊断信息', description: '发生错误时保存不含正文和密码的技术信息', type: 'boolean' }]} /></Panel><BugReportPanel /><LoggerViewerWrapper /></>}
        {active === 'about' && <><Panel title="关于 JackYun Portal"><div className="flex items-center gap-4"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e8f0fe] font-bold text-[#1a73e8]">JY</div><div><strong>JackYun Portal</strong><p className="text-sm text-[var(--muted-foreground)]">版本 v{APP_VERSION}</p></div></div><Link href="/update" className="mt-5 inline-flex rounded-xl border border-[var(--card-border)] px-4 py-2 text-sm font-semibold">查看更新历史</Link></Panel>{!isGuest && <DeleteAccountPanel />}</>}
      </main>
    </div>
  </div>;
}
