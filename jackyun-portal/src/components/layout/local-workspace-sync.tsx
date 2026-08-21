'use client';

import { useEffect } from 'react';
import {
  LOCAL_SYNC_STATUS_EVENT,
  isSyncableStorageKey,
  storageValueToString,
} from '@/lib/local-workspace';

type SyncState = 'guest' | 'syncing' | 'synced' | 'offline';

function announce(state: SyncState) {
  window.dispatchEvent(new CustomEvent(LOCAL_SYNC_STATUS_EVENT, { detail: { state } }));
}

function localSnapshot(): Record<string, string> {
  const snapshot: Record<string, string> = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key || !isSyncableStorageKey(key)) continue;
    const value = localStorage.getItem(key);
    if (value !== null && value.length <= 100_000) snapshot[key] = value;
  }
  return snapshot;
}

async function upload(entries: Record<string, string>) {
  const pairs = Object.entries(entries).map(([key, value]) => ({ key, value }));
  if (!pairs.length) return true;
  const response = await fetch('/api/legacy-sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries: pairs }),
  });
  return response.ok;
}

async function removeFromCloud(keys: string[]) {
  await Promise.all(keys.map((key) => fetch('/api/legacy-sync', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  })));
}

export default function LocalWorkspaceSync({ userId }: { userId: string | null }) {
  useEffect(() => {
    if (!userId) {
      localStorage.setItem('jackyun_guest_mode', 'true');
      announce('guest');
      return;
    }

    localStorage.removeItem('jackyun_guest_mode');
    let cancelled = false;
    let lastSnapshot: Record<string, string> = {};

    const sync = async (initial = false) => {
      try {
        announce('syncing');
        if (initial) {
          const response = await fetch('/api/legacy-sync', { cache: 'no-store' });
          if (!response.ok) throw new Error('Cloud sync unavailable');
          const payload = await response.json() as { data?: Record<string, unknown> };
          for (const [key, cloudValue] of Object.entries(payload.data ?? {})) {
            if (!isSyncableStorageKey(key) || localStorage.getItem(key) !== null) continue;
            localStorage.setItem(key, storageValueToString(cloudValue));
          }
        }

        const snapshot = localSnapshot();
        const serialized = JSON.stringify(snapshot);
        if (serialized !== JSON.stringify(lastSnapshot)) {
          const removedKeys = Object.keys(lastSnapshot).filter((key) => !(key in snapshot));
          if (!await upload(snapshot)) throw new Error('Cloud sync rejected');
          if (removedKeys.length) await removeFromCloud(removedKeys);
          lastSnapshot = snapshot;
        }
        if (!cancelled) announce('synced');
      } catch {
        if (!cancelled) announce('offline');
      }
    };

    void sync(true);
    const timer = window.setInterval(() => void sync(), 5_000);
    const onOnline = () => void sync();
    window.addEventListener('online', onOnline);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('online', onOnline);
    };
  }, [userId]);

  return null;
}
