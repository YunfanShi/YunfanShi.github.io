'use client';

import { useEffect } from 'react';

export default function ClientLoggerBoot() {
  useEffect(() => {
    let cancelled = false;
    const start = () => {
      if (!cancelled) void import('@/lib/logger');
    };

    const idleApi = window as unknown as {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (idleApi.requestIdleCallback) {
      const id = idleApi.requestIdleCallback(start, { timeout: 2000 });
      return () => {
        cancelled = true;
        idleApi.cancelIdleCallback?.(id);
      };
    }

    const id = globalThis.setTimeout(start, 800);
    return () => {
      cancelled = true;
      globalThis.clearTimeout(id);
    };
  }, []);

  return null;
}
