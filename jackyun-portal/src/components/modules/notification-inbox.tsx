'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AnnouncementBadge, AnnouncementAction } from './announcement-content';
import { announcementMatchesPath, announcementPhase } from '@/lib/announcements';
import { dismissNotification, dismissNotifications } from '@/actions/admin';
import { useAuthMode } from '@/components/auth/auth-mode-provider';
import { useNotificationSnapshot } from '@/lib/notification-client';
import type { NotificationSnapshot } from '@/lib/notification-snapshot';
import type { SiteNotification } from '@/types';

const MarkdownRenderer = dynamic(() => import('./markdown-renderer'), {
  loading: () => <p className="text-sm text-[var(--muted-foreground)]">正在渲染内容...</p>,
});
const SupportConversationDialog = dynamic(() => import('./support-conversation-dialog'), {
  loading: () => null,
});

function preview(content: string) {
  return content.replaceAll('#', '').replaceAll('*', '').replaceAll('_', '').replaceAll('`', '');
}

export default function NotificationInbox() {
  const pathname = usePathname();
  const { userId } = useAuthMode();
  const { snapshot, refresh: refreshSnapshot } = useNotificationSnapshot(userId);
  const [history, setHistory] = useState(false);
  const [open, setOpen] = useState(false);
  const [historyPage, setHistoryPage] = useState<(NotificationSnapshot & { userId: string }) | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selected, setSelected] = useState<SiteNotification | null>(null);
  const [chatTicket, setChatTicket] = useState<{ id: string; title: string } | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const knownIds = useRef(new Set<string>());
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const historyController = useRef<AbortController | null>(null);
  const items = history ? (historyPage?.userId === userId ? historyPage.items : []) : snapshot.items;
  const scopedItems = items.filter(item => !activeTicketId || item.related_ticket_id !== activeTicketId).filter(item => item.recipient_user_id || announcementMatchesPath(item, pathname));
  const unread = snapshot.items.filter(item => !item.is_read && (item.recipient_user_id || announcementMatchesPath(item, pathname))).length;

  const loadHistory = useCallback(async (offset = 0) => {
    if (historyController.current || !userId) return;
    const controller = new AbortController(); historyController.current = controller;
    setLoadingHistory(true);
    try {
      const response = await fetch(`/api/notifications/snapshot?history=1&offset=${offset}&reason=history`, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) return;
      const result = await response.json();
      if (result.userId !== userId || controller.signal.aborted) return;
      setHistoryPage(current => ({ ...result, items: offset ? [...(current?.items ?? []), ...result.items] : result.items }));
    } catch { /* Keep the loaded page on connection failure. */ }
    finally { if (historyController.current === controller) { historyController.current = null; setLoadingHistory(false); } }
  }, [userId]);

  useEffect(() => {
    const known = knownIds.current;
    const newMessages = known.size ? snapshot.items.filter(item => item.delivery_type === 'message' && !known.has(item.id) && item.related_ticket_id !== activeTicketId) : [];
    snapshot.items.forEach(item => known.add(item.id));
    if (newMessages.length && document.visibilityState === 'visible' && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification('JackYun 新消息', { body: newMessages[0].title, icon: '/Webicon.png' });
    }
  }, [snapshot, activeTicketId]);
  useEffect(() => {
    const timer = open && history ? window.setTimeout(() => void loadHistory(), 0) : undefined;
    return () => { window.clearTimeout(timer); historyController.current?.abort(); historyController.current = null; };
  }, [open, history, loadHistory]);
  useEffect(() => { knownIds.current = new Set(); }, [userId]);
  useEffect(() => {
    const handleSupportState = (event: Event) => {
      const detail = (event as CustomEvent<{ ticketId: string; open: boolean }>).detail;
      setActiveTicketId(detail.open ? detail.ticketId : null);
      if (!detail.open) void refreshSnapshot();
    };
    window.addEventListener('jackyun:support-state', handleSupportState);
    const handleDismissal = (event: Event) => {
      const ids = (event as CustomEvent<string | string[]>).detail;
      const dismissed = new Set(Array.isArray(ids) ? ids : [ids]);
      setHistoryPage(current => current ? { ...current, items: current.items.map(item => dismissed.has(item.id) ? { ...item, is_read: true } : item) } : null);
    };
    window.addEventListener('jackyun:notification-dismissed', handleDismissal);
    return () => {
      window.removeEventListener('jackyun:support-state', handleSupportState);
      window.removeEventListener('jackyun:notification-dismissed', handleDismissal);
    };
  }, [refreshSnapshot]);

  const openMessage = (item: SiteNotification) => {
    if (item.related_ticket_id) setChatTicket({ id: item.related_ticket_id, title: item.title });
    else setSelected(item);
    dismissNotification(item.id).then((result) => {
      if (!result.success) return;
      window.dispatchEvent(new CustomEvent('jackyun:notification-dismissed', { detail: item.id }));
    }).catch(() => {});
  };

  const removeMessage = async (item: SiteNotification) => {
    const result = await dismissNotification(item.id);
    if (!result.success) return;
    window.dispatchEvent(new CustomEvent('jackyun:notification-dismissed', { detail: item.id }));
    setSelected((current) => current?.id === item.id ? null : current);
  };

  const markAllRead = async () => {
    if (!items.length || markingAll) return;
    setMarkingAll(true);
    const result = await dismissNotifications(scopedItems.filter(item => !item.is_read).map((item) => item.id));
    setMarkingAll(false);
    if (!result.success) return;
    window.dispatchEvent(new CustomEvent('jackyun:notification-dismissed', { detail: scopedItems.map(item => item.id) }));
    setSelected(null);
  };

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-label="通知" className="relative grid h-11 w-11 place-items-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--background)] sm:h-9 sm:w-9">
        <span className="material-icons-round text-xl">notifications</span>
        {unread > 0 && <span className="absolute right-0 top-0 min-w-4 rounded-full bg-[#d92d20] px-1 text-[10px] font-bold leading-4 text-white">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-[var(--card-border)] bg-[var(--card)] shadow-xl">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--card-border)] px-4 py-3">
            <div><p className="font-semibold text-[var(--foreground)]">{history ? '此页公告与消息历史' : '通知'}</p><p className="text-[11px] text-[var(--muted-foreground)]">{unread} 条未读</p></div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setHistory(value => !value)} className="min-h-9 text-xs text-[#155eef]">{history ? '未读' : '历史'}</button>
              {unread > 0 && <button type="button" disabled={markingAll} onClick={markAllRead} className="min-h-9 rounded-lg px-2 text-xs font-medium text-[#155eef] hover:bg-[#eff4ff] disabled:opacity-50">{markingAll ? '处理中…' : '一键全读'}</button>}
              {typeof Notification !== 'undefined' && Notification.permission === 'default' && <button type="button" onClick={() => Notification.requestPermission()} className="min-h-9 text-xs font-medium text-[#155eef]">开启提醒</button>}
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {scopedItems.length ? scopedItems.map((item) => (
              <div key={item.id} className="flex border-b border-[var(--card-border)] last:border-0 hover:bg-[var(--background)]">
                <button type="button" onClick={() => openMessage(item)} className="min-w-0 flex-1 px-4 py-3 text-left">
                  {!item.related_ticket_id && <AnnouncementBadge notification={item} />}
                  <div className="flex items-center gap-2"><p className="truncate text-sm font-medium text-[var(--foreground)]">{item.title}</p><span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${item.related_ticket_id ? 'bg-[#eff4ff] text-[#175cd3]' : item.delivery_type === 'message' ? 'bg-[#f4ebff] text-[#7f56d9]' : 'bg-[#ecfdf3] text-[#027a48]'}`}>{item.related_ticket_id ? '人工客服' : item.delivery_type === 'message' ? '消息' : '通知'}</span></div>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--muted-foreground)]">{preview(item.content)}</p>
                  <p className="mt-2 text-[11px] text-[var(--muted-foreground)]">{new Date(item.created_at).toLocaleDateString('zh-CN')} · {item.is_read ? '已读' : '未读'}{announcementPhase(item) === 'expired' ? ' · 已过期' : ''}</p>
                </button>
                <button type="button" onClick={() => removeMessage(item)} aria-label={`标为已读：${item.title}`} title="标为已读" className="mr-2 self-center rounded-lg p-2 text-[var(--muted-foreground)] hover:bg-[#eff4ff] hover:text-[#155eef] dark:hover:bg-blue-500/10"><span className="material-icons-round text-lg">done</span></button>
              </div>
            )) : <p className="p-8 text-center text-sm text-[var(--muted-foreground)]">暂无未读通知</p>}
            {history && historyPage?.hasMore && <button type="button" disabled={loadingHistory} onClick={() => void loadHistory(historyPage.nextOffset)} className="w-full p-3 text-sm text-[var(--brand)]">{loadingHistory ? '加载中…' : '加载更多历史'}</button>}
          </div>
        </div>
      )}
      {selected && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSelected(null)}
        >
          <article
            role="dialog"
            aria-modal="true"
            className="max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-2xl bg-[var(--card)] p-4 shadow-2xl sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <AnnouncementBadge notification={selected} />
                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${selected.delivery_type === 'message' ? 'bg-[#f4ebff] text-[#7f56d9]' : 'bg-[#ecfdf3] text-[#027a48]'}`}>
                  {selected.delivery_type === 'message' ? '平台消息' : '平台通知'}
                </span>
                <h2 className="mt-3 text-xl font-semibold text-[var(--foreground)]">{selected.title}</h2>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                  {new Date(selected.created_at).toLocaleString('zh-CN')}
                </p>
              </div>
              <button
                type="button"
                aria-label="关闭消息"
                onClick={() => setSelected(null)}
                className="rounded-lg p-1 text-[var(--muted-foreground)] hover:bg-[var(--background)]"
              >
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="mt-6">
              <MarkdownRenderer content={selected.content} />
              <AnnouncementAction notification={selected} />
            </div>
          </article>
        </div>
      )}
      {chatTicket && <SupportConversationDialog ticketId={chatTicket.id} fallbackTitle={chatTicket.title} onClose={() => setChatTicket(null)} />}
    </div>
  );
}
