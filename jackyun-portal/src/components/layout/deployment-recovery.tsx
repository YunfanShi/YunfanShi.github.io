'use client';

import { useEffect } from 'react';

const STALE_ASSET_ERROR = /ChunkLoadError|Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module|Failed to load module script/i;

export default function DeploymentRecovery() {
  useEffect(() => {
    const storageKey = `jackyun_chunk_recovery:${window.location.pathname}`;
    const recover = (reason: unknown) => {
      const message = reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason ?? '');
      if (!STALE_ASSET_ERROR.test(message) || sessionStorage.getItem(storageKey)) return;
      sessionStorage.setItem(storageKey, '1');
      window.location.reload();
    };
    const onError = (event: ErrorEvent) => recover(event.error ?? event.message);
    const onRejection = (event: PromiseRejectionEvent) => recover(event.reason);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    const timer = window.setTimeout(() => sessionStorage.removeItem(storageKey), 30_000);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
      window.clearTimeout(timer);
    };
  }, []);
  return null;
}
