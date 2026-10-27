'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {useLocalSaveState} from './local-durability';
import { LOCAL_SYNC_STATUS_EVENT } from '@/lib/local-workspace';
import { getLatestSyncStatus } from '@/lib/sync/status';
import type { SyncStatusDetail } from '@/types/sync';
import Link from 'next/link';

const LABELS = {
  auth_required:['login','等待登录'],access_denied:['lock','账号权限需处理'],
  guest: ['save', '已保存'], synced: ['cloud_done', '已同步'], syncing: ['sync', '同步中'],
  offline_pending: ['cloud_upload', '待同步'], server_unavailable: ['cloud_upload', '待同步'], conflict: ['difference', '有冲突'], error: ['sync_problem', '同步失败'],
} as const;

export default function SyncStatusIndicator({ signedIn }: { signedIn: boolean }) {
  const [detail, setDetail] = useState<SyncStatusDetail>({ state: signedIn ? 'syncing' : 'guest', pending: 0, conflicts: 0, lastSyncedAt: null });
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [panelPosition, setPanelPosition] = useState<{ left: number; top: number } | null>(null);
  const summaryRef = useRef<HTMLElement>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    queueMicrotask(() => { const current = getLatestSyncStatus(); if (current) setDetail(current); });
    const listener = (event: Event) => setDetail((event as CustomEvent<SyncStatusDetail>).detail);
    window.addEventListener(LOCAL_SYNC_STATUS_EVENT, listener);
    return () => window.removeEventListener(LOCAL_SYNC_STATUS_EVENT, listener);
  }, []);
  useEffect(() => {
    if (!detailsOpen) return;
    const positionPanel = () => {
      const anchor = summaryRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const width = Math.min(320, window.innerWidth - 24);
      setPanelPosition({
        left: Math.max(12, Math.min(anchor.right - width, window.innerWidth - width - 12)),
        top: anchor.bottom + 4,
      });
    };
    const frame = requestAnimationFrame(positionPanel);
    const close = () => { if (detailsRef.current) detailsRef.current.open=false; };
    const onKey = (event: KeyboardEvent) => { if(event.key==='Escape'){close();summaryRef.current?.focus();} };
    const onPointer = (event: PointerEvent) => { if(!summaryRef.current?.contains(event.target as Node)&&!panelRef.current?.contains(event.target as Node))close(); };
    window.addEventListener('resize', positionPanel);
    window.addEventListener('scroll', positionPanel, true);
    document.addEventListener('keydown',onKey);
    document.addEventListener('pointerdown',onPointer);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', positionPanel);
      window.removeEventListener('scroll', positionPanel, true);
      document.removeEventListener('keydown',onKey);
      document.removeEventListener('pointerdown',onPointer);
    };
  }, [detailsOpen]);
  const local=useLocalSaveState();
  const [,label]=local==='saving'?['save','正在保存到本机']:local==='storage_error'?['warning','本机写入需要检查']:LABELS[detail.state];
  const needsAttention=local==='storage_error'||local==='projection_degraded'||detail.conflicts>0||['conflict','error','access_denied','auth_required'].includes(detail.state);
  const detailStatus=local==='storage_error'?'本机保存尚未完成':local==='projection_degraded'?'本机内容已保存，旧缓存空间不足':detail.state==='auth_required'?'等待重新登录，本机队列已保留':detail.state==='access_denied'?'账号或设备权限需处理':detail.state==='server_unavailable'?'服务暂不可用，后台会继续重试':detail.state==='offline_pending'?'修改保留在本机，联网后继续同步':detail.state==='conflict'?'有修改需要确认，两份内容均已保留':detail.state==='error'?'同步遇到需要检查的问题，本机内容仍保留':detail.state==='syncing'?'正在同步':'数据已自动同步';
  const detailError=detail.state==='auth_required'?'登录状态已失效。':detail.state==='access_denied'?'当前账号或设备没有同步权限。':detail.state==='server_unavailable'?'网络或服务暂时不可用，修改仍在本机队列。':detail.state==='error'?'请查看完整客户端日志中的错误码、请求阶段和请求 ID。':undefined;
  return <div className="flex shrink-0 items-center">
    <details ref={detailsRef} className="group" onToggle={(event) => { const open = event.currentTarget.open; setDetailsOpen(open); if (!open) setPanelPosition(null); }}>
      <summary ref={summaryRef} aria-label={`同步状态与详情：${label}`} aria-expanded={detailsOpen} title={`${label} · 查看同步详情`} className="relative grid h-10 w-10 cursor-pointer list-none place-items-center rounded-lg text-[var(--muted-foreground)] hover:bg-black/[.05] hover:text-[var(--foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 dark:hover:bg-white/[.08] [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="material-icons-round text-xl">{detail.state==='guest'?'save':detail.state==='synced'&&!needsAttention?'cloud_done':'cloud'}</span>
        {needsAttention&&<span data-sync-attention aria-hidden="true" className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-amber-600"/>}
      </summary>
      {detailsOpen&&panelPosition&&createPortal(<div ref={panelRef} data-sync-details className="fixed z-[100] max-h-[calc(100dvh-5rem)] w-[min(20rem,calc(100vw-1.5rem))] overflow-y-auto rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-3 text-sm shadow-lg" style={panelPosition}>
        <div className="px-2 py-1.5">
          <p className="font-semibold">同步诊断</p>
          <p role="status" className="mt-1 text-xs text-[var(--muted-foreground)]">{detailStatus}</p>
          {detail.progress&&<p className="mt-2 break-words text-xs">{detail.progress}</p>}
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">待上传 {detail.pending} 项 · 待处理冲突 {detail.conflicts} 项</p>
          {detail.lastSyncedAt&&<p className="mt-1 text-xs text-[var(--muted-foreground)]">最近成功 {new Date(detail.lastSyncedAt).toLocaleString()}</p>}
          {!!detail.consecutiveFailures&&<p className="mt-1 text-xs text-[var(--muted-foreground)]">连续失败 {detail.consecutiveFailures} 次</p>}
          {detailError&&<p className="mt-2 break-words text-xs text-[#b42318]">{detailError}</p>}
          {local==='storage_error'&&<p className="mt-2 text-xs font-medium text-[#b42318]">部分修改还未确认写入，请保留当前页面并在同步中心检查。</p>}
        </div>
        <div className="my-2 border-t border-[var(--card-border)]" />
        <div className="flex flex-wrap gap-x-4 gap-y-2 px-2 text-xs font-medium">
          {detail.state!=='guest'&&<button type="button" className="text-[var(--brand)]" onClick={()=>window.dispatchEvent(new Event('jackyun-sync-retry'))}>立即重试同步</button>}
          <Link className="text-[var(--brand)]" href="/settings?section=companion">打开同步中心</Link>
          <Link className="text-[var(--brand)]" href="/settings?section=advanced">完整客户端日志</Link>
        </div>
      </div>, document.body)}
    </details>
  </div>;
}
