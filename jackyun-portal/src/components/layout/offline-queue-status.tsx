'use client';
import { workspaceStorage } from '@/lib/sync/repository';


import { useEffect, useState } from 'react';
import { listOfflineMutations } from '@/lib/offline/workspace';

export default function OfflineQueueStatus({ userId }: { userId: string | null }) {
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      setOnline(navigator.onLine);
      let focusSessions = 0;
      try {
        const value = JSON.parse(workspaceStorage.getItem('jackyun_pomodoro_pending_sessions') || '[]');
        if (Array.isArray(value)) focusSessions = value.length;
      } catch {}
      try {
        const mutations = userId ? await listOfflineMutations(userId) : [];
        if (!cancelled) setPending(mutations.length + focusSessions);
      } catch { if (!cancelled) setPending(focusSessions); }
    };
    void refresh();
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    window.addEventListener('jackyun-offline-queued', refresh);
    window.addEventListener('jackyun-offline-synced', refresh);
    window.addEventListener('jackyun-signout-start', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      cancelled = true;
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
      window.removeEventListener('jackyun-offline-queued', refresh);
      window.removeEventListener('jackyun-offline-synced', refresh);
      window.removeEventListener('jackyun-signout-start', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [userId]);

  if (online && !pending) return null;
  const label = pending ? `${pending} 项待同步` : '离线可用';
  return <span role="status" aria-live="polite" title={pending ? '更改已保存在此设备，网络恢复后自动同步；番茄钟记录需登录同一账户同步' : '页面和本机缓存内容可继续使用'} className="inline-flex h-9 max-w-28 items-center gap-1 rounded-lg px-2 text-[11px] font-medium text-[var(--muted-foreground)] sm:max-w-none">
    <span aria-hidden="true" className="material-icons-round text-base">{pending ? 'cloud_upload' : 'cloud_off'}</span>
    <span className="hidden sm:inline">{label}</span>
    <span className="sr-only">{label}</span>
  </span>;
}
