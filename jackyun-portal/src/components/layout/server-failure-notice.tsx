'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LOCAL_SYNC_STATUS_EVENT } from '@/lib/local-workspace';
import { getLatestSyncStatus } from '@/lib/sync/status';
import { SERVICE_NOTICE_SNOOZE_MS, shouldShowServiceNotice } from '@/lib/sync/notice-policy';
import type { SyncStatusDetail } from '@/types/sync';
const MUTE_KEY = 'jackyun-service-notice-muted-until';

export default function ServerFailureNotice() {
  const [detail, setDetail] = useState<SyncStatusDetail | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [mutedUntil, setMutedUntil] = useState(0);
  const [now, setNow] = useState(0);
  useEffect(() => {
    const apply = (value: SyncStatusDetail | null) => {
      setDetail(value); setNow(Date.now());
      if (value?.state === 'synced' || value?.state === 'guest') setDismissed(false);
    };
    queueMicrotask(() => {
      apply(getLatestSyncStatus());
      try { const stored = Number(sessionStorage.getItem(MUTE_KEY)); if (Number.isFinite(stored)) setMutedUntil(stored); } catch { /* Works in memory when storage is unavailable. */ }
    });
    const onStatus = (event: Event) => apply((event as CustomEvent<SyncStatusDetail>).detail);
    window.addEventListener(LOCAL_SYNC_STATUS_EVENT, onStatus);
    return () => window.removeEventListener(LOCAL_SYNC_STATUS_EVENT, onStatus);
  }, []);
  useEffect(() => {
    if (mutedUntil <= Date.now()) return;
    const timer = window.setTimeout(() => { setNow(Date.now()); setMutedUntil(0); }, mutedUntil - Date.now() + 1);
    return () => window.clearTimeout(timer);
  }, [mutedUntil]);
  if (!shouldShowServiceNotice(detail, now, mutedUntil, dismissed)) return null;
  return <div role="alert" className="flex flex-wrap items-center justify-between gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
    <span>云端同步连续 {detail?.consecutiveFailures} 次未完成。此设备的修改已保留，恢复连接后会继续同步。</span>
    <div className="flex flex-wrap gap-3"><button type="button" onClick={() => setDismissed(true)} className="underline">关闭提示</button><button type="button" onClick={() => { const until = Date.now() + SERVICE_NOTICE_SNOOZE_MS; setMutedUntil(until); try { sessionStorage.setItem(MUTE_KEY, String(until)); } catch { /* Keep the current-tab mute in memory. */ } }} className="underline">关闭 10 分钟</button><Link href="/server-failure" className="font-semibold underline">查看故障说明</Link></div>
  </div>;
}
