'use client';

import { BEFORE_SLEEP_EVENT, WAKE_EVENT, isWorkspaceSleeping, type SleepRequest } from '@/lib/workspace-idle';
import { fetchSyncWithTimeout } from '@/lib/request-timeout';
import { useEffect, useState } from 'react';
import { bindOfflineWorkspaceUser, deferOfflineMutation, listOfflineMutations, removeOfflineMutation, saveOfflineSnapshot } from '@/lib/offline/workspace';

export default function OfflineWorkspaceSync({ userId }: { userId: string | null }) {
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let running = false;
    let activeWork: Promise<void> = Promise.resolve();
    let bound = false;
    let signingOut = false;

    async function refresh(includeSnapshot = true) {
      if (!userId || !bound || signingOut || cancelled || !navigator.onLine || running || isWorkspaceSleeping()) return;
      running = true;
      try {
        const queued = await listOfflineMutations(userId);
        if (!includeSnapshot && !queued.some(operation => !operation.nextAttemptAt || Date.parse(operation.nextAttemptAt) <= Date.now())) return;
        let deferred = false;
        for (const operation of queued) {
          if (operation.nextAttemptAt && Date.parse(operation.nextAttemptAt) > Date.now()) continue;
          try {
            const response = await fetchSyncWithTimeout('/api/offline/workspace', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ operationId: operation.id, kind: operation.kind, payload: operation.payload }),
            });
            if (!response.ok) {
              if (response.status < 500 && response.status !== 408 && response.status !== 429) {
                await deferOfflineMutation(operation.id, `HTTP ${response.status}`);
                setNotice('有一项离线更改需要重新登录或处理；其他更改仍会继续同步');
                continue;
              }
              throw new Error(`HTTP ${response.status}`);
            }
            await removeOfflineMutation(operation.id);
          } catch (error) {
            await deferOfflineMutation(operation.id, error instanceof Error ? error.message : 'Network request failed');
            if (navigator.onLine) console.warn('[offline-workspace] retry deferred', error);
            deferred = true;
            break;
          }
        }
        if (deferred) return;
        if ((await listOfflineMutations(userId)).length) return;
        const response = await fetchSyncWithTimeout('/api/offline/workspace', { cache: 'no-store' });
        if (!response.ok) throw new Error(`Offline snapshot failed (${response.status})`);
        const snapshot = await response.json() as { tasks: unknown; review: unknown; reading: unknown };
        await Promise.all([
          saveOfflineSnapshot(userId, 'tasks', snapshot.tasks),
          saveOfflineSnapshot(userId, 'review', snapshot.review),
          saveOfflineSnapshot(userId, 'reading', snapshot.reading),
        ]);
        if (!cancelled && queued.length) {
          const remaining = await listOfflineMutations(userId);
          if (!remaining.length) setNotice(`已联网，${queued.length} 项离线操作已同步`);
        }
      } catch (error) {
        if (navigator.onLine) console.error('[offline-workspace] sync failed', error);
      } finally {
        running = false;
      }
    }

    void bindOfflineWorkspaceUser(userId).then(() => { bound = true; activeWork = refresh(); return activeWork; }).catch((error) => {
      console.error('[offline-workspace] account binding failed', error);
    });
    const onSignOut = () => { signingOut = true; };
    const onCancel = () => { signingOut = false; };
    window.addEventListener('jackyun-signout-start', onSignOut);
    window.addEventListener('jackyun-signout-cancel', onCancel);
    const onOnline = () => { if (!running) activeWork = refresh(); };
    const retryTimer = window.setInterval(() => { if (navigator.onLine && !running) activeWork = refresh(false); }, 30_000);
    const onSleep = (event: Event) => {
      (event as CustomEvent<SleepRequest>).detail.waitUntil(activeWork.then(() => refresh()));
    };
    window.addEventListener(BEFORE_SLEEP_EVENT, onSleep);
    window.addEventListener(WAKE_EVENT, onOnline);
    const onQueued = () => setNotice('已记录，联网后同步');
    window.addEventListener('online', onOnline);
    window.addEventListener('jackyun-offline-queued', onQueued);
    return () => {
      window.removeEventListener(BEFORE_SLEEP_EVENT, onSleep);
      window.removeEventListener(WAKE_EVENT, onOnline);
      cancelled = true;
      window.removeEventListener('jackyun-signout-start', onSignOut);
      window.removeEventListener('jackyun-signout-cancel', onCancel);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('jackyun-offline-queued', onQueued);
      window.clearInterval(retryTimer);
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
