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
    <p>服务器或数据库无法响应时，已在此设备保存的修改不会因同步失败而删除。请保持登录，连接恢复后再同步；需要找回较早的数据时，到备份中心比较并恢复版本。</p>
    <button type="button" onClick={check} disabled={state === 'checking'} className="rounded-lg bg-[var(--primary)] px-4 py-2 text-[var(--primary-foreground)] disabled:opacity-50">{state === 'checking' ? '检查中…' : '检查服务器'}</button>
    {state === 'offline' && <p role="status">当前设备没有网络连接。请先恢复网络，再检查服务器。</p>}
    {state === 'unavailable' && <p role="status">设备有网络，但网站或数据库目前无法正常响应。请稍后重试，暂时不要退出账号。</p>}
    {state === 'reachable' && <p role="status">网站和数据库当前可以响应。若同步仍报错，请到同步中心查看具体错误并重试。</p>}
    <div className="flex flex-wrap gap-4 text-sm font-medium text-[var(--primary)]">
      <Link href="/settings?section=companion" className="underline">打开同步中心</Link>
      <Link href="/settings?section=data" className="underline">打开备份中心</Link>
    </div>
  </div>;
}
