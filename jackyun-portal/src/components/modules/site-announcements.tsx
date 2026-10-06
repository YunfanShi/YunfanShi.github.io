'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { createPortal } from 'react-dom';
import { getActiveNotifications, dismissNotification } from '@/actions/admin';
import type { SiteNotification } from '@/types';
import { useAuthMode } from '@/components/auth/auth-mode-provider';
import { announcementDismissalKey, announcementMatchesPath, announcementPhase, safeAnnouncementLink } from '@/lib/announcements';
import { AnnouncementBadge, AnnouncementAction } from './announcement-content';
import MarkdownRenderer from './markdown-renderer';

export default function SiteAnnouncements() {
  const { signedIn, userId } = useAuthMode();
  const pathname = usePathname();
  const [loaded, setLoaded] = useState<{ userId: string | null; items: SiteNotification[] }>({ userId: null, items: [] });
  const dialogRef = useRef<HTMLDivElement>(null);
  const storageKey = `site_notification_dismissed:${userId}`;
  const localDismissed = useCallback((): Set<string> => {
    try { const raw = JSON.parse(localStorage.getItem(storageKey) ?? '[]'); return new Set(Array.isArray(raw) ? raw.filter(value => typeof value === 'string') : []); } catch { return new Set(); }
  }, [storageKey]);
  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const items = await getActiveNotifications(pathname);
        if (!cancelled) { const hidden = localDismissed(); setLoaded({ userId, items: items.filter(item => !hidden.has(announcementDismissalKey(item))) }); }
      } catch { /* Keep loaded notices during a short connection failure. */ }
    };
    void refresh();
    const timer = window.setInterval(refresh, 60_000);
    const dismissed = (event: Event) => {
      const detail = (event as CustomEvent<string | string[]>).detail;
      const ids = new Set(Array.isArray(detail) ? detail : [detail]);
      setLoaded(state => ({ ...state, items: state.items.filter(item => !ids.has(item.id)) }));
    };
    window.addEventListener('jackyun:notification-dismissed', dismissed);
    window.addEventListener('storage', refresh);
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener('jackyun:notification-dismissed', dismissed); window.removeEventListener('storage', refresh); };
  }, [signedIn, userId, pathname, localDismissed]);
  const visible = signedIn && loaded.userId === userId ? loaded.items.filter(item => announcementMatchesPath(item, pathname) && announcementPhase(item) === 'live') : [];
  const notices = visible.filter(item => item.delivery_type === 'notice');
  const banners = visible.filter(item => item.delivery_type === 'banner');
  const current = notices[0];
  const close = useCallback((item: SiteNotification) => {
    const hidden = localDismissed(); hidden.add(announcementDismissalKey(item));
    try { localStorage.setItem(storageKey, JSON.stringify([...hidden].slice(-1000))); } catch { /* Session state still hides the notice. */ }
    setLoaded(state => ({ ...state, items: state.items.filter(entry => entry.id !== item.id) }));
    window.dispatchEvent(new CustomEvent('jackyun:notification-dismissed', { detail: item.id }));
    void dismissNotification(item.id).catch(() => {});
  }, [localDismissed, storageKey]);
  const currentId = current?.id;
  const currentRevision = current?.revision;
  useEffect(() => {
    if (!currentId) return;
    const before = document.activeElement;
    dialogRef.current?.querySelector<HTMLElement>('button, a')?.focus();
    return () => { if (before instanceof HTMLElement && before.isConnected) before.focus(); };
  }, [currentId, currentRevision]);
  return <>
    {banners.length > 0 && <section aria-label="当前页面公告" className="max-h-[28dvh] shrink-0 overflow-y-auto border-b border-[var(--card-border)] bg-[var(--card)] px-3 py-2 sm:px-6">
      {banners.map(item => <article key={item.id} className={`flex items-start gap-3 rounded-lg border-l-4 p-3 ${item.priority === 'urgent' ? 'border-red-500 bg-red-500/5' : 'border-blue-500 bg-blue-500/5'}`}>
        <div className="min-w-0 flex-1"><AnnouncementBadge notification={item} /><h2 className="mt-1 text-sm font-semibold">{item.title}</h2><div className="mt-1 text-sm"><MarkdownRenderer content={item.content} /></div><AnnouncementAction notification={item} /></div>
        <button type="button" aria-label={`关闭公告：${item.title}`} onClick={() => close(item)} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg hover:bg-black/5">×</button>
      </article>)}
    </section>}
    {current && createPortal(<div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/55 p-3 backdrop-blur-sm" onClick={event => { if (event.target === event.currentTarget) close(current); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="announcement-title" className="flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-2xl" onKeyDown={event => {
        event.stopPropagation();
        if (event.key === 'Escape') { event.preventDefault(); close(current); }
        if (event.key === 'Tab') {
          const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button, a[href]')];
          if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus(); }
          else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0]?.focus(); }
        }
      }}>
        <header className="flex items-start justify-between gap-4 border-b border-[var(--card-border)] p-5"><div><AnnouncementBadge notification={current} /><h2 id="announcement-title" className="mt-2 text-lg font-bold">{current.title || '公告'}</h2></div><button type="button" onClick={() => close(current)} aria-label="关闭公告" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-black/5">×</button></header>
        <div className="min-h-0 overflow-y-auto p-5"><MarkdownRenderer content={current.content} /></div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--card-border)] p-4"><span className="text-xs text-[var(--muted-foreground)]">{notices.length > 1 ? `还有 ${notices.length - 1} 条公告` : '已读公告可在通知中心的历史中查看'}</span><div className="flex items-center gap-3">{current.action_url && safeAnnouncementLink(current.action_url) && <a href={current.action_url} onClick={() => close(current)} className="text-sm font-semibold text-[var(--brand)]">{current.action_label}</a>}<button type="button" onClick={() => close(current)} className="rounded-lg bg-[#4285F4] px-5 py-2 text-sm font-semibold text-white">{notices.length > 1 ? '下一条' : '我知道了'}</button></div></footer>
      </div>
    </div>, document.body)}
  </>;
}
