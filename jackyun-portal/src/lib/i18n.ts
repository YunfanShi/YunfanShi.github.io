export type Language = 'zh' | 'en';

export const STORAGE_KEY = 'jackyun_language';
export const DEFAULT_LANGUAGE: Language = 'zh';

export function getStoredLanguage(): Language {
  if (typeof window === 'undefined') return DEFAULT_LANGUAGE;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'en' || stored === 'zh') return stored;
  return DEFAULT_LANGUAGE;
}

export function storeLanguage(lang: Language): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, lang);
  }
}

type TranslationMap = Record<string, { zh: string; en: string }>;

const translations: TranslationMap = {
  // ── Sidebar nav items ──
  'nav.dashboard':            { zh: 'Dashboard',            en: 'Dashboard' },
  'nav.study-plan':           { zh: '学习计划',             en: 'Study Plan' },
  'nav.study-guide':          { zh: 'StudyGuide',           en: 'StudyGuide' },
  'nav.vocab':                { zh: '词汇宝库',             en: 'Vocab Treasury' },
  'nav.music-player':         { zh: '音乐播放器',           en: 'Music Player' },
  'nav.music-sync':           { zh: '同步音乐',             en: 'Sync Music' },
  'nav.bilibili-sync':        { zh: 'B站同步',              en: 'Bilibili Sync' },
  'nav.poem':                 { zh: '诗词天地',             en: 'Poetry' },
  'nav.countdown':            { zh: '倒计日',               en: 'Countdown' },
  'nav.relax':                { zh: '放松一下',             en: 'Relax' },
  'nav.schedule':             { zh: '日程',                 en: 'Schedule' },
  'nav.answer-sheet':         { zh: '答题卡',               en: 'Answer Sheet' },
  'nav.answer-sheet-sync':    { zh: '同步答题卡',           en: 'Sync Answer Sheet' },
  'nav.goal':                 { zh: '计划显示器',           en: 'Goal Display' },
  'nav.time-management':      { zh: '时间管理',             en: 'Time Management' },
  'nav.countdown-old':        { zh: '倒计日',               en: 'Countdown' },
  'nav.exam-countdown':       { zh: '倒计时',               en: 'Countdown' },
  'nav.pomodoro':             { zh: '番茄钟',               en: 'Pomodoro' },
  'nav.mock':                 { zh: 'Mock 刷题',            en: 'Mock Practice' },
  'nav.quizwise':             { zh: 'QuizWise 刷题',        en: 'QuizWise' },
  'nav.md2word':              { zh: 'Markdown → Word',      en: 'Markdown → Word' },
  'nav.tools':                { zh: '工具箱',               en: 'Tools' },
  'nav.settings':             { zh: '设置',                 en: 'Settings' },
  'nav.update':               { zh: '更新',                 en: 'Update' },
  'nav.admin':                { zh: '管理员',               en: 'Admin' },

  // ── Topbar ──
  'topbar.brand':             { zh: 'JackYun Portal',       en: 'JackYun Portal' },
  'topbar.exit-fullscreen':   { zh: '退出全屏',             en: 'Exit Fullscreen' },
  'topbar.fullscreen':        { zh: '全屏模式',             en: 'Fullscreen' },
  'topbar.logout':            { zh: '退出',                 en: 'Logout' },
  'topbar.login':             { zh: '登录 / 注册',          en: 'Sign In / Register' },

  // ── Settings page ──
  'settings.title':           { zh: '设置',                 en: 'Settings' },
  'settings.subtitle':        { zh: '账户与应用配置',       en: 'Account & App Configuration' },
  'settings.section.profile': { zh: '个人资料',             en: 'Profile' },
  'settings.section.security':{ zh: '账户安全',             en: 'Account Security' },
  'settings.section.ai':      { zh: 'AI 配置',              en: 'AI Configuration' },
  'settings.section.ai-desc': { zh: '配置一次即可在全站使用 AI 功能。支持 OpenAI、DeepSeek、Gemini 等兼容接口。', en: 'Configure once to use AI across the entire site. Supports OpenAI, DeepSeek, Gemini, and compatible interfaces.' },
  'settings.section.ui':      { zh: '界面设置',             en: 'UI Settings' },
  'settings.section.sidebar': { zh: '模块显示偏好',         en: 'Module Display Preferences' },
  'settings.section.voice':   { zh: '语音设置',             en: 'Voice Settings' },
  'settings.section.changelog':{ zh: '更新日志',            en: 'Changelog' },
  'settings.section.changelog-desc':{ zh: '查看 JackYun Portal 的版本更新历史。', en: 'View the version history of JackYun Portal.' },
  'settings.view-changelog':  { zh: '查看更新历史',         en: 'View Changelog' },
  'settings.section.about':   { zh: '关于',                 en: 'About' },
  'settings.section.data':    { zh: '数据管理',             en: 'Data Management' },
  'settings.section.data-desc':{ zh: '导出你的所有数据，包括词汇、学习计划、诗词等。', en: 'Export all your data, including vocabulary, study plans, poems, etc.' },
  'settings.reset-password':  { zh: '通过邮件重置密码',     en: 'Reset Password via Email' },

  // ── Sidebar first-time dialog ──
  'sidebar.first-time.title':   { zh: '欢迎使用 JackYun Portal', en: 'Welcome to JackYun Portal' },
  'sidebar.first-time.desc':    { zh: '请选择你偏好的模块版本，之后可以在设置中随时更改。', en: 'Choose your preferred module versions. You can change them anytime in Settings.' },
  'sidebar.first-time.music':   { zh: '🎵 音乐模块',       en: '🎵 Music Module' },
  'sidebar.first-time.player':  { zh: '音乐播放器',         en: 'Music Player' },
  'sidebar.first-time.sync':    { zh: '同步音乐',           en: 'Sync Music' },
  'sidebar.first-time.answer':  { zh: '📝 答题卡模块',      en: '📝 Answer Sheet Module' },
  'sidebar.first-time.standard':{ zh: '答题卡',             en: 'Answer Sheet' },
  'sidebar.first-time.answer-sync':{ zh: '同步答题卡',      en: 'Sync Answer Sheet' },
  'sidebar.first-time.skip':    { zh: '跳过',               en: 'Skip' },
  'sidebar.first-time.confirm': { zh: '确认',               en: 'Confirm' },

  // ── Language switcher ──
  'language.title':           { zh: '语言 / Language',       en: '语言 / Language' },
  'language.current':         { zh: '当前语言',             en: 'Current Language' },
  'language.switch-to':       { zh: '切换到',               en: 'Switch to' },
  'language.zh':              { zh: '中文',                 en: 'Chinese' },
  'language.en':              { zh: '英文',                 en: 'English' },
  'language.changed':         { zh: '语言已切换为 ',        en: 'Language switched to ' },
};

export function t(key: string, lang: Language): string {
  const entry = translations[key];
  if (!entry) return key;
  return entry[lang] ?? key;
}

export function getAllKeys(): string[] {
  return Object.keys(translations);
}