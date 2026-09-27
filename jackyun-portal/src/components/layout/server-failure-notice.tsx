'use client';

import { SERVICE_ERROR_EVENT, serviceErrorMessage } from '@/lib/service-errors';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LOCAL_SYNC_STATUS_EVENT } from '@/lib/local-workspace';
import type { SyncStatusDetail } from '@/types/sync';

export default function ServerFailureNotice() {
  const [detail, setDetail] = useState<SyncStatusDetail | null>(null);

  const [serviceError, setServiceError] = useState<string | null>(null);
  useEffect(() => {
    const onStatus = (event: Event) => setDetail((event as CustomEvent<SyncStatusDetail>).detail);
    const onServiceError = (event: Event) => setServiceError(serviceErrorMessage((event as CustomEvent).detail));
    window.addEventListener(SERVICE_ERROR_EVENT, onServiceError);
    window.addEventListener(LOCAL_SYNC_STATUS_EVENT, onStatus);
    return () => { window.removeEventListener(SERVICE_ERROR_EVENT, onServiceError); window.removeEventListener(LOCAL_SYNC_STATUS_EVENT, onStatus); };
  }, []);

  if (detail?.state !== 'server_unavailable' && !serviceError) return null;
  return <div role="alert" className="flex flex-wrap items-center justify-between gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
    <span>{serviceError ?? '服务器或数据库暂时无法响应。（SERVICE_UNAVAILABLE）此设备上的修改已保留，恢复连接后会继续同步。'}</span>
    {serviceError && <button type="button" onClick={() => setServiceError(null)} className="underline">关闭提示</button>}
    <Link href="/server-failure" className="font-semibold underline">查看故障说明</Link>
  </div>;
}
