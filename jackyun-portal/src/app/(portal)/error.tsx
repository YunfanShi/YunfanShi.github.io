'use client';

import { useEffect } from 'react';

export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[portal-error]', error); }, [error]);
  return <section className="mx-auto max-w-xl rounded-2xl border border-[#fecdca] bg-[#fffbfa] p-6 text-[#b42318] dark:bg-[#3b1715] dark:text-[#fda29b]">
    <h1 className="text-lg font-semibold">此页面暂时没有加载成功</h1>
    <p className="mt-2 text-sm leading-6">你的本机数据不会丢失。请重试；如果仍失败，可打开设置切换到本机模式后继续使用。</p>
    <button type="button" onClick={reset} className="mt-4 rounded-lg bg-[#b42318] px-4 py-2 text-sm font-semibold text-white">重新加载</button>
  </section>;
}
