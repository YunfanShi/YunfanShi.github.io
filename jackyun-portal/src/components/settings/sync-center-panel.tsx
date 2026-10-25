'use client';
import { workspaceStorage } from '@/lib/sync/repository';


import { sitePrompt, siteConfirm } from '@/lib/site-dialog';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { LOCAL_SYNC_STATUS_EVENT } from '@/lib/local-workspace';
import { fetchSyncWithTimeout } from '@/lib/request-timeout';
import { getLatestSyncStatus } from '@/lib/sync/status';
import { useAuthMode } from '@/components/auth/auth-mode-provider';
import { getConflicts, getOrCreateDeviceId, getOutbox,getSetting } from '@/lib/sync/outbox';
import {BACKUP_PAGES,legacyBackupPage} from '@/lib/backup/pages';
import SyncConflictReview from './sync-conflict-review';
import {listOfflineMutations} from '@/lib/offline/workspace';
import {getLatestLaneStates,type LaneState} from '@/lib/sync/scheduler';
import {useLocalSaveState,downloadLocalRecovery} from '@/components/layout/local-durability';
import type { SyncConflict, SyncDevice, SyncStatusDetail,SyncOperation,SyncResolutionRequest } from '@/types/sync';

export default function SyncCenterPanel() {
  const { signedIn } = useAuthMode();
  const [devices, setDevices] = useState<SyncDevice[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState('');
  const [detail, setDetail] = useState<SyncStatusDetail>({ state: 'guest', pending: 0, conflicts: 0, lastSyncedAt: null });
  const [error, setError] = useState('');
  const [lanes,setLanes]=useState<LaneState[]>([]);
  const [businessPending,setBusinessPending]=useState(0);
  const [blockedCount,setBlockedCount]=useState(0);
  const [reviews,setReviews]=useState<Array<{conflict:SyncConflict;raw:string|null;generation:number}>>([]);
  const [pending,setPending]=useState<SyncOperation[]>([]);
  const refreshReview=useCallback(async()=>{
    try {
      const [conflicts,operations]=await Promise.all([getConflicts(),getOutbox()]);
      const snapshots=conflicts.map(conflict=>({conflict,raw:workspaceStorage.getItem(conflict.key)}));
      setReviews(previous=>snapshots.map(snapshot=>{
        const old=previous.find(row=>row.conflict.operationId===snapshot.conflict.operationId);
        return old&&old.raw===snapshot.raw&&old.conflict.remoteRevision===snapshot.conflict.remoteRevision&&old.conflict.remoteHash===snapshot.conflict.remoteHash
          ?old:{...snapshot,generation:(old?.generation??0)+1};
      }));
      setPending(operations);
      const owner=await getSetting<string>('activeUserId');
      const queued=owner?await listOfflineMutations(owner):[];
      const rejected=await getSetting<unknown[]>('rejectedOperations')??[];
      setBusinessPending(queued.length);setBlockedCount(queued.filter(op=>op.blocked).length+rejected.length);
    } catch { setError('本机同步列表无法读取，请保留当前页面。'); }
  },[]);

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
      if(next.state!=='syncing')void refreshReview();
    };
    queueMicrotask(() => { const current = getLatestSyncStatus(); if (current) setDetail(current);void refreshReview(); });
    const onLane=()=>{void getSetting<string>('activeUserId').then(owner=>setLanes(getLatestLaneStates().filter(row=>row.userId===owner)));};
    queueMicrotask(onLane);window.addEventListener('jackyun-sync-lane',onLane);
    window.addEventListener(LOCAL_SYNC_STATUS_EVENT, listener);
    const onLocal=()=>void refreshReview();
    for(const name of ['storage','jackyun-sync-edit','focus'])window.addEventListener(name,onLocal);
    return () => { window.removeEventListener('jackyun-sync-lane',onLane);window.clearTimeout(initialLoad); window.removeEventListener(LOCAL_SYNC_STATUS_EVENT, listener);for(const name of ['storage','jackyun-sync-edit','focus'])window.removeEventListener(name,onLocal); };
  }, [load,refreshReview]);

  function submitResolution(request:SyncResolutionRequest) {
    setDetail(current=>({...current,state:'syncing',error:undefined,progress:'正在核对版本并上传合并结果…'}));
    window.dispatchEvent(new CustomEvent('jackyun-sync-resolve',{detail:request}));
  }

  const openDevices = useMemo(() => devices.filter((device) => !device.revokedAt), [devices]);

  async function rename(device: SyncDevice) {
    const name = (await sitePrompt('设备名称', device.name))?.trim();
    if (!name) return;
    const response = await fetchSyncWithTimeout('/api/sync/devices', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: device.id, name }) });
    if (response.ok) await load(); else setError('设备改名失败');
  }

  async function revoke(device: SyncDevice) {
    if (device.id === currentDeviceId || !(await siteConfirm(`撤销设备“${device.name}”？`))) return;
    const response = await fetchSyncWithTimeout('/api/sync/devices', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: device.id }) });
    if (response.ok) await load(); else setError('撤销设备失败');
  }

  const local=useLocalSaveState();
  const status = local==='storage_error'?'本机保存未完成，请下载恢复副本':local==='saving'?'正在保存到本机':detail.state === 'guest'
    ? '当前为本机模式，登录后才能同步'
    : detail.state === 'auth_required'?'等待重新登录，本机内容和队列保留'
    : detail.state === 'access_denied'?'账号或设备权限需要处理，已暂停上传'
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
    <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={downloadLocalRecovery}>下载本机恢复副本</button>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-4">
      <div><p className="font-semibold">{status}</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">待上传 {detail.pending} 项 · 待处理冲突 {detail.conflicts} 项{detail.lastSyncedAt ? ` · 最近成功 ${new Date(detail.lastSyncedAt).toLocaleString()}` : ''}</p></div>
      <button type="button" disabled={!signedIn || detail.state === 'syncing'} onClick={() => { setDetail((current) => ({ ...current, state: 'syncing', error: undefined, progress: '已收到立即同步请求…' })); window.dispatchEvent(new Event('jackyun-sync-retry')); }} className="rounded-lg bg-[#1a73e8] px-3 py-2 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60">{detail.state === 'syncing' ? '同步中…' : '立即同步'}</button>
    </div>
    {detail.progress && <p role="status" aria-live="polite" className="text-sm text-[var(--muted-foreground)]">{detail.progress}</p>}
    {error ? <p className="rounded-lg bg-[#fce8e6] px-3 py-2 text-sm text-[#c5221f]">{error}</p> : null}
    <div className="grid gap-2 text-sm sm:grid-cols-3">{(['workspace','business','backup'] as const).map(lane=>{
      const current=lanes.filter(row=>row.lane===lane).at(-1);const name=lane==='workspace'?'工作区同步':lane==='business'?'任务与复习':'自动备份';
      return <div key={lane} className="rounded-lg border border-[var(--card-border)] p-3"><p className="font-medium">{name}</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">{current?.state==='syncing'?'正在处理':current?.state==='auth_required'?'等待登录或权限处理':current?.state==='waiting'?'保留队列，等待重试':current?.lastSuccessAt?'最近一轮已完成':'尚无完成记录'}{lane==='business'?` · ${businessPending} 项待确认`:''}</p>{current?.lastSuccessAt&&<p className="mt-1 text-xs text-[var(--muted-foreground)]">{new Date(current.lastSuccessAt).toLocaleString()}</p>}</div>;
    })}</div>
    {blockedCount>0&&<p role="status" className="text-sm text-amber-700">{blockedCount} 项操作需要检查，原内容已保留，其他项目继续同步。请下载恢复副本后检查账号权限或操作内容。</p>}
    {detail.error ? <p className="rounded-lg bg-[#fce8e6] px-3 py-2 text-sm text-[#c5221f]">{detail.error}</p> : null}
    {reviews.length>0&&<div className="flex items-center justify-between gap-3"><h2 className="font-semibold">检查差异并决定合并结果</h2><button type="button" disabled={detail.state==='syncing'} className="rounded-lg border border-[var(--card-border)] px-3 py-2 text-sm disabled:opacity-50" onClick={()=>{void refreshReview();window.dispatchEvent(new Event('jackyun-sync-retry'));}}>刷新对比</button></div>}
    {reviews.map(({conflict,raw,generation})=><SyncConflictReview key={`${conflict.operationId}:${generation}`} conflict={conflict} localRaw={raw} disabled={!signedIn||detail.state==='syncing'} onSubmit={submitResolution}/>)}
    {pending.length>0&&<details className="rounded-xl border border-[var(--card-border)] p-4 text-sm"><summary className="cursor-pointer font-semibold">查看待上传项目（{pending.length}）</summary><div className="mt-3 space-y-2">{pending.map(operation=><div key={operation.id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-[var(--background)] p-3"><div className="min-w-0"><p>{BACKUP_PAGES.find(item=>item.id===legacyBackupPage(operation.key))?.label}</p><p className="break-all text-xs text-[var(--muted-foreground)]">{operation.key}</p></div><p className="text-xs text-[var(--muted-foreground)]">{reviews.some(row=>row.conflict.key===operation.key)?'等待选择合并结果':operation.resolvesOperationId?'合并结果待云端确认':operation.deleted?'删除待确认':'修改待上传'} · 基线版本 {operation.baseRevision}</p></div>)}</div></details>}
    <div className="rounded-xl border border-[var(--card-border)] p-4 text-sm leading-6">
      <h3 className="font-semibold">同步范围</h3>
      <p className="mt-1 text-[var(--muted-foreground)]">Cue、复习状态、学习记录、课表、计划、答题卡草稿、写作与阅读进度、刷题数据和界面偏好会随账号同步。</p>
      <p className="mt-2 text-xs text-[var(--muted-foreground)]">可见页面每30秒检查其他设备的新修改；隐藏页面暂停普通轮询。修改会先保存在本机，联网后继续上传，也可以点击“立即同步”。</p>
      <p className="mt-2 text-xs text-[var(--muted-foreground)]">安全例外：密码、登录令牌、个人 API Key、诊断日志不会上传；本地导入的小说正文和音频文件属于设备文件，需在目标设备重新导入。</p>
    </div>
    <div><h3 className="font-semibold">网页与 PWA 设备</h3><div className="mt-2 divide-y divide-[var(--card-border)] rounded-xl border border-[var(--card-border)]">{openDevices.map((device) => <div key={device.id} className="flex items-center gap-3 p-3"><span className="material-icons-round text-[var(--muted-foreground)]">{device.platform === 'pwa' ? 'install_mobile' : 'devices'}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{device.name}{device.id === currentDeviceId ? '（当前）' : ''}</p><p className="text-xs text-[var(--muted-foreground)]">最后活动 {new Date(device.lastSeenAt).toLocaleString()}</p></div><button onClick={() => rename(device)} className="text-xs text-[#1a73e8]">改名</button>{device.id !== currentDeviceId ? <button onClick={() => revoke(device)} className="text-xs text-[#d93025]">撤销</button> : null}</div>)}</div></div>
  </div>;
}
