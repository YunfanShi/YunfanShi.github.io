'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { LOCAL_SYNC_STATUS_EVENT } from '@/lib/local-workspace';
import { getOrCreateDeviceId } from '@/lib/sync/outbox';
import type { SyncDevice, SyncStatusDetail } from '@/types/sync';

export default function SyncCenterPanel() {
  const [devices, setDevices] = useState<SyncDevice[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState('');
  const [detail, setDetail] = useState<SyncStatusDetail>({ state: 'syncing', pending: 0, conflicts: 0, lastSyncedAt: null });
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const deviceId = await getOrCreateDeviceId();
      const deviceResponse = await fetch('/api/sync/devices');
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
    const listener = (event: Event) => setDetail((event as CustomEvent<SyncStatusDetail>).detail);
    window.addEventListener(LOCAL_SYNC_STATUS_EVENT, listener);
    return () => { window.clearTimeout(initialLoad); window.removeEventListener(LOCAL_SYNC_STATUS_EVENT, listener); };
  }, [load]);

  const openDevices = useMemo(() => devices.filter((device) => !device.revokedAt), [devices]);

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

  const status = detail.state === 'synced'
    ? '数据已自动同步'
    : detail.state === 'offline_pending'
      ? '修改已保存在本机，联网后自动同步'
      : detail.state === 'error'
        ? '自动同步暂时失败'
        : '正在自动同步';

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-4">
      <div><p className="font-semibold">{status}</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">待上传 {detail.pending} 项 · 冲突自动处理{detail.lastSyncedAt ? ` · 最近成功 ${new Date(detail.lastSyncedAt).toLocaleString()}` : ''}</p></div>
      <button type="button" onClick={() => { window.dispatchEvent(new Event('jackyun-sync-retry')); void load(); }} className="rounded-lg bg-[#1a73e8] px-3 py-2 text-sm font-semibold text-white">立即同步</button>
    </div>
    {error ? <p className="rounded-lg bg-[#fce8e6] px-3 py-2 text-sm text-[#c5221f]">{error}</p> : null}
    {detail.error ? <p className="rounded-lg bg-[#fce8e6] px-3 py-2 text-sm text-[#c5221f]">{detail.error}</p> : null}
    <div><h3 className="font-semibold">网页与 PWA 设备</h3><div className="mt-2 divide-y divide-[var(--card-border)] rounded-xl border border-[var(--card-border)]">{openDevices.map((device) => <div key={device.id} className="flex items-center gap-3 p-3"><span className="material-icons-round text-[var(--muted-foreground)]">{device.platform === 'pwa' ? 'install_mobile' : 'devices'}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{device.name}{device.id === currentDeviceId ? '（当前）' : ''}</p><p className="text-xs text-[var(--muted-foreground)]">最后活动 {new Date(device.lastSeenAt).toLocaleString()}</p></div><button onClick={() => rename(device)} className="text-xs text-[#1a73e8]">改名</button>{device.id !== currentDeviceId ? <button onClick={() => revoke(device)} className="text-xs text-[#d93025]">撤销</button> : null}</div>)}</div></div>
  </div>;
}
