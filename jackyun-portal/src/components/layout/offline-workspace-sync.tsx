'use client';

import { useEffect, useState } from 'react';
import { bindOfflineWorkspaceUser, listOfflineMutations, removeOfflineMutation, saveOfflineSnapshot } from '@/lib/offline/workspace';

export default function OfflineWorkspaceSync({ userId }: { userId: string | null }) {
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let running = false;

    async function refresh() {
      if (!userId || !navigator.onLine || running) return;
      running = true;
      try {
        const queued = await listOfflineMutations(userId);
        for (const operation of queued) {
          const response = await fetch('/api/offline/workspace', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind: operation.kind, payload: operation.payload }),
          });
          if (!response.ok) throw new Error(`Queued operation failed (${response.status})`);
          await removeOfflineMutation(operation.id);
        }
        const response = await fetch('/api/offline/workspace', { cache: 'no-store' });
        if (!response.ok) throw new Error(`Offline snapshot failed (${response.status})`);
        const snapshot = await response.json() as { tasks: unknown; review: unknown; reading: unknown };
        await Promise.all([
          saveOfflineSnapshot(userId, 'tasks', snapshot.tasks),
          saveOfflineSnapshot(userId, 'review', snapshot.review),
          saveOfflineSnapshot(userId, 'reading', snapshot.reading),
        ]);
        if (!cancelled && queued.length) setNotice(`已联网，${queued.length} 项离线操作已同步`);
      } catch (error) {
        if (navigator.onLine) console.error('[offline-workspace] sync failed', error);
      } finally {
        running = false;
      }
    }

    void bindOfflineWorkspaceUser(userId).then(refresh);
    const onOnline = () => void refresh();
    const onQueued = () => setNotice('已记录，联网后同步');
    window.addEventListener('online', onOnline);
    window.addEventListener('jackyun-offline-queued', onQueued);
    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
      window.removeEventListener('jackyun-offline-queued', onQueued);
    };
  }, [userId]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  if (!notice) return null;
  return <div role="status" className="fixed bottom-5 left-1/2 z-[120] -translate-x-1/2 rounded-full bg-[#202124] px-4 py-2.5 text-sm font-semibold text-white shadow-2xl">{notice}</div>;
}
