'use client';

import { useEffect, useState } from 'react';
import { readOfflineSnapshot, saveOfflineSnapshot, type OfflineScope } from '@/lib/offline/workspace';

export function useOfflineSnapshot<T>(userId: string, scope: OfflineScope, initialValue: T) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    let cancelled = false;
    void readOfflineSnapshot<T>(userId, scope).then((cached) => {
      if (!cancelled && cached) setValue(cached);
    });
    if (navigator.onLine) void saveOfflineSnapshot(userId, scope, initialValue);
    const onSnapshot = (event: Event) => {
      const detail = (event as CustomEvent<{ scope: OfflineScope; value: T }>).detail;
      if (detail.scope === scope) setValue(detail.value);
    };
    window.addEventListener('jackyun-offline-snapshot', onSnapshot);
    return () => { cancelled = true; window.removeEventListener('jackyun-offline-snapshot', onSnapshot); };
  }, [initialValue, scope, userId]);

  return [value, setValue] as const;
}
