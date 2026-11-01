'use client';

import { isOfflinePagePath } from '@/lib/pwa-routes';
import { APP_VERSION } from '@/lib/utils';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export default function PwaLifecycle() {
  const pathname = usePathname();
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const reloadRequested = useRef(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;

    let registration: ServiceWorkerRegistration | null = null;

    const onControllerChange = () => {
      if (!reloadRequested.current) return;
      reloadRequested.current = false;
      window.location.reload();
    };

    const observeWorker = (worker: ServiceWorker | null) => {
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) setWaitingWorker(worker);
      });
    };

    const checkLatestVersion = async () => {
      if (!navigator.onLine) return;
      try {
        const response = await fetch('/api/app-version', { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
        if (!response.ok) return;
        const result = await response.json() as { version?: unknown };
        if (typeof result.version !== 'string') return;
        const current = APP_VERSION.split('.').map(Number);
        const latest = result.version.split('.').map(Number);
        const newer = latest.length === 3 && current.length === 3 && latest.every(Number.isInteger) && current.every(Number.isInteger)
          && latest.some((part, index) => part > current[index] && latest.slice(0, index).every((prior, priorIndex) => prior === current[priorIndex]));
        setLatestVersion(newer ? result.version : null);
      } catch {
        // Version checks are best effort; offline access and local data stay untouched.
      }
    };

    const refreshUpdateStatus = () => {
      if (document.visibilityState !== 'visible') return;
      void checkLatestVersion();
      void registration?.update().catch(() => {});
    };

    const register = async () => {
      try {
        registration = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
        if (registration.waiting && navigator.serviceWorker.controller) setWaitingWorker(registration.waiting);
        registration.addEventListener('updatefound', () => observeWorker(registration?.installing ?? null));
        refreshUpdateStatus();
      } catch (error) {
        if (navigator.onLine) console.error('[PWA] Service worker registration failed', error);
      }
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    const poll = window.setInterval(refreshUpdateStatus, 5 * 60 * 1000);
    window.addEventListener('focus', refreshUpdateStatus);
    window.addEventListener('online', refreshUpdateStatus);
    document.addEventListener('visibilitychange', refreshUpdateStatus);
    window.addEventListener('load', register, { once: true });
    if (document.readyState === 'complete') void register();

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      window.clearInterval(poll);
      window.removeEventListener('focus', refreshUpdateStatus);
      window.removeEventListener('online', refreshUpdateStatus);
      document.removeEventListener('visibilitychange', refreshUpdateStatus);
      window.removeEventListener('load', register);
      registration = null;
    };
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const warm = () => {
      const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
      if (!navigator.onLine || document.hidden || connection?.saveData || ['slow-2g', '2g'].includes(connection?.effectiveType || '')) return;
      const worker = navigator.serviceWorker.controller;
      worker?.postMessage({ type: 'WARM_VISITED_ROUTE', url: window.location.href });
      worker?.postMessage({ type: 'WARM_OFFLINE_ROUTES' });
    };
    const timer = window.setTimeout(warm, 1500);
    window.addEventListener('online', warm);
    navigator.serviceWorker.addEventListener('controllerchange', warm);
    return () => { clearTimeout(timer); window.removeEventListener('online', warm); navigator.serviceWorker.removeEventListener('controllerchange', warm); };
  }, [pathname]);

  useEffect(() => {
    const followCachedRoute = (event: MouseEvent) => {
      if (navigator.onLine || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.origin !== window.location.origin || !isOfflinePagePath(anchor.pathname)) return;
      event.preventDefault();
      window.location.assign(anchor.href);
    };
    document.addEventListener('click', followCachedRoute, true);
    return () => document.removeEventListener('click', followCachedRoute, true);
  }, []);

  if ((!waitingWorker && !latestVersion) || dismissed) return null;

  return (
    <div role="status" className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] lg:bottom-4 left-1/2 z-[100] flex w-[min(calc(100%-2rem),30rem)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-3 shadow-2xl">
      <span className="material-icons-round grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e8f0fe] text-[#1a73e8] dark:bg-[#174ea6]/40 dark:text-[#aecbfa]">system_update</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[var(--foreground)]">JackYun 已有新版本{latestVersion ? ` v${latestVersion}` : ''}</p>
        <p className="text-xs text-[var(--muted-foreground)]">刷新后即可使用，当前数据不会丢失。</p>
      </div>
      <button type="button" onClick={() => setDismissed(true)} className="rounded-lg px-2 py-2 text-xs text-[var(--muted-foreground)]">稍后</button>
      <button type="button" onClick={() => { reloadRequested.current = true; if (waitingWorker) { waitingWorker.postMessage({ type: 'SKIP_WAITING' }); window.setTimeout(() => { if (reloadRequested.current) window.location.reload(); }, 4000); } else { const url = new URL(window.location.href); url.searchParams.set('_jackyun_reopen', String(Date.now())); window.location.assign(url.href); } }} className="rounded-lg bg-[var(--brand)] px-3 py-2 text-xs font-semibold text-white dark:text-[#202124]">刷新</button>
    </div>
  );
}
