export type NavigationGroupId = 'home' | 'learning' | 'practice' | 'time' | 'tools' | 'relax' | 'system';

export interface NavigationItem {
  id: string;
  labelKey: string;
  icon: string;
  href: string;
  group: NavigationGroupId;
  variantGroup?: 'music' | 'answerSheet';
  variant?: 'player' | 'sync' | 'standard';
  protected?: boolean;
  adminOnly?: boolean;
}

export const NAVIGATION_GROUPS: Array<{ id: NavigationGroupId; label: string; icon: string }> = [
  { id: 'home', label: '首页', icon: 'home' },
  { id: 'learning', label: '学习', icon: 'school' },
  { id: 'practice', label: '刷题与考试', icon: 'quiz' },
  { id: 'time', label: '时间与日程', icon: 'schedule' },
  { id: 'tools', label: '工具与扩展', icon: 'extension' },
  { id: 'relax', label: '媒体与放松', icon: 'sports_esports' },
  { id: 'system', label: '系统', icon: 'settings' },
];

export const NAVIGATION_ITEMS: NavigationItem[] = [
  { id: 'dashboard', labelKey: 'nav.dashboard', icon: 'dashboard', href: '/dashboard', group: 'home', protected: true },
  { id: 'study-plan', labelKey: 'nav.study-plan', icon: 'school', href: '/study', group: 'learning' },
  { id: 'goal', labelKey: 'nav.goal', icon: 'flag', href: '/goal', group: 'learning' },
  { id: 'study-guide', labelKey: 'nav.study-guide', icon: 'auto_stories', href: '/study-guide', group: 'learning' },
  { id: 'learning-resources', labelKey: 'nav.learning-resources', icon: 'travel_explore', href: '/resources', group: 'learning' },
  { id: 'vocab', labelKey: 'nav.vocab', icon: 'menu_book', href: '/vocab', group: 'learning' },
  { id: 'answer-sheet', labelKey: 'nav.answer-sheet', icon: 'content_paste', href: '/answer-sheet', group: 'practice', variantGroup: 'answerSheet', variant: 'standard' },
  { id: 'answer-sheet-sync', labelKey: 'nav.answer-sheet-sync', icon: 'sync', href: '/answer-sheet-sync', group: 'practice', variantGroup: 'answerSheet', variant: 'sync' },
  { id: 'mock', labelKey: 'nav.mock', icon: 'quiz', href: '/mock-portal', group: 'practice' },
  { id: 'quizwise', labelKey: 'nav.quizwise', icon: 'psychology', href: '/quiz', group: 'practice' },
  { id: 'time-management', labelKey: 'nav.time-management', icon: 'timer', href: '/time-management', group: 'time' },
  { id: 'activity', labelKey: 'nav.activity', icon: 'insights', href: '/activity', group: 'time' },
  { id: 'schedule', labelKey: 'nav.schedule', icon: 'calendar_month', href: '/control', group: 'time' },
  { id: 'tools', labelKey: 'nav.tools', icon: 'build', href: '/tools', group: 'tools' },
  { id: 'userscripts', labelKey: 'nav.userscripts', icon: 'extension', href: '/userscripts', group: 'tools' },
  { id: 'music-player', labelKey: 'nav.music-player', icon: 'music_note', href: '/music', group: 'relax', variantGroup: 'music', variant: 'player' },
  { id: 'music-sync', labelKey: 'nav.music-sync', icon: 'sync_alt', href: '/music-sync', group: 'relax', variantGroup: 'music', variant: 'sync' },
  { id: 'bilibili-sync', labelKey: 'nav.bilibili-sync', icon: 'smart_display', href: '/bilibili-sync', group: 'relax' },
  { id: 'poem', labelKey: 'nav.poem', icon: 'auto_stories', href: '/poem', group: 'relax' },
  { id: 'relax', labelKey: 'nav.relax', icon: 'sports_esports', href: '/relax', group: 'relax' },
  { id: 'settings', labelKey: 'nav.settings', icon: 'settings', href: '/settings', group: 'system', protected: true },
  { id: 'update', labelKey: 'nav.update', icon: 'history', href: '/update', group: 'system' },
  { id: 'help-center', labelKey: 'nav.help-center', icon: 'help', href: '/help', group: 'system' },
  { id: 'admin', labelKey: 'nav.admin', icon: 'admin_panel_settings', href: '/admin', group: 'system', protected: true, adminOnly: true },
];

export function navigationIdFromPath(pathname: string): string | null {
  return NAVIGATION_ITEMS.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))?.id ?? null;
}
