'use client';

import { useState } from 'react';
import Link from 'next/link';

type CheckState = 'idle' | 'checking' | 'offline' | 'unavailable' | 'reachable';

export default function ServerFailurePage() {
  const [state, setState] = useState<CheckState>('idle');

  async function check() {
    if (!navigator.onLine) { setState('offline'); return; }
    setState('checking');
    try {
      const response = await fetch('/api/health', { cache: 'no-store' });
      setState(response.ok ? 'reachable' : 'unavailable');
    } catch {
      setState(navigator.onLine ? 'unavailable' : 'offline');
    }
  }

  return <div className="mx-auto max-w-2xl space-y-5 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
    <div>
      <p className="text-sm font-semibold text-red-600">Server Failure · 服务器故障</p>
      <h1 className="mt-2 text-2xl font-semibold">连接状态与数据保护</h1>
    </div>
    <p>服务器或数据库暂时无法响应。当前设备保存的学习数据仍保留在本机；请到数据与隐私设置导出本地分享 JSON 或查看本地备份。</p>
    <button type="button" onClick={check} disabled={state === 'checking'} className="rounded-lg bg-[var(--primary)] px-4 py-2 text-[var(--primary-foreground)] disabled:opacity-50">{state === 'checking' ? '检查中…' : '检查服务器'}</button>
    {state === 'offline' && <p role="status">当前设备没有网络连接。请先恢复网络，再检查服务器。</p>}
    {state === 'unavailable' && <p role="status">设备有网络，但网站或数据库目前无法正常响应。请稍后重试，暂时不要退出账号。</p>}
    {state === 'reachable' && <p role="status">网站和数据库当前可以响应。学习数据仍以本机为准；可在设置中手动上传备份或导出本地分享 JSON。</p>}
    <div className="flex flex-wrap gap-4 text-sm font-medium text-[var(--primary)]">
      <Link href="/settings?section=data" className="underline">打开备份中心</Link>
    </div>
  </div>;
}
