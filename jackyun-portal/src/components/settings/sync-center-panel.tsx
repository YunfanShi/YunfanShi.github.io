'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { LOCAL_SYNC_STATUS_EVENT } from '@/lib/local-workspace';
import { fetchSyncWithTimeout } from '@/lib/request-timeout';
import { getLatestSyncStatus } from '@/lib/sync/status';
import { useAuthMode } from '@/components/auth/auth-mode-provider';
import { getConflicts, getOrCreateDeviceId } from '@/lib/sync/outbox';
import type { SyncConflict, SyncDevice, SyncStatusDetail } from '@/types/sync';

export default function SyncCenterPanel() {
  const { signedIn } = useAuthMode();
  const [devices, setDevices] = useState<SyncDevice[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState('');
  const [detail, setDetail] = useState<SyncStatusDetail>({ state: 'guest', pending: 0, conflicts: 0, lastSyncedAt: null });
  const [error, setError] = useState('');
  const [conflicts,setConflicts]=useState<SyncConflict[]>([]);

  const load = useCallback(async () => {
    setError('');
    try {
      const deviceId = await getOrCreateDeviceId();
      const deviceResponse = await fetchSyncWithTimeout('/api/sync/devices');
      if (!deviceResponse.ok) {
        const failed = deviceResponse;
        const payload = await failed.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
        throw new Error(payload?.error?.code ? `同步中心加载失败：${payload.error.code}` : `同步中心加载失败 (${failed.status})`);
      }
      const devicePayload = await deviceResponse.json() as { devices: SyncDevice[] };
      setCurrentDeviceId(deviceId);
      setDevices(devicePayload.devices);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '同步中心加载失败'); }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    const listener = (event: Event) => {
      const next = (event as CustomEvent<SyncStatusDetail>).detail;
      setDetail(next);
      void getConflicts().then(setConflicts).catch(()=>setError('本机冲突列表无法读取，请保留当前页面。'));
    };
    queueMicrotask(() => { const current = getLatestSyncStatus(); if (current) setDetail(current);void getConflicts().then(setConflicts).catch(()=>{}); });
    window.addEventListener(LOCAL_SYNC_STATUS_EVENT, listener);
    return () => { window.clearTimeout(initialLoad); window.removeEventListener(LOCAL_SYNC_STATUS_EVENT, listener); };
  }, [load]);

  const openDevices = useMemo(() => devices.filter((device) => !device.revokedAt), [devices]);

  async function rename(device: SyncDevice) {
    const name = window.prompt('设备名称', device.name)?.trim();
    if (!name) return;
    const response = await fetchSyncWithTimeout('/api/sync/devices', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: device.id, name }) });
    if (response.ok) await load(); else setError('设备改名失败');
  }

  async function revoke(device: SyncDevice) {
    if (device.id === currentDeviceId || !window.confirm(`撤销设备“${device.name}”？`)) return;
    const response = await fetchSyncWithTimeout('/api/sync/devices', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: device.id }) });
    if (response.ok) await load(); else setError('撤销设备失败');
  }

  const status = detail.state === 'guest'
    ? '当前为本机模式，登录后才能同步'
    : detail.state === 'synced'
    ? '数据已自动同步'
    : detail.state === 'conflict' ? '有修改需要你选择；两份内容已保留'
    : detail.state === 'server_unavailable'
      ? '服务器或数据库暂时无法连接；修改仍保存在本机'
    : detail.state === 'offline_pending'
      ? '修改已保存在本机，联网后自动同步'
      : detail.state === 'error'
        ? '自动同步暂时失败'
        : '正在自动同步';

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-4">
      <div><p className="font-semibold">{status}</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">待上传 {detail.pending} 项 · 待处理冲突 {detail.conflicts} 项{detail.lastSyncedAt ? ` · 最近成功 ${new Date(detail.lastSyncedAt).toLocaleString()}` : ''}</p></div>
      <button type="button" disabled={!signedIn || detail.state === 'syncing'} onClick={() => { setDetail((current) => ({ ...current, state: 'syncing', error: undefined, progress: '已收到立即同步请求…' })); window.dispatchEvent(new Event('jackyun-sync-retry')); }} className="rounded-lg bg-[#1a73e8] px-3 py-2 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60">{detail.state === 'syncing' ? '同步中…' : '立即同步'}</button>
    </div>
    {detail.progress && <p role="status" aria-live="polite" className="text-sm text-[var(--muted-foreground)]">{detail.progress}</p>}
    {error ? <p className="rounded-lg bg-[#fce8e6] px-3 py-2 text-sm text-[#c5221f]">{error}</p> : null}
    {detail.error ? <p className="rounded-lg bg-[#fce8e6] px-3 py-2 text-sm text-[#c5221f]">{detail.error}</p> : null}
    {conflicts.map(conflict=><div key={conflict.operationId} className="rounded-xl border border-amber-500 p-4 text-sm">
      <p className="font-semibold">{conflict.key} · 云端版本 {conflict.remoteRevision}</p>
      <p className="mt-2">相同内容发生不同修改，或删除与编辑同时发生。自动同步已暂停此页面，其他页面继续同步。</p>
      {conflict.paths?.length ? <p className="mt-1 text-xs">需要选择的字段：{conflict.paths.slice(0,8).join('、')}{conflict.paths.length>8?'…':''}</p>:null}
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" className="underline" onClick={()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(conflict,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='jackyun-sync-conflict.json';link.click();URL.revokeObjectURL(url);}}>下载两份内容对比</button>
        {(['local','remote'] as const).map(choice=><button type="button" key={choice} disabled={!signedIn || detail.state==='syncing'} className="rounded-lg border px-3 py-2 disabled:opacity-50" onClick={()=>{if(!window.confirm(choice==='local'?'保留本机冲突字段，并合并云端独有记录？操作前会保存本机版本。':'采用此云端版本？本机原始版本会先保存。'))return;setDetail(current=>({...current,state:'syncing',error:undefined}));window.dispatchEvent(new CustomEvent('jackyun-sync-resolve',{detail:{operationId:conflict.operationId,choice}}));}}>{choice==='local'?'保留本机差异并合并':'采用云端版本'}</button>)}
      </div>
    </div>)}
    <div className="rounded-xl border border-[var(--card-border)] p-4 text-sm leading-6">
      <h3 className="font-semibold">同步范围</h3>
      <p className="mt-1 text-[var(--muted-foreground)]">Cue、复习状态、学习记录、课表、计划、答题卡草稿、写作与阅读进度、刷题数据和界面偏好会随账号同步。</p>
      <p className="mt-2 text-xs text-[var(--muted-foreground)]">前台每分钟检查其他设备的新修改；隐藏页面暂停自动同步。修改会先保存在本机，联网后继续上传，也可以点击“立即同步”。</p>
      <p className="mt-2 text-xs text-[var(--muted-foreground)]">安全例外：密码、登录令牌、个人 API Key、诊断日志不会上传；本地导入的小说正文和音频文件属于设备文件，需在目标设备重新导入。</p>
    </div>
    <div><h3 className="font-semibold">网页与 PWA 设备</h3><div className="mt-2 divide-y divide-[var(--card-border)] rounded-xl border border-[var(--card-border)]">{openDevices.map((device) => <div key={device.id} className="flex items-center gap-3 p-3"><span className="material-icons-round text-[var(--muted-foreground)]">{device.platform === 'pwa' ? 'install_mobile' : 'devices'}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{device.name}{device.id === currentDeviceId ? '（当前）' : ''}</p><p className="text-xs text-[var(--muted-foreground)]">最后活动 {new Date(device.lastSeenAt).toLocaleString()}</p></div><button onClick={() => rename(device)} className="text-xs text-[#1a73e8]">改名</button>{device.id !== currentDeviceId ? <button onClick={() => revoke(device)} className="text-xs text-[#d93025]">撤销</button> : null}</div>)}</div></div>
  </div>;
}
