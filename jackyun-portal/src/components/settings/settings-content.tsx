'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import type { CompanionDeviceView } from '@/components/settings/companion-settings-panel';
import type { SidebarPreferences } from '@/actions/settings';
import { APP_VERSION } from '@/lib/utils';
import type { AiQuotaSummary } from '@/components/settings/ai-quota-card';
import type { FeatureAccess } from '@/actions/reader';
import BrandLogo from '@/components/brand-logo';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

function SettingsPanelLoading() {
  return <div role="status" aria-live="polite" className="rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-5 text-sm text-[var(--muted-foreground)]">正在加载设置模块…</div>;
}

const PagePreferencesPanel = dynamic(() => import('@/components/settings/page-preferences-panel'), { loading: SettingsPanelLoading });
const OfflineSettingsPanel = dynamic(() => import('@/components/settings/offline-settings-panel'), { loading: SettingsPanelLoading });
const WorkspaceIdleSettings = dynamic(() => import('@/components/settings/workspace-idle-settings'), { loading: SettingsPanelLoading });
const ProfileEditor = dynamic(() => import('@/components/settings/profile-editor'), { loading: SettingsPanelLoading });
const ChangePasswordPanel = dynamic(() => import('@/components/admin/change-password-panel'), { loading: SettingsPanelLoading });
const AiConfigPanel = dynamic(() => import('@/components/settings/ai-config-panel'), { loading: SettingsPanelLoading });
const QuizLanguageSectionWrapper = dynamic(() => import('@/components/settings/quiz-language-section'), { loading: SettingsPanelLoading });
const LoggerViewerWrapper = dynamic(() => import('@/components/settings/logger-viewer-wrapper'), { loading: SettingsPanelLoading });
const DeleteAccountPanel = dynamic(() => import('@/components/settings/delete-account-panel'), { loading: SettingsPanelLoading });
const SidebarPrefsPanel = dynamic(() => import('@/components/settings/sidebar-prefs-panel'), { loading: SettingsPanelLoading });
const TtsConfigPanel = dynamic(() => import('@/components/settings/tts-config-panel'), { loading: SettingsPanelLoading });
const LanguageSwitcher = dynamic(() => import('@/components/settings/language-switcher'), { loading: SettingsPanelLoading });
const BackupCenterPanel = dynamic(() => import('@/components/settings/backup-center-panel'), { loading: SettingsPanelLoading });
const ExportDataPanel = dynamic(() => import('@/components/settings/export-data-panel'), { loading: SettingsPanelLoading });
const ScheduleBackupsPanel = dynamic(() => import('@/components/settings/schedule-backups-panel'), { loading: SettingsPanelLoading });
const BugReportPanel = dynamic(() => import('@/components/settings/bug-report-panel'), { loading: SettingsPanelLoading });
const CloudPreferencesPanel = dynamic(() => import('@/components/settings/cloud-preferences-panel'), { loading: SettingsPanelLoading });
const CompanionSettingsPanel = dynamic(() => import('@/components/settings/companion-settings-panel'), { loading: SettingsPanelLoading });
const SyncCenterPanel = dynamic(() => import('@/components/settings/sync-center-panel'), { loading: SettingsPanelLoading });
const AiQuotaCard = dynamic(() => import('@/components/settings/ai-quota-card'), { loading: SettingsPanelLoading });
const AiVisibilityControl = dynamic(() => import('@/components/settings/ai-visibility-control'), { loading: SettingsPanelLoading });
const RedemptionCenter = dynamic(() => import('@/components/settings/redemption-center'), { loading: SettingsPanelLoading });
const WatchSettingsPanel = dynamic(() => import('@/components/settings/watch-settings-panel'), { loading: SettingsPanelLoading });
const AccountConnectionsPanel = dynamic(() => import('@/components/settings/account-connections-panel'), { loading: SettingsPanelLoading });

const categories = [
  { id: 'general', label: '常规', icon: 'tune', keywords: '语言 时区 启动 通知' },
  { id: 'pages', label: '各页面偏好', icon: 'dashboard_customize', keywords: '页面 字号 阅读 宽度 密度 动画 网络 预加载' },
  { id: 'offline', label: '离线与 PWA', icon: 'offline_bolt', keywords: '缓存 下载 网络 离线 PWA 安装' },
  { id: 'account', label: '账户与安全', icon: 'manage_accounts', keywords: '头像 密码 个人资料 登录' },
  { id: 'watch', label: '手表与设备', icon: 'watch', keywords: 'Watch 华为 手表 扫码 配对 登录 设备 APK' },
  { id: 'connections', label: '账户关联', icon: 'link', keywords: '滴答清单 Dida365 第三方 任务 同步' },
  { id: 'redemption', label: '兑换码', icon: 'redeem', keywords: '兑换码 图书 会员 Plus Pro Ultra' },
  { id: 'appearance', label: '外观', icon: 'palette', keywords: '主题 动画 密度 全屏' },
  { id: 'navigation', label: '侧边栏与导航', icon: 'view_sidebar', keywords: '拖拽 顺序 隐藏 固定 自适应' },
  { id: 'companion', label: 'Companion 与同步', icon: 'devices', keywords: '扩展 设备 时间 同步 隐私' },
  { id: 'learning', label: '学习与专注', icon: 'school', keywords: '目标 番茄钟 Quiz 提醒 CUE 宇宙 冒险 游戏 动画 乱序' },
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
  aiConfig: import('@/lib/ai-config').AiConfig;
  displayName: string;
  avatarUrl: string;
  userId: string;
  sidebarPrefs: SidebarPreferences;
  cloudSettings: Record<string, Record<string, unknown>>;
  companionDevices: CompanionDeviceView[];
  initialSection?: string;
  initialWatchPair?: string;
  aiQuota: AiQuotaSummary;
  betaActive: boolean;
  redemptionAccess: FeatureAccess | null;
}

export default function SettingsContent(props: Props) {
  const isGuest = !props.userId;
  const redemptionVisible = props.redemptionAccess?.allowed === true;
  const [active, setActive] = useState<CategoryId>(() => categories.some((item) => item.id === props.initialSection) && (props.initialSection !== 'redemption' || redemptionVisible) ? props.initialSection as CategoryId : 'general');
  const [query, setQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const value = searchInputRef.current?.value ?? '';
    if (value) setQuery(value);
  }, []);
  function choose(id: CategoryId) { setActive(id); const url = new URL(location.href); url.searchParams.set('section', id); history.replaceState({}, '', url); }
  const visibleCategories = useMemo(() => { const needle = query.trim().toLowerCase(); return categories.filter((item) => (item.id !== 'redemption' || redemptionVisible) && (!needle || `${item.label} ${item.keywords}`.toLowerCase().includes(needle))); }, [query, redemptionVisible]);
  const settings = props.cloudSettings;

  return <div className="page-enter mx-auto max-w-7xl">
    <div className="mb-6"><h1 className="text-3xl font-bold tracking-[-.04em] text-[var(--foreground)]">设置</h1><p className="mt-1 text-sm text-[var(--muted-foreground)]">{isGuest ? '游客设置保存在当前设备；登录后自动合并并同步。' : '账户、外观、导航、同步和隐私设置会保存到你的 JackYun 账号。'}</p></div>
    {isGuest && <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-[#f9ab00]/40 bg-[#fef7e0] p-4 text-sm text-[#7a4b00] dark:bg-[#3d2f12] dark:text-[#fdd663] sm:flex-row sm:items-center sm:justify-between"><span><strong>当前为游客模式。</strong> 学习数据与偏好保存在此设备，不会自动出现在其他设备。</span><Link href="/login?next=/settings" className="shrink-0 rounded-xl bg-[#1a73e8] px-4 py-2 font-semibold text-white">登录并开启云同步</Link></div>}
    <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="min-w-0 self-start overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-3 lg:sticky lg:top-0 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto">
        <a href="/products" target="_blank" rel="noopener noreferrer" className="group mb-3 flex items-center gap-3 overflow-hidden rounded-2xl bg-[#101114] p-3 text-white shadow-[0_12px_30px_rgba(0,0,0,.16)] transition-transform hover:-translate-y-0.5">
          <BrandLogo size={40} className="h-10 w-10 shrink-0" />
          <span className="min-w-0 flex-1"><strong className="block text-sm">JackYun Products</strong><small className="mt-0.5 block text-xs text-[#a9abb3]">发现与安装产品</small></span>
          <span className="material-icons-round text-lg text-[#a9abb3] transition-transform group-hover:translate-x-0.5">arrow_outward</span>
        </a>
        <label className="flex items-center gap-2 rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5"><span className="material-icons-round text-lg text-[var(--muted-foreground)]">search</span><Input ref={searchInputRef} aria-label="搜索设置" defaultValue="" onChange={(event) => setQuery(event.target.value)} placeholder="搜索设置…" className="min-w-0 flex-1 border-0 bg-transparent px-0 text-sm shadow-none" /></label>
        <select aria-label="设置分类" value={active} onChange={(event) => choose(event.target.value as CategoryId)} className="mt-3 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-3 lg:hidden">{[...new Map([...(visibleCategories.some((item) => item.id === active) ? [] : categories.filter((item) => item.id === active && (item.id !== 'redemption' || redemptionVisible))), ...visibleCategories].map((item) => [item.id, item])).values()].map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
        <p role="status" className="mt-2 text-xs text-[var(--muted-foreground)]">{query && `${visibleCategories.length} 个匹配分类`}</p><nav className="mt-3 hidden space-y-1 lg:block">{visibleCategories.map((item) => <Button key={item.id} type="button" variant="ghost" onClick={() => choose(item.id)} aria-pressed={active === item.id} className={`flex w-full justify-start gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium ${active === item.id ? 'bg-[#e8f0fe] text-[#174ea6] hover:bg-[#e8f0fe] dark:bg-[#174ea6]/50 dark:text-[#d2e3fc] dark:hover:bg-[#174ea6]/50' : 'text-[var(--foreground)] hover:bg-[var(--background)]'}`}><span className="material-icons-round shrink-0 text-lg">{item.icon}</span><span className="min-w-0 flex-1">{item.label}</span></Button>)}</nav>
      </aside>
      <main className="min-w-0 space-y-5">
        {active === 'pages' && <Panel title="各页面偏好" description="每个页面独立调整；保存后立即生效，并在登录后同步到云端。"><PagePreferencesPanel initialValue={settings.page_preferences || {}} learning={settings.learning_preferences || {}} companion={settings.companion_preferences || {}} /></Panel>}
        {active === 'offline' && <Panel title="离线工作区" description="访问过的本地工作页面可在短时断网时继续使用。AI、云端图书与账号管理需要联网。"><OfflineSettingsPanel /></Panel>}
        {active === 'general' && <><Panel title="空闲休眠"><WorkspaceIdleSettings /></Panel><Panel title="语言"><LanguageSwitcher /></Panel><Panel title="常规" description="控制启动、通知和时间显示。"><CloudPreferencesPanel sectionKey="general_preferences" initialValue={{ startPage: 'dashboard', timezone: 'auto', notifications: true, ...(settings.general_preferences || {}) }} fields={[{ key: 'startPage', label: '登录后的启动页面', description: '完成登录后默认打开的模块', type: 'select', options: [{ value: 'dashboard', label: 'Dashboard' }, { value: 'study', label: '学习计划' }, { value: 'time-management', label: '时间管理' }] }, { key: 'timezone', label: '时区', description: '自动跟随浏览器，或固定使用中国标准时间', type: 'select', options: [{ value: 'auto', label: '自动' }, { value: 'Asia/Shanghai', label: 'Asia/Shanghai' }] }, { key: 'notifications', label: '网站通知', description: '允许任务、专注和同步状态提醒', type: 'boolean' }]} /></Panel></>}
        {active === 'watch' && <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 sm:p-6"><WatchSettingsPanel initialPair={props.initialWatchPair ?? ''} /><Link href="/products#watch" className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-[#1a73e8]">了解 JackYun Watch 与获取测试安装包 →</Link></div>}
        {active === 'account' && (isGuest ? <Panel title="账户与安全" description="游客没有云端账户资料。"><Link href="/login?next=/settings" className="inline-flex items-center gap-2 rounded-xl bg-[#1a73e8] px-4 py-2.5 text-sm font-semibold text-white"><span className="material-icons-round text-lg">login</span>登录或注册</Link></Panel> : <><Panel title="个人资料"><ProfileEditor initialName={props.displayName} initialAvatar={props.avatarUrl} userId={props.userId} /></Panel><Panel title="账户安全"><ChangePasswordPanel hasPassword={props.hasPassword} /><Link href="/reset-password" className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[#1a73e8]"><span className="material-icons-round text-lg">email</span>通过邮件重置密码</Link></Panel></>)}
        {active === 'connections' && (isGuest ? <Panel title="账户关联" description="登录后才能安全地保存第三方账户令牌。"><Link href="/login?next=/settings?section=connections" className="inline-flex rounded-xl bg-[#1a73e8] px-4 py-2.5 text-sm font-semibold text-white">登录后关联账户</Link></Panel> : <Panel title="账户关联" description="集中管理可供 JackYun 调用的外部账户；每次发送任务仍由你手动确认。"><AccountConnectionsPanel /></Panel>)}
        {active === 'redemption' && redemptionVisible && <Panel title="兑换码" description="兑换图书或会员权益；成功后会自动同步到同一账号的所有设备。"><RedemptionCenter signedIn={!isGuest} /></Panel>}
        {active === 'appearance' && <><Panel title="外观" description="修改会先保留为草稿，点击保存后才应用并同步。"><CloudPreferencesPanel sectionKey="appearance_preferences" initialValue={{ theme: 'light', density: 'comfortable', reducedMotion: false, dialogAnimations: false, showFullscreen: true, ...(settings.appearance_preferences || {}) }} fields={[{ key: 'theme', label: '主题', description: '选择亮色、灰色或深色界面', type: 'select', options: [{ value: 'light', label: '亮色' }, { value: 'gray', label: '灰色' }, { value: 'dark', label: '深色' }] }, { key: 'density', label: '界面密度', description: '调整列表和卡片的间距', type: 'select', options: [{ value: 'comfortable', label: '舒适' }, { value: 'compact', label: '紧凑' }] }, { key: 'reducedMotion', label: '减少动态效果', description: '减少页面转场和悬浮动画；默认关闭', type: 'boolean' }, { key: 'dialogAnimations', label: '弹窗与对话框动画', description: '关闭可减少弹窗开合与内容转场；默认关闭。', type: 'boolean' }, { key: 'showFullscreen', label: '全屏按钮', description: '在顶栏显示全屏切换按钮；新设备默认开启', type: 'boolean' }]} /></Panel><Panel title="AI 界面微调" description="让 AI 输出安全的界面状态来改变外观，不控制 AI 助手的显示。"><AiVisibilityControl /></Panel></>}
        {active === 'navigation' && <Panel title="侧边栏与导航" description="拖拽调整分组和项目；固定项目优先，自适应只在组内排序。"><SidebarPrefsPanel initialPrefs={props.sidebarPrefs} /></Panel>}
        {active === 'companion' && (isGuest ? <Panel title="Companion 与同步" description="登录后才能使用跨设备同步。"><Link href="/login?next=/settings?section=companion" className="inline-flex rounded-xl bg-[#1a73e8] px-4 py-2.5 text-sm font-semibold text-white">登录后管理同步</Link></Panel> : <><Panel title="网页与 PWA 同步" description="修改会先持久保存在本机；断线恢复后自动上传，冲突不会被静默覆盖。"><SyncCenterPanel /></Panel><Panel title="Companion 扩展" description="管理扩展设备、有效时间统计和同步隐私。"><CompanionSettingsPanel initialPreferences={settings.companion_preferences || {}} devices={props.companionDevices} betaActive={props.betaActive} /></Panel></>)}
        {active === 'learning' && <><Panel title="每日学习目标"><CloudPreferencesPanel sectionKey="companion_preferences" initialValue={{ enabled: true, countAI: true, idleSeconds: 60, goalMinutes: 120, retentionDays: 365, savePageTitles: false, ...(settings.companion_preferences || {}) }} fields={[{ key: 'goalMinutes', label: '每日学习目标', description: 'Dashboard 与 Companion 使用同一目标', type: 'number', min: 10, max: 1440 }]} /></Panel><Panel title="CUE 学习动效"><CloudPreferencesPanel sectionKey="learning_preferences" initialValue={{ cueItemMotion: true, cueCelebrationMotion: false, cueAmbientMotion: false, ...(settings.learning_preferences || {}) }} quickSets={[{ label: '全部开启', values: { cueItemMotion: true, cueCelebrationMotion: true, cueAmbientMotion: true } }, { label: '全部关闭', values: { cueItemMotion: false, cueCelebrationMotion: false, cueAmbientMotion: false } }, { label: '轻量默认', values: { cueItemMotion: true, cueCelebrationMotion: false, cueAmbientMotion: false } }]} fields={[{ key: 'cueItemMotion', label: '学习反馈小动效', description: '保留单条评价和计数的轻微反馈；默认开启。', type: 'boolean' }, { key: 'cueCelebrationMotion', label: '大型庆祝与粒子', description: '控制星空庆祝、全屏提示与粒子效果；默认关闭。', type: 'boolean' }, { key: 'cueAmbientMotion', label: '持续背景与星场动画', description: '控制长时间运行的星空背景动画；默认关闭。', type: 'boolean' }]} /></Panel><Panel title="提醒与专注"><CloudPreferencesPanel sectionKey="learning_preferences" initialValue={{ cueGameEnabled: false, cueShuffle: true, streakReminder: true, focusNotifications: true, quizUiLanguage: 'zh', quizAnswerLanguage: 'zh_kw_en', quizFeedbackLevel: 'normal', ...(settings.learning_preferences || {}) }} fields={[{ key: 'cueGameEnabled', label: 'CUE 宇宙冒险', description: '仅电脑端显示宇宙星场背景、逐条星光反馈、经验和成果收藏；默认关闭，不影响手机学习。', type: 'boolean' }, { key: 'cueShuffle', label: 'CUE 默认乱序', description: '默认开启；关闭后新学习按原顺序开始。已保存的学习进度保留原顺序。', type: 'boolean' }, { key: 'streakReminder', label: '连续学习提醒', description: '当天目标尚未完成时提醒', type: 'boolean' }, { key: 'focusNotifications', label: '专注完成通知', description: '番茄钟结束时发送通知', type: 'boolean' }]} /></Panel><QuizLanguageSectionWrapper /></>}
        {active === 'ai' && <><Panel title="平台额度" description="平台云端 API 按输入 Token + 输出 Token × 2 计费；个人 Key 不消耗套餐额度。"><AiQuotaCard value={props.aiQuota} /></Panel><Panel title="AI 配置" description="可选择管理员提供的云端 API、自己的加密 API Key，或人人可用的网页 AI 手动中转。"><AiConfigPanel initialBaseUrl={props.aiConfig.baseUrl} initialApiKey={props.aiConfig.apiKey} initialModel={props.aiConfig.model} initialProviderMode={props.aiConfig.providerMode ?? 'cloud'} initialBrowserProvider={props.aiConfig.browserProvider ?? 'chatgpt'} initialCompanionAutomation={props.aiConfig.companionAutomation === true} betaActive={props.betaActive} /></Panel><Panel title="语音"><TtsConfigPanel /></Panel></>}
        {active === 'data' && <><Panel title="v5 本机归档与备份中心" description={isGuest ? '完整 JSON 归档使用 v5 格式并保存在本机；登录后还可使用云端页面快照。' : '完整 JSON 归档使用 v5 格式，逐条校验 SHA-256；导入会先保存本机恢复点并将变更排入 v5。'}><BackupCenterPanel userId={props.userId || 'guest'} cloudEnabled={!isGuest} /></Panel>{!isGuest && <details className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4"><summary className="cursor-pointer text-sm font-semibold">历史云端表快照迁移</summary><p className="my-3 text-sm text-[var(--muted-foreground)]">仅用于读取尚未完成 v5 资源迁移的历史云端表数据；日常备份请使用上方 v5 归档。确认所有资源已迁入并核对哈希前，不删除这类历史数据。</p><ExportDataPanel /></details>}{!isGuest && <Panel title="历史 Schedule 快照" description="仅用于找回迁移前保留的数据，不参与日常同步。"><ScheduleBackupsPanel /></Panel>}</>}
        {active === 'advanced' && <><Panel title="高级设置" description="发布通道由管理员邀请和你的明确同意共同决定；收到 BETA 邀请时系统会显示测试协议。"><CloudPreferencesPanel sectionKey="advanced_preferences" initialValue={{ diagnostics: false, ...(settings.advanced_preferences || {}) }} fields={[{ key: 'diagnostics', label: '诊断信息', description: '发生错误时保存不含正文和密码的技术信息', type: 'boolean' }]} /></Panel><BugReportPanel /><LoggerViewerWrapper /></>}
        {active === 'about' && <><Panel title="关于 JackYun Portal"><div className="flex items-center gap-4"><BrandLogo size={48} className="h-12 w-12 shrink-0" /><div><strong>JackYun Portal</strong><p className="text-sm text-[var(--muted-foreground)]">版本 v{APP_VERSION}</p></div></div><Link href="/update" className="mt-5 inline-flex rounded-xl border border-[var(--card-border)] px-4 py-2 text-sm font-semibold">查看更新历史</Link></Panel>{!isGuest && <DeleteAccountPanel />}</>}
      </main>
    </div>
  </div>;
}
