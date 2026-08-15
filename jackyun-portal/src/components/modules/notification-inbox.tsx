'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { dismissNotification, dismissNotifications, getNotificationInbox } from '@/actions/admin';
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
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SiteNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [selected, setSelected] = useState<SiteNotification | null>(null);
  const [chatTicket, setChatTicket] = useState<{ id: string; title: string } | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const knownIds = useRef(new Set<string>());
  const activeTicketId = useRef<string | null>(null);

  const refresh = (announceNew = false) => getNotificationInbox()
    .then((all) => {
      const visible = all.filter((item) => item.related_ticket_id !== activeTicketId.current);
      const newMessages = announceNew ? visible.filter((item) => item.delivery_type === 'message' && !knownIds.current.has(item.id)) : [];
      setItems(visible); setUnread(visible.length); visible.forEach((item) => knownIds.current.add(item.id));
      if (newMessages.length && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        const latest = newMessages[0]; new Notification('JackYun 新消息', { body: latest.title, icon: '/Webicon.png' });
      }
    }).catch(() => {});

  useEffect(() => {
    refresh();
    const timer = window.setInterval(() => refresh(true), 60_000);
    const handleSupportState = (event: Event) => {
      const detail = (event as CustomEvent<{ ticketId: string; open: boolean }>).detail;
      activeTicketId.current = detail.open ? detail.ticketId : null;
      if (detail.open) {
        setItems((current) => {
          const next = current.filter((item) => item.related_ticket_id !== detail.ticketId);
          setUnread(next.length);
          return next;
        });
      } else {
        refresh();
      }
    };
    window.addEventListener('jackyun:support-state', handleSupportState);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('jackyun:support-state', handleSupportState);
    };
  }, []);

  const openMessage = (item: SiteNotification) => {
    if (item.related_ticket_id) setChatTicket({ id: item.related_ticket_id, title: item.title });
    else setSelected(item);
    dismissNotification(item.id).then((result) => {
      if (!result.success) return;
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setUnread((value) => Math.max(0, value - 1));
    }).catch(() => {});
  };

  const removeMessage = async (item: SiteNotification) => {
    const result = await dismissNotification(item.id);
    if (!result.success) return;
    setItems((current) => current.filter((entry) => entry.id !== item.id));
    setSelected((current) => current?.id === item.id ? null : current);
    setUnread((value) => Math.max(0, value - 1));
  };

  const markAllRead = async () => {
    if (!items.length || markingAll) return;
    setMarkingAll(true);
    const result = await dismissNotifications(items.map((item) => item.id));
    setMarkingAll(false);
    if (!result.success) return;
    setItems([]);
    setUnread(0);
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
            <div><p className="font-semibold text-[var(--foreground)]">通知</p><p className="text-[11px] text-[var(--muted-foreground)]">{items.length} 条未读</p></div>
            <div className="flex items-center gap-2">
              {items.length > 0 && <button type="button" disabled={markingAll} onClick={markAllRead} className="min-h-9 rounded-lg px-2 text-xs font-medium text-[#155eef] hover:bg-[#eff4ff] disabled:opacity-50">{markingAll ? '处理中…' : '一键全读'}</button>}
              {typeof Notification !== 'undefined' && Notification.permission === 'default' && <button type="button" onClick={() => Notification.requestPermission()} className="min-h-9 text-xs font-medium text-[#155eef]">开启提醒</button>}
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length ? items.map((item) => (
              <div key={item.id} className="flex border-b border-[var(--card-border)] last:border-0 hover:bg-[var(--background)]">
                <button type="button" onClick={() => openMessage(item)} className="min-w-0 flex-1 px-4 py-3 text-left">
                  <div className="flex items-center gap-2"><p className="truncate text-sm font-medium text-[var(--foreground)]">{item.title}</p><span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${item.related_ticket_id ? 'bg-[#eff4ff] text-[#175cd3]' : item.delivery_type === 'message' ? 'bg-[#f4ebff] text-[#7f56d9]' : 'bg-[#ecfdf3] text-[#027a48]'}`}>{item.related_ticket_id ? '人工客服' : item.delivery_type === 'message' ? '消息' : '通知'}</span></div>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--muted-foreground)]">{preview(item.content)}</p>
                  <p className="mt-2 text-[11px] text-[var(--muted-foreground)]">{new Date(item.created_at).toLocaleDateString('zh-CN')}</p>
                </button>
                <button type="button" onClick={() => removeMessage(item)} aria-label={`标为已读：${item.title}`} title="标为已读" className="mr-2 self-center rounded-lg p-2 text-[var(--muted-foreground)] hover:bg-[#eff4ff] hover:text-[#155eef] dark:hover:bg-blue-500/10"><span className="material-icons-round text-lg">done</span></button>
              </div>
            )) : <p className="p-8 text-center text-sm text-[var(--muted-foreground)]">暂无未读通知</p>}
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
              {selected.content_type === 'markdown' ? (
                <MarkdownRenderer content={selected.content} />
              ) : (
                <div className="whitespace-pre-wrap text-sm leading-7 text-[var(--foreground)]">
                  {selected.content}
                </div>
              )}
            </div>
          </article>
        </div>
      )}
      {chatTicket && <SupportConversationDialog ticketId={chatTicket.id} fallbackTitle={chatTicket.title} onClose={() => setChatTicket(null)} />}
    </div>
  );
}
