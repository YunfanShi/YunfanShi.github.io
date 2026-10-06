export const ANNOUNCEMENT_CATEGORIES = { general: '公告', update: '更新', bug: 'BUG / 故障', maintenance: '维护', feature: '新功能', event: '活动' } as const;
export const ANNOUNCEMENT_PRIORITIES = { normal: '普通', important: '重要', urgent: '紧急' } as const;
export const INCIDENT_STATUSES = { none: '无', investigating: '排查中', identified: '已定位', monitoring: '观察中', resolved: '已恢复' } as const;
export const ANNOUNCEMENT_PAGES = [
  ['/dashboard', '首页'], ['/schedule', 'Schedule / CUE'], ['/study', '学习'], ['/reading', '阅读'], ['/ai', 'AI'], ['/music', '音乐'], ['/memory', '记忆'], ['/vocab', '词汇'], ['/quiz', '题库'], ['/resources', '资源'], ['/tools', '工具'], ['/settings', '设置'], ['/help', '帮助'],
] as const;
export interface AnnouncementOptions {
  category?: keyof typeof ANNOUNCEMENT_CATEGORIES;
  priority?: keyof typeof ANNOUNCEMENT_PRIORITIES;
  is_pinned?: boolean;
  scope_type?: 'global' | 'pages';
  target_paths?: string[];
  incident_status?: keyof typeof INCIDENT_STATUSES;
  action_label?: string | null;
  action_url?: string | null;
  revision?: number;
  notify_again?: boolean;
}
export interface AnnouncementRecord extends AnnouncementOptions {
  id: string; is_active: boolean; start_time: string | null; end_time: string | null;
  created_at: string; recipient_user_id?: string | null;
}
const validPath = (path: string) => /^\/(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)?$/.test(path);
export function announcementMatchesPath(item: AnnouncementOptions, pathname: string) {
  if (item.scope_type !== 'pages') return true;
  const path = pathname.split(/[?#]/)[0].replace(/\/$/, '') || '/';
  return (item.target_paths ?? []).some(target => path === target || (target !== '/' && path.startsWith(`${target}/`)));
}
export function announcementPhase(item: Pick<AnnouncementRecord, 'is_active' | 'start_time' | 'end_time'>, now = Date.now()) {
  if (!item.is_active) return 'disabled';
  if (item.start_time && Date.parse(item.start_time) > now) return 'scheduled';
  if (item.end_time && Date.parse(item.end_time) <= now) return 'expired';
  return 'live';
}
export function sortAnnouncements<T extends AnnouncementRecord>(items: T[]): T[] {
  const weights = { normal: 0, important: 1, urgent: 2 };
  return items.toSorted((a, b) => Number(Boolean(b.is_pinned)) - Number(Boolean(a.is_pinned)) || weights[b.priority ?? 'normal'] - weights[a.priority ?? 'normal'] || b.created_at.localeCompare(a.created_at));
}
export function announcementDismissalKey(item: Pick<AnnouncementRecord, 'id' | 'revision'>) { return `${item.id}@${item.revision ?? 1}`; }
export function safeAnnouncementLink(value: string): boolean {
  if (value.startsWith('/')) return !value.startsWith('//') && !/[\\\s]/.test(value);
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}
export function validateAnnouncement<T extends AnnouncementOptions & { title: string; content: string; start_time: string | null; end_time: string | null }>(input: T) {
  if (!input.title.trim() && !input.content.trim()) throw new Error('请输入标题或内容');
  if (input.category && !Object.hasOwn(ANNOUNCEMENT_CATEGORIES, input.category)) throw new Error('无效的公告分类');
  if (input.priority && !Object.hasOwn(ANNOUNCEMENT_PRIORITIES, input.priority)) throw new Error('无效的公告优先级');
  if (input.incident_status && !Object.hasOwn(INCIDENT_STATUSES, input.incident_status)) throw new Error('无效的故障状态');
  if (input.scope_type && !['global', 'pages'].includes(input.scope_type)) throw new Error('无效的显示范围');
  const paths = [...new Set((input.target_paths ?? []).map(path => path.trim().replace(/\/$/, '') || '/'))];
  if (paths.length > 30 || paths.some(path => !validPath(path))) throw new Error('页面路径应为 /schedule 这样的站内路径，最多 30 个');
  if (input.scope_type === 'pages' && !paths.length) throw new Error('请至少选择一个显示页面');
  for (const time of [input.start_time, input.end_time]) if (time && !Number.isFinite(Date.parse(time))) throw new Error('无效的生效时间');
  if (input.start_time && input.end_time && Date.parse(input.end_time) <= Date.parse(input.start_time)) throw new Error('结束时间必须晚于开始时间');
  const action_url = input.action_url?.trim() || null;
  const action_label = input.action_label?.trim() || null;
  if (Boolean(action_url) !== Boolean(action_label)) throw new Error('操作链接和按钮文字必须一起填写');
  if (action_url && !safeAnnouncementLink(action_url)) throw new Error('操作链接必须为站内路径或 HTTPS 地址');
  return { ...input, title: input.title.trim(), category: input.category ?? 'general', priority: input.priority ?? 'normal', is_pinned: input.is_pinned === true, scope_type: input.scope_type ?? 'global', target_paths: input.scope_type === 'pages' ? paths : [], incident_status: input.incident_status ?? 'none', action_label, action_url };
}
/** HTML datetime-local inputs use the user's local wall time, rather than UTC slicing. */
export function announcementLocalTime(iso: string | null) {
  if (!iso) return '';
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
