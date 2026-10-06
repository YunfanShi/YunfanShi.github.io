'use client';

import type { AnnouncementOptions } from '@/lib/announcements';
import { ANNOUNCEMENT_CATEGORIES, ANNOUNCEMENT_PRIORITIES, INCIDENT_STATUSES, safeAnnouncementLink } from '@/lib/announcements';

export function AnnouncementBadge({ notification: item }: { notification: AnnouncementOptions }) {
  return <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium"><span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-blue-600 dark:text-blue-300">{ANNOUNCEMENT_CATEGORIES[item.category ?? 'general']}</span>{item.priority && item.priority !== 'normal' && <span className={`rounded-full px-2 py-0.5 ${item.priority === 'urgent' ? 'bg-red-500/10 text-red-600 dark:text-red-300' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'}`}>{ANNOUNCEMENT_PRIORITIES[item.priority]}</span>}{item.is_pinned && <span>置顶</span>}{item.incident_status && item.incident_status !== 'none' && <span className={`rounded-full px-2 py-0.5 ${item.incident_status === 'resolved' ? 'bg-green-500/10 text-green-700 dark:text-green-300' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'}`}>{INCIDENT_STATUSES[item.incident_status]}</span>}</div>;
}
export function AnnouncementAction({ notification: item }: { notification: AnnouncementOptions }) {
  return item.action_url && item.action_label && safeAnnouncementLink(item.action_url) ? <a className="mt-2 inline-block text-sm font-semibold text-[var(--brand)] underline" href={item.action_url}>{item.action_label}</a> : null;
}
