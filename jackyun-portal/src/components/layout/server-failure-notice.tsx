'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LOCAL_SYNC_STATUS_EVENT } from '@/lib/local-workspace';
import type { SyncStatusDetail } from '@/types/sync';

export default function ServerFailureNotice() {
  const [detail, setDetail] = useState<SyncStatusDetail | null>(null);

  useEffect(() => {
    const onStatus = (event: Event) => setDetail((event as CustomEvent<SyncStatusDetail>).detail);
    window.addEventListener(LOCAL_SYNC_STATUS_EVENT, onStatus);
    return () => window.removeEventListener(LOCAL_SYNC_STATUS_EVENT, onStatus);
  }, []);

  if (detail?.state !== 'server_unavailable') return null;
  return <div role="alert" className="flex flex-wrap items-center justify-between gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
    <span>服务器或数据库暂时无法响应。此设备上的修改已保留，恢复连接后会继续同步。</span>
    <Link href="/server-failure" className="font-semibold underline">查看故障说明</Link>
  </div>;
}
