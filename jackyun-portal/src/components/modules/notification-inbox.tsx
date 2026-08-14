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

  useEffect(() => {
    Promise.all([getNotificationInbox(), getActiveNotifications()])
      .then(([all, pending]) => { setItems(all); setUnread(pending.length); })
      .catch(() => {});
  }, []);

  const markRead = (id: string) => {
    dismissNotification(id).then(() => setUnread((value) => Math.max(0, value - 1))).catch(() => {});
  };

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-label="通知中心" className="relative grid h-9 w-9 place-items-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--background)]">
        <span className="material-icons-round text-xl">notifications</span>
        {unread > 0 && <span className="absolute right-0 top-0 min-w-4 rounded-full bg-[#d92d20] px-1 text-[10px] font-bold leading-4 text-white">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-[var(--card-border)] bg-[var(--card)] shadow-xl">
          <div className="flex items-center justify-between border-b border-[var(--card-border)] px-4 py-3"><p className="font-semibold text-[var(--foreground)]">通知中心</p><span className="text-xs text-[var(--muted-foreground)]">{items.length} 条公告</span></div>
          <div className="max-h-96 overflow-y-auto">
            {items.length ? items.map((item) => (
              <button type="button" onClick={() => markRead(item.id)} key={item.id} className="block w-full border-b border-[var(--card-border)] px-4 py-3 text-left last:border-0 hover:bg-[var(--background)]">
                <p className="text-sm font-medium text-[var(--foreground)]">{item.title}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--muted-foreground)]">{preview(item.content)}</p>
                <p className="mt-2 text-[11px] text-[var(--muted-foreground)]">{new Date(item.created_at).toLocaleDateString('zh-CN')}</p>
              </button>
            )) : <p className="p-8 text-center text-sm text-[var(--muted-foreground)]">暂无平台通知</p>}
          </div>
        </div>
      )}
    </div>
  );
}
