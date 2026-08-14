'use client';

import { useEffect, useState } from 'react';
import { dismissNotification, getActiveNotifications, getNotificationInbox } from '@/actions/admin';
import type { SiteNotification } from '@/types';

function preview(content: string) {
  return content.replaceAll('#', '').replaceAll('*', '').replaceAll('_', '').replaceAll('`', '');
}

export default function NotificationInbox() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SiteNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [selected, setSelected] = useState<SiteNotification | null>(null);

  useEffect(() => {
    Promise.all([getNotificationInbox(), getActiveNotifications()])
      .then(([all, pending]) => { setItems(all); setUnread(pending.length); })
      .catch(() => {});
  }, []);

  const openMessage = (item: SiteNotification) => {
    setSelected(item);
    dismissNotification(item.id).then(() => setUnread((value) => Math.max(0, value - 1))).catch(() => {});
  };

  const removeMessage = async (item: SiteNotification) => {
    const result = await dismissNotification(item.id);
    if (!result.success) return;
    setItems((current) => current.filter((entry) => entry.id !== item.id));
    setSelected((current) => current?.id === item.id ? null : current);
    if (item.delivery_type === 'notice') setUnread((value) => Math.max(0, value - 1));
  };

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-label="通知中心" className="relative grid h-9 w-9 place-items-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--background)]">
        <span className="material-icons-round text-xl">notifications</span>
        {unread > 0 && <span className="absolute right-0 top-0 min-w-4 rounded-full bg-[#d92d20] px-1 text-[10px] font-bold leading-4 text-white">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-[var(--card-border)] bg-[var(--card)] shadow-xl">
          <div className="flex items-center justify-between border-b border-[var(--card-border)] px-4 py-3"><p className="font-semibold text-[var(--foreground)]">通知中心</p><span className="text-xs text-[var(--muted-foreground)]">{items.length} 条内容</span></div>
          <div className="max-h-96 overflow-y-auto">
            {items.length ? items.map((item) => (
              <div key={item.id} className="flex border-b border-[var(--card-border)] last:border-0 hover:bg-[var(--background)]">
                <button type="button" onClick={() => openMessage(item)} className="min-w-0 flex-1 px-4 py-3 text-left">
                  <div className="flex items-center gap-2"><p className="truncate text-sm font-medium text-[var(--foreground)]">{item.title}</p><span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${item.delivery_type === 'message' ? 'bg-[#f4ebff] text-[#7f56d9]' : 'bg-[#ecfdf3] text-[#027a48]'}`}>{item.delivery_type === 'message' ? '消息' : '通知'}</span></div>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--muted-foreground)]">{preview(item.content)}</p>
                  <p className="mt-2 text-[11px] text-[var(--muted-foreground)]">{new Date(item.created_at).toLocaleDateString('zh-CN')}</p>
                </button>
                <button type="button" onClick={() => removeMessage(item)} aria-label={`删除：${item.title}`} title="从我的通知中心删除" className="mr-2 self-center rounded-lg p-2 text-[var(--muted-foreground)] hover:bg-red-50 hover:text-[#d92d20] dark:hover:bg-red-500/10"><span className="material-icons-round text-lg">delete_outline</span></button>
              </div>
            )) : <p className="p-8 text-center text-sm text-[var(--muted-foreground)]">暂无平台通知</p>}
          </div>
        </div>
      )}
      {selected && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={() => setSelected(null)}><article className="max-h-[80vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-[var(--card)] p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-4"><div><span className={`rounded-full px-2 py-1 text-xs font-semibold ${selected.delivery_type === 'message' ? 'bg-[#f4ebff] text-[#7f56d9]' : 'bg-[#ecfdf3] text-[#027a48]'}`}>{selected.delivery_type === 'message' ? '平台消息' : '平台通知'}</span><h2 className="mt-3 text-xl font-semibold text-[var(--foreground)]">{selected.title}</h2><p className="mt-1 text-xs text-[var(--muted-foreground)]">{new Date(selected.created_at).toLocaleString('zh-CN')}</p></div><button onClick={() => setSelected(null)} className="rounded-lg p-1 text-[var(--muted-foreground)] hover:bg-[var(--background)]"><span className="material-icons-round">close</span></button></div><div className="mt-6 whitespace-pre-wrap text-sm leading-7 text-[var(--foreground)]">{selected.content}</div></article></div>}
    </div>
  );
}
