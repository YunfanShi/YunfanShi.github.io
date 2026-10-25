'use client';

import { useEffect, useState } from 'react';
import {useLocalSaveState} from './local-durability';
import { LOCAL_SYNC_STATUS_EVENT } from '@/lib/local-workspace';
import { getLatestSyncStatus } from '@/lib/sync/status';
import type { SyncStatusDetail } from '@/types/sync';

const LABELS = {
  auth_required:['login','等待登录'],access_denied:['lock','账号权限需处理'],
  guest: ['save', '已保存'], synced: ['cloud_done', '已同步'], syncing: ['sync', '同步中'],
  offline_pending: ['cloud_upload', '待同步'], server_unavailable: ['cloud_upload', '待同步'], conflict: ['difference', '有冲突'], error: ['sync_problem', '同步失败'],
} as const;

export default function SyncStatusIndicator({ signedIn }: { signedIn: boolean }) {
  const [detail, setDetail] = useState<SyncStatusDetail>({ state: signedIn ? 'syncing' : 'guest', pending: 0, conflicts: 0, lastSyncedAt: null });
  useEffect(() => {
    queueMicrotask(() => { const current = getLatestSyncStatus(); if (current) setDetail(current); });
    const listener = (event: Event) => setDetail((event as CustomEvent<SyncStatusDetail>).detail);
    window.addEventListener(LOCAL_SYNC_STATUS_EVENT, listener);
    return () => window.removeEventListener(LOCAL_SYNC_STATUS_EVENT, listener);
  }, []);
  const local=useLocalSaveState();
  const [icon,label]=local==='saving'?['save','正在保存到本机']:local==='storage_error'?['warning','本机保存未完成']:LABELS[detail.state];
  return <button type="button" onClick={() => detail.state !== 'guest' && window.dispatchEvent(new Event('jackyun-sync-retry'))}
    className={`flex h-11 w-11 shrink-0 items-center justify-center gap-1.5 rounded-lg text-xs font-medium sm:h-9 sm:w-auto sm:px-2.5 ${detail.state === 'conflict' || detail.state === 'error' ? 'text-[#d93025]' : 'text-[var(--muted-foreground)]'}`}
    disabled={detail.state === 'syncing' || detail.state === 'guest'}
    aria-label={`${label}${detail.pending ? `，${detail.pending} 项待上传` : ''}${detail.state === 'syncing' || detail.state === 'guest' ? '' : '，点击立即同步'}`}
    title={`${label}${detail.pending ? ` · ${detail.pending} 项待上传` : ''}${detail.conflicts ? ` · ${detail.conflicts} 个冲突` : ''}${detail.progress ? ` · ${detail.progress}` : ''}${detail.error ? ` · ${detail.error}` : ''}${detail.lastSyncedAt ? ` · 最近成功 ${new Date(detail.lastSyncedAt).toLocaleString()}` : ''}`}>
    <span className={`material-icons-round text-lg ${detail.state === 'syncing' ? 'animate-spin' : ''}`}>{icon}</span>
    <span className="hidden sm:inline">{label}{detail.pending ? ` ${detail.pending}` : ''}</span>
  </button>;
}
