import type { SiteNotification } from '@/types';

export interface NotificationSnapshot {
  items: SiteNotification[];
  unreadCount: number;
  hasMore: boolean;
  nextOffset: number;
}
export const EMPTY_NOTIFICATION_SNAPSHOT: NotificationSnapshot = { items: [], unreadCount: 0, hasMore: false, nextOffset: 0 };
export const NOTIFICATION_REFRESH_MS = 60_000;

export function notificationRefreshDue(now: number, lastAttempt: number, visible: boolean, online: boolean) {
  return visible && online && now - lastAttempt >= NOTIFICATION_REFRESH_MS;
}
