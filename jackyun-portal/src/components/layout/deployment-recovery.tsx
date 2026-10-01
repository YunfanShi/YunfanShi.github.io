'use client';

import { useEffect } from 'react';
import { retryStylesheet } from '@/lib/stylesheet-recovery';

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
    const retryMissingStyles = () => {
      if (!navigator.onLine) return;
      document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]').forEach((link) => retryStylesheet(link, window.location.origin));
    };
    const onError = (event: ErrorEvent) => {
      if (event.target instanceof HTMLLinkElement) {
        if (navigator.onLine) retryStylesheet(event.target, window.location.origin);
        return;
      }
      recover(event.error ?? event.message);
    };
    const onRejection = (event: PromiseRejectionEvent) => recover(event.reason);
    // Resource errors do not bubble; capture them and inspect initial failures
    // that happened before React mounted as well.
    window.addEventListener('error', onError, true);
    window.addEventListener('load', retryMissingStyles);
    window.addEventListener('online', retryMissingStyles);
    if (document.readyState === 'complete') retryMissingStyles();
    window.addEventListener('unhandledrejection', onRejection);
    const timer = window.setTimeout(() => sessionStorage.removeItem(storageKey), 30_000);
    return () => {
      window.removeEventListener('error', onError, true);
      window.removeEventListener('load', retryMissingStyles);
      window.removeEventListener('online', retryMissingStyles);
      window.removeEventListener('unhandledrejection', onRejection);
      window.clearTimeout(timer);
    };
  }, []);
  return null;
}
