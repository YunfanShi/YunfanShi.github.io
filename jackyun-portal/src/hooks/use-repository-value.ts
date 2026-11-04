'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { workspaceStorage } from '@/lib/sync/repository';

/** Subscribe to one repository key; the raw string is a stable React snapshot. */
export function useRepositoryValue(key: string): string | null {
  const subscribe = useCallback((listener: () => void) => workspaceStorage.subscribe(key, listener), [key]);
  const getSnapshot = useCallback(() => workspaceStorage.getSnapshot(key), [key]);
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

export function useRepositorySaveStatus(key: string): 'saving' | 'saved' | 'storage_error' {
  const subscribe = useCallback((listener: () => void) => workspaceStorage.subscribeSaveStatus(key, listener), [key]);
  const getSnapshot = useCallback(() => workspaceStorage.getSaveStatus(key), [key]);
  return useSyncExternalStore(subscribe, getSnapshot, () => 'saving');
}
