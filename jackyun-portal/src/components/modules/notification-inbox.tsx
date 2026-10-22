'use client';

import { siteAlert } from '@/lib/site-dialog';
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
import { Button } from '@/components/ui/button';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription, getDialogContainer } from '@/components/ui/dialog';

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
  const [historyError, setHistoryError] = useState('');
  const [actionError, setActionError] = useState('');
  const markingRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
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
    setHistoryError('');
    try {
      const response = await fetch(`/api/notifications/snapshot?history=1&offset=${offset}&reason=history`, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('读取历史失败');
      const result = await response.json();
      if (result.userId !== userId || controller.signal.aborted) return;
      setHistoryPage(current => ({ ...result, items: offset ? [...(current?.items ?? []), ...result.items] : result.items }));
    } catch { if (!controller.signal.aborted) setHistoryError('历史加载失败，已加载内容仍保留，请重试。'); }
    finally { if (historyController.current === controller) { historyController.current = null; setLoadingHistory(false); } }
  }, [userId]);

  useEffect(() => {
    const known = knownIds.current;
    const newMessages = known.size ? snapshot.items.filter(item => item.delivery_type === 'message' && !known.has(item.id) && item.related_ticket_id !== activeTicketId) : [];
    snapshot.items.forEach(item => known.add(item.id));
    if (newMessages.length && document.visibilityState === 'visible') {
      void siteAlert(newMessages[0].title, { title: '新消息', confirmLabel: '知道了' });
    }
  }, [snapshot, activeTicketId]);
  useEffect(() => {
    const timer = open && history ? window.setTimeout(() => void loadHistory(), 0) : undefined;
    return () => {
      window.clearTimeout(timer);
      const controller = historyController.current;
      if (controller) {
        controller.abort();
        historyController.current = null;
        setLoadingHistory(false);
      }
    };
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
    setOpen(false);
    if (item.related_ticket_id) setChatTicket({ id: item.related_ticket_id, title: item.title });
    else setSelected(item);
    dismissNotification(item.id).then((result) => {
      if (!result.success) return;
      window.dispatchEvent(new CustomEvent('jackyun:notification-dismissed', { detail: item.id }));
    }).catch(() => {});
  };

  const removeMessage = async (item: SiteNotification) => {
    setActionError('');
    try {
      const result = await dismissNotification(item.id);
      if (!result.success) throw new Error('标记失败');
      window.dispatchEvent(new CustomEvent('jackyun:notification-dismissed', { detail: item.id }));
      setSelected(current => current?.id === item.id ? null : current);
    } catch { setActionError('标记失败，通知仍保留，请重试。'); }
  };

  const markAllRead = async () => {
    const ids = scopedItems.filter(item => !item.is_read).map(item => item.id);
    if (!ids.length || markingRef.current) return;
    markingRef.current = true;
    setMarkingAll(true);
    setActionError('');
    try {
      const result = await dismissNotifications(ids);
      if (!result.success) throw new Error('标记失败');
      window.dispatchEvent(new CustomEvent('jackyun:notification-dismissed', { detail: ids }));
      setSelected(null);
    } catch { setActionError('标记失败，通知仍保留，请重试。'); }
    finally { markingRef.current = false; setMarkingAll(false); }
  };

  return <>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button ref={triggerRef} variant="ghost" size="icon" aria-label={unread ? `通知，${unread} 条未读` : '通知'} className="relative" onPointerDown={event => setPortalContainer(getDialogContainer(event.currentTarget))} onKeyDown={event => setPortalContainer(getDialogContainer(event.currentTarget))}>
        <span aria-hidden="true" className="material-icons-round text-xl">notifications</span>
        {unread > 0 && <span aria-hidden="true" className="absolute right-0 top-0 min-w-4 rounded-full bg-[#b3261e] px-1 text-[10px] font-bold leading-4 text-white">{unread > 9 ? '9+' : unread}</span>}
      </Button></DialogTrigger>
      <DialogContent portalContainer={portalContainer} className="jy-notification-dialog" closeLabel="关闭通知">
        <DialogTitle>{history ? '此页公告与消息历史' : '通知'}</DialogTitle>
        <DialogDescription>{unread} 条未读</DialogDescription>
        <div className="my-3 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" aria-pressed={history} onClick={() => setHistory(value => !value)}>{history ? '查看未读' : '查看历史'}</Button>
          {unread > 0 && <Button variant="ghost" size="sm" busy={markingAll} onClick={markAllRead}>{markingAll ? '处理中…' : '一键全读'}</Button>}
        </div>
        {actionError && <p role="alert" className="jy-notice-error mb-3">{actionError}</p>}
        {historyError && <div role="alert" className="mb-3 space-y-2"><p className="jy-notice-error">{historyError}</p><Button variant="outline" size="sm" onClick={() => loadHistory()}>重试历史</Button></div>}
        <div className="max-h-[min(60dvh,30rem)] overflow-y-auto" aria-busy={history && loadingHistory || undefined}>
          {history && loadingHistory && <p role="status" className="p-3 text-sm text-[var(--muted-foreground)]">正在加载历史…</p>}
          {scopedItems.length ? <ul className="divide-y divide-[var(--card-border)]">{scopedItems.map(item => <li key={item.id} className="flex items-start gap-1 py-1">
            <button type="button" onClick={() => openMessage(item)} className="jy-notification-entry min-w-0 flex-1 rounded-lg px-3 py-3 text-left">
              {!item.related_ticket_id && <AnnouncementBadge notification={item} />}
              <span className="block text-sm font-medium">{item.title}</span>
              <span className="mt-1 block text-xs text-[var(--brand)]">{item.related_ticket_id ? '人工客服' : item.delivery_type === 'message' ? '消息' : '通知'}</span>
              <span className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--muted-foreground)]">{preview(item.content)}</span>
              <span className="mt-2 block text-[11px] text-[var(--muted-foreground)]">{new Date(item.created_at).toLocaleDateString('zh-CN')} · {item.is_read ? '已读' : '未读'}{announcementPhase(item) === 'expired' ? ' · 已过期' : ''}</span>
            </button>
            <Button variant="ghost" size="icon" onClick={() => removeMessage(item)} aria-label={`标为已读：${item.title}`}><span aria-hidden="true" className="material-icons-round text-lg">done</span></Button>
          </li>)}</ul> : !loadingHistory && !historyError && <p role="status" className="p-6 text-center text-sm text-[var(--muted-foreground)]">{history ? '暂无历史通知' : '暂无未读通知'}</p>}
          {history && historyPage?.hasMore && <Button variant="ghost" busy={loadingHistory} onClick={() => loadHistory(historyPage.nextOffset)} className="w-full">{loadingHistory ? '加载中…' : '加载更多历史'}</Button>}
        </div>
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(selected)} onOpenChange={value => { if (!value) setSelected(null); }}>
      <DialogContent portalContainer={portalContainer} closeLabel="关闭消息" onCloseAutoFocus={event => { event.preventDefault(); triggerRef.current?.focus(); }}>
        <DialogTitle>{selected?.title ?? '消息'}</DialogTitle>
        <DialogDescription>{selected ? `${selected.delivery_type === 'message' ? '平台消息' : '平台通知'} · ${new Date(selected.created_at).toLocaleString('zh-CN')}` : ''}</DialogDescription>
        {selected && <div className="mt-5"><AnnouncementBadge notification={selected} /><MarkdownRenderer content={selected.content} /><AnnouncementAction notification={selected} /></div>}
      </DialogContent>
    </Dialog>
    {chatTicket && <SupportConversationDialog ticketId={chatTicket.id} fallbackTitle={chatTicket.title} onClose={() => setChatTicket(null)} />}
  </>;
}
