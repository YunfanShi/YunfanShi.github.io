'use client';

import { useEffect, useRef, useState } from 'react';

export default function PwaLifecycle() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [dismissed, setDismissed] = useState(false);
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

    const register = async () => {
      try {
        registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        if (registration.waiting && navigator.serviceWorker.controller) setWaitingWorker(registration.waiting);
        registration.addEventListener('updatefound', () => observeWorker(registration?.installing ?? null));
      } catch (error) {
        console.error('[PWA] Service worker registration failed', error);
      }
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    window.addEventListener('load', register, { once: true });
    if (document.readyState === 'complete') void register();

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      window.removeEventListener('load', register);
      registration = null;
    };
  }, []);

  if (!waitingWorker || dismissed) return null;

  return (
    <div role="status" className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-[100] flex w-[min(calc(100%-2rem),30rem)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-3 shadow-2xl">
      <span className="material-icons-round grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e8f0fe] text-[#1a73e8] dark:bg-[#174ea6]/40 dark:text-[#aecbfa]">system_update</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[var(--foreground)]">JackYun 已有新版本</p>
        <p className="text-xs text-[var(--muted-foreground)]">刷新后即可使用，当前数据不会丢失。</p>
      </div>
      <button type="button" onClick={() => setDismissed(true)} className="rounded-lg px-2 py-2 text-xs text-[var(--muted-foreground)]">稍后</button>
      <button type="button" onClick={() => { reloadRequested.current = true; waitingWorker.postMessage({ type: 'SKIP_WAITING' }); }} className="rounded-lg bg-[var(--brand)] px-3 py-2 text-xs font-semibold text-white dark:text-[#202124]">刷新</button>
    </div>
  );
}
