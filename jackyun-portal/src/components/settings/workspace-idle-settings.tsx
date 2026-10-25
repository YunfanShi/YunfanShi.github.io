'use client';
import { workspaceStorage } from '@/lib/sync/repository';

import { useEffect, useState } from 'react';
import { CLOUD_STATE_APPLIED_EVENT } from '@/lib/local-workspace';
import { IDLE_MINUTES_KEY, IDLE_SETTINGS_EVENT, readIdleMinutes } from '@/lib/workspace-idle';
export default function WorkspaceIdleSettings() {
  const [minutes, setMinutes] = useState(30);
  useEffect(() => {
    const refresh = () => setMinutes(readIdleMinutes());
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener(CLOUD_STATE_APPLIED_EVENT, refresh);
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener(CLOUD_STATE_APPLIED_EVENT, refresh); };
  }, []);
  return <label className="flex flex-col gap-3 text-sm"><span>空闲多久后休眠</span><select className="rounded-xl border border-white/15 bg-transparent p-3" value={minutes} onChange={(event) => {
    const value = Number(event.target.value);
    workspaceStorage.setItem(IDLE_MINUTES_KEY, String(value));
    setMinutes(value);
    window.dispatchEvent(new Event(IDLE_SETTINGS_EVENT));
    window.dispatchEvent(new Event('jackyun-sync-edit'));
  }}>{[5, 15, 30, 60].map((value) => <option key={value} value={value}>{value} 分钟</option>)}<option value={0}>关闭</option></select><span className="text-xs opacity-70">休眠前保存自动保存内容与本地备份，尝试上传修改；休眠时暂停后台同步，操作后恢复。上传失败会保留待上传队列。</span></label>;
}
