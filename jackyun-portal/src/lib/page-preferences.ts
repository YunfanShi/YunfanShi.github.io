import { NAVIGATION_ITEMS } from './navigation.ts';

export const PAGE_PREFERENCE_KEY = 'jackyun_settings_page_preferences';
export const PREFERENCES_CHANGED = 'jackyun-preferences-changed';
export const SETTINGS_PENDING_KEY = 'jackyun_settings_pending_v1';
export const PAGE_PROFILES: Array<{ id: string; href: string; label?: string }> = [
  ...NAVIGATION_ITEMS.filter(item => !item.adminOnly && !item.betaOnly).map(item => ({ id: item.id, href: item.href })),
  { id: 'definitions', href: '/definitions', label: '定义练习' },
  { id: 'pomodoro', href: '/pomodoro', label: '番茄钟' },
  { id: 'igcountdown', href: '/igcountdown', label: 'IGCSE 计时器' },
  { id: 'poem', href: '/poem', label: '诗词练习' },
  { id: 'md2word', href: '/md2word', label: 'Markdown 转 Word' },
  { id: 'countdown', href: '/countdown', label: '倒计时' },
  { id: 'properties', href: '/properties', label: '性质卡片' },
  { id: 'control-focus', href: '/control/focus', label: '专注控制' },
  { id: 'timetable-hub', href: '/timetable-hub', label: '课表中心' },
  { id: 'examcountdown', href: '/examcountdown', label: '考试倒计时' },
  { id: 'study-tasks', href: '/study/tasks', label: '学习任务' },
];
export function sanitizePagePreferences(value: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { intentPrefetch: value.intentPrefetch !== false };
  for (const page of PAGE_PROFILES) {
    result[`${page.id}:size`] = value[`${page.id}:size`] === 'large' ? 'large' : 'normal';
    result[`${page.id}:width`] = value[`${page.id}:width`] === 'reading' ? 'reading' : 'full';
    result[`${page.id}:spacing`] = value[`${page.id}:spacing`] === 'compact' ? 'compact' : 'comfortable';
    result[`${page.id}:motion`] = value[`${page.id}:motion`] !== false;
  }
  return result;
}
