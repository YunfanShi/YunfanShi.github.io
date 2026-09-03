'use client';

import { useEffect, useState } from 'react';
import { LOCAL_SYNC_STATUS_EVENT } from '@/lib/local-workspace';
import type { SyncStatusDetail } from '@/types/sync';

const LABELS = {
  guest: ['cloud_off', '本机模式'], synced: ['cloud_done', '已同步'], syncing: ['sync', '同步中'],
  offline_pending: ['cloud_upload', '待同步'], conflict: ['difference', '有冲突'], error: ['sync_problem', '同步失败'],
} as const;

export default function SyncStatusIndicator({ signedIn }: { signedIn: boolean }) {
  const [detail, setDetail] = useState<SyncStatusDetail>({ state: signedIn ? 'syncing' : 'guest', pending: 0, conflicts: 0, lastSyncedAt: null });
  useEffect(() => {
    const listener = (event: Event) => setDetail((event as CustomEvent<SyncStatusDetail>).detail);
    window.addEventListener(LOCAL_SYNC_STATUS_EVENT, listener);
    return () => window.removeEventListener(LOCAL_SYNC_STATUS_EVENT, listener);
  }, []);
  const [icon, label] = LABELS[detail.state];
  return <button type="button" onClick={() => detail.state !== 'guest' && window.dispatchEvent(new Event('jackyun-sync-retry'))}
    className={`hidden h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium sm:flex ${detail.state === 'conflict' || detail.state === 'error' ? 'text-[#d93025]' : detail.state === 'offline_pending' ? 'text-[#b06000]' : 'text-[var(--muted-foreground)]'}`}
    title={`${label}${detail.pending ? ` · ${detail.pending} 项待上传` : ''}${detail.conflicts ? ` · ${detail.conflicts} 个冲突` : ''}`}>
    <span className={`material-icons-round text-lg ${detail.state === 'syncing' ? 'animate-spin' : ''}`}>{icon}</span>
    <span>{label}{detail.pending ? ` ${detail.pending}` : ''}</span>
  </button>;
}
