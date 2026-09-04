'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { LOCAL_SYNC_STATUS_EVENT } from '@/lib/local-workspace';
import { getOrCreateDeviceId, removeConflict } from '@/lib/sync/outbox';
import { threeWayMerge } from '@/lib/sync/merge';
import type { SyncConflict, SyncDevice, SyncStatusDetail } from '@/types/sync';

export default function SyncCenterPanel() {
  const [devices, setDevices] = useState<SyncDevice[]>([]);
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState('');
  const [detail, setDetail] = useState<SyncStatusDetail>({ state: 'syncing', pending: 0, conflicts: 0, lastSyncedAt: null });
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setError('');
    try {
      const deviceId = await getOrCreateDeviceId();
      const [deviceResponse, conflictResponse] = await Promise.all([fetch('/api/sync/devices'), fetch('/api/sync/conflicts')]);
      if (!deviceResponse.ok || !conflictResponse.ok) {
        const failed = !deviceResponse.ok ? deviceResponse : conflictResponse;
        const payload = await failed.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
        throw new Error(payload?.error?.code ? `同步中心加载失败：${payload.error.code}` : `同步中心加载失败 (${failed.status})`);
      }
      const devicePayload = await deviceResponse.json() as { devices: SyncDevice[] };
      const conflictPayload = await conflictResponse.json() as { conflicts: SyncConflict[] };
      setCurrentDeviceId(deviceId);
      setDevices(devicePayload.devices);
      setConflicts(conflictPayload.conflicts);
      setDrafts(Object.fromEntries(conflictPayload.conflicts.map((item) => [item.operationId, JSON.stringify(item.localValue, null, 2)])));
    } catch (cause) { setError(cause instanceof Error ? cause.message : '同步中心加载失败'); }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    const listener = (event: Event) => setDetail((event as CustomEvent<SyncStatusDetail>).detail);
    window.addEventListener(LOCAL_SYNC_STATUS_EVENT, listener);
    return () => { window.clearTimeout(initialLoad); window.removeEventListener(LOCAL_SYNC_STATUS_EVENT, listener); };
  }, [load]);

  const openDevices = useMemo(() => devices.filter((device) => !device.revokedAt), [devices]);

  async function resolve(conflict: SyncConflict, choice: 'local' | 'remote' | 'draft') {
    if (!conflict.id) return;
    try {
      let value = choice === 'local' ? conflict.localValue : conflict.remoteValue;
      if (choice === 'draft') value = JSON.parse(drafts[conflict.operationId] || 'null');
      const deleted = choice === 'local' ? conflict.localDeleted : choice === 'remote' ? conflict.remoteDeleted : false;
      const response = await fetch('/api/sync/conflicts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conflictId: conflict.id, deviceId: currentDeviceId, value, deleted }) });
      if (!response.ok) throw new Error(response.status === 409 ? '云端内容再次变化，请刷新后重试' : '冲突解决失败');
      await removeConflict(conflict.operationId).catch(() => {});
      window.dispatchEvent(new Event('jackyun-sync-retry'));
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '冲突解决失败'); }
  }

  async function rename(device: SyncDevice) {
    const name = window.prompt('设备名称', device.name)?.trim();
    if (!name) return;
    const response = await fetch('/api/sync/devices', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: device.id, name }) });
    if (response.ok) await load(); else setError('设备改名失败');
  }

  async function revoke(device: SyncDevice) {
    if (device.id === currentDeviceId || !window.confirm(`撤销设备“${device.name}”？`)) return;
    const response = await fetch('/api/sync/devices', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: device.id }) });
    if (response.ok) await load(); else setError('撤销设备失败');
  }

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-4">
      <div><p className="font-semibold">{detail.state === 'synced' ? '数据已同步' : detail.state === 'conflict' ? '需要处理同步冲突' : detail.state === 'offline_pending' ? '修改已保存在本机，等待联网' : '正在检查同步状态'}</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">待上传 {detail.pending} 项 · 冲突 {Math.max(detail.conflicts, conflicts.length)} 项{detail.lastSyncedAt ? ` · 最近成功 ${new Date(detail.lastSyncedAt).toLocaleString()}` : ''}</p></div>
      <button type="button" onClick={() => { window.dispatchEvent(new Event('jackyun-sync-retry')); void load(); }} className="rounded-lg bg-[#1a73e8] px-3 py-2 text-sm font-semibold text-white">立即同步</button>
    </div>
    {error ? <p className="rounded-lg bg-[#fce8e6] px-3 py-2 text-sm text-[#c5221f]">{error}</p> : null}
    {detail.error ? <p className="rounded-lg bg-[#fce8e6] px-3 py-2 text-sm text-[#c5221f]">{detail.error}</p> : null}
    {conflicts.length ? <div className="space-y-3"><h3 className="font-semibold">待处理冲突</h3>{conflicts.map((conflict) => {
      const merge = conflict.localDeleted || conflict.remoteDeleted
        ? { merged: null, conflicts: ['$delete'] }
        : threeWayMerge(conflict.baseValue, conflict.localValue, conflict.remoteValue);
      return <article key={conflict.operationId} className="rounded-xl border border-[#f9ab00]/50 p-4"><div className="flex justify-between gap-3"><strong className="break-all text-sm">{conflict.key}</strong><span className="text-xs text-[var(--muted-foreground)]">云端 r{conflict.remoteRevision}</span></div><div className="mt-3 grid gap-3 md:grid-cols-3"><div><p className="mb-1 text-xs font-semibold">基础版本</p><pre className="max-h-40 overflow-auto rounded-lg bg-[var(--background)] p-2 text-xs">{JSON.stringify(conflict.baseValue, null, 2)}</pre></div><div><p className="mb-1 text-xs font-semibold">本机版本{conflict.localDeleted ? '（已删除）' : ''}</p><pre className="max-h-40 overflow-auto rounded-lg bg-[var(--background)] p-2 text-xs">{conflict.localDeleted ? '— 删除 —' : JSON.stringify(conflict.localValue, null, 2)}</pre></div><div><p className="mb-1 text-xs font-semibold">云端版本{conflict.remoteDeleted ? '（已删除）' : ''}</p><pre className="max-h-40 overflow-auto rounded-lg bg-[var(--background)] p-2 text-xs">{conflict.remoteDeleted ? '— 删除 —' : JSON.stringify(conflict.remoteValue, null, 2)}</pre></div></div><textarea aria-label={`${conflict.key} 合并结果`} value={drafts[conflict.operationId] ?? ''} onChange={(event) => setDrafts((current) => ({ ...current, [conflict.operationId]: event.target.value }))} className="mt-3 min-h-28 w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] p-2 font-mono text-xs" /><div className="mt-3 flex flex-wrap gap-2"><button onClick={() => resolve(conflict, 'local')} className="rounded-lg border px-3 py-1.5 text-xs">保留本机</button><button onClick={() => resolve(conflict, 'remote')} className="rounded-lg border px-3 py-1.5 text-xs">保留云端</button><button onClick={() => { if (!merge.conflicts.length) setDrafts((current) => ({ ...current, [conflict.operationId]: JSON.stringify(merge.merged, null, 2) })); }} disabled={merge.conflicts.length > 0} className="rounded-lg border px-3 py-1.5 text-xs disabled:opacity-40">自动合并</button><button onClick={() => resolve(conflict, 'draft')} className="rounded-lg bg-[#188038] px-3 py-1.5 text-xs text-white">提交编辑结果</button></div></article>;
    })}</div> : null}
    <div><h3 className="font-semibold">网页与 PWA 设备</h3><div className="mt-2 divide-y divide-[var(--card-border)] rounded-xl border border-[var(--card-border)]">{openDevices.map((device) => <div key={device.id} className="flex items-center gap-3 p-3"><span className="material-icons-round text-[var(--muted-foreground)]">{device.platform === 'pwa' ? 'install_mobile' : 'devices'}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{device.name}{device.id === currentDeviceId ? '（当前）' : ''}</p><p className="text-xs text-[var(--muted-foreground)]">最后活动 {new Date(device.lastSeenAt).toLocaleString()}</p></div><button onClick={() => rename(device)} className="text-xs text-[#1a73e8]">改名</button>{device.id !== currentDeviceId ? <button onClick={() => revoke(device)} className="text-xs text-[#d93025]">撤销</button> : null}</div>)}</div></div>
  </div>;
}
