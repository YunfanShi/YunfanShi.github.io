'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { probeBrowserCookieSupport } from '@/lib/browser-cookie-support';

export default function CookieCompatibilityGate({ children }: { children: ReactNode }) {
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setSupported(probeBrowserCookieSupport()));
    return () => window.cancelAnimationFrame(frame);
  }, []);
  if (supported === true) return children;
  if (supported === null) return <main aria-busy="true" className="min-h-dvh bg-[var(--background)]" />;
  return <main className="grid min-h-dvh place-items-center bg-[var(--background)] px-5 py-10 text-[var(--foreground)]"><section className="w-full max-w-xl rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-7 shadow-lg"><p className="text-xs font-bold uppercase tracking-[.14em] text-[var(--brand)]">浏览器兼容性</p><h1 className="mt-3 text-2xl font-bold">此浏览器未允许本网站使用 Cookie</h1><p className="mt-3 text-sm leading-7 text-[var(--muted-foreground)]">网站已安全加载，但登录、云端同步和学习页面需要 Cookie。请在浏览器的隐私设置中允许此网站使用 Cookie，然后刷新页面。你的本机数据不会因为这条提示被删除。</p><button type="button" onClick={() => window.location.reload()} className="mt-5 min-h-11 rounded-full bg-[var(--brand)] px-5 text-sm font-semibold text-white">重新检查</button></section></main>;
}
