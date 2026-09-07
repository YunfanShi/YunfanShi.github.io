'use client';

import { useEffect } from 'react';

export default function AdminError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[admin-error]', error); }, [error]);
  return <section className="mx-auto max-w-xl rounded-2xl border border-[#fecdca] bg-[#fffbfa] p-6 text-[#b42318]">
    <h1 className="text-lg font-semibold">管理员页面暂时无法加载</h1>
    <p className="mt-2 text-sm leading-6">服务端页面渲染失败。请重新加载；若仍出现，可从浏览器控制台复制错误信息。</p>
    <button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-lg bg-[#b42318] px-4 py-2 text-sm font-semibold text-white">重新加载</button>
  </section>;
}
