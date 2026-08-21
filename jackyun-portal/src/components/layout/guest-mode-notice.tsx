'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { LOCAL_SYNC_STATUS_EVENT } from '@/lib/local-workspace';

type SyncState = 'guest' | 'syncing' | 'synced' | 'offline';

const labels: Record<SyncState, string> = {
  guest: '游客模式 · 数据仅保存在此设备',
  syncing: '正在同步本地数据…',
  synced: '已登录 · 本地与云端已同步',
  offline: '暂时离线 · 数据已安全保存在本地',
};

export default function GuestModeNotice({ signedIn }: { signedIn: boolean }) {
  const [state, setState] = useState<SyncState>(signedIn ? 'syncing' : 'guest');

  useEffect(() => {
    const handler = (event: Event) => {
      const next = (event as CustomEvent<{ state?: SyncState }>).detail?.state;
      if (next) setState(next);
    };
    window.addEventListener(LOCAL_SYNC_STATUS_EVENT, handler);
    return () => window.removeEventListener(LOCAL_SYNC_STATUS_EVENT, handler);
  }, []);

  return (
    <div className={`flex min-h-9 items-center justify-center gap-2 px-3 py-1.5 text-center text-xs ${signedIn ? 'bg-[#e6f4ea] text-[#137333] dark:bg-[#123522] dark:text-[#81c995]' : 'bg-[#fef7e0] text-[#8a4f00] dark:bg-[#3d2f12] dark:text-[#fdd663]'}`}>
      <span className="material-icons-round text-base">{signedIn ? (state === 'offline' ? 'cloud_off' : 'cloud_done') : 'person_outline'}</span>
      <span>{labels[state]}</span>
      {!signedIn && <Link href="/login" className="font-semibold underline underline-offset-2">登录并开启云同步</Link>}
    </div>
  );
}
