'use client';

import { useEffect } from 'react';
import { LOCAL_SYNC_STATUS_EVENT, isSyncableStorageKey, storageValueToString } from '@/lib/local-workspace';
import { clearConflicts, compactOutbox, getMetadata, getOrCreateDeviceId, getOutbox, getSetting, queueOperation, removeOperation, saveMetadata, setSetting } from '@/lib/sync/outbox';
import { buildSyncRequest } from '@/lib/sync/batch';
import { canonicalJson } from '@/lib/sync/hash';
import type { SyncConflict, SyncRecord, SyncStatus, SyncStatusDetail } from '@/types/sync';

function announce(detail: SyncStatusDetail) {
  window.dispatchEvent(new CustomEvent(LOCAL_SYNC_STATUS_EVENT, { detail }));
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

function parseStorageValue(value: string | undefined): unknown {
  if (value === undefined) return null;
  try { return JSON.parse(value); } catch { return value; }
}

function deviceDescription() {
  const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches;
  return {
    name: `${mobile ? 'Mobile' : 'Desktop'} ${standalone ? 'PWA' : 'Browser'}`,
    platform: standalone ? 'pwa' : mobile ? 'mobile-web' : 'web',
  };
}

async function publishStatus(state: SyncStatus, error?: string) {
  const [pending, lastSyncedAt] = await Promise.all([getOutbox(), getSetting<string>('lastSyncedAt')]);
  announce({ state, pending: pending.length, conflicts: 0, lastSyncedAt, error });
}

export default function LocalWorkspaceSync({ userId }: { userId: string | null }) {
  useEffect(() => {
    let cancelled = false;
    let running = false;
    let lastSnapshot: Record<string, string> = {};

    if (!userId) {
      localStorage.setItem('jackyun_guest_mode', 'true');
      announce({ state: 'guest', pending: 0, conflicts: 0, lastSyncedAt: null });
      return;
    }
    localStorage.removeItem('jackyun_guest_mode');

    async function queueChanges() {
      const snapshot = localSnapshot();
      const metadata = await getMetadata();
      const metadataByKey = new Map(metadata.map((item) => [item.key, item]));
      let legacyTimestamps: Record<string, string> = {};
      try {
        legacyTimestamps = JSON.parse(localStorage.getItem('jackyun_sync_timestamps') || '{}') as Record<string, string>;
      } catch {}
      // Metadata keys are required here: if the tab closes after localStorage
      // deletion but before the polling tick, startup must still enqueue a tombstone.
      const keys = new Set([...Object.keys(lastSnapshot), ...Object.keys(snapshot), ...metadataByKey.keys()]);
      for (const key of keys) {
        const current = snapshot[key];
        const base = metadataByKey.get(key);
        if (current === lastSnapshot[key] && base) continue;
        const matchesCloudBase = base
          && base.deleted === (current === undefined)
          && (base.deleted || canonicalJson(parseStorageValue(current)) === canonicalJson(base.value));
        if (matchesCloudBase) continue;
        const legacyTimestamp = !base && Number.isFinite(Date.parse(legacyTimestamps[key]))
          ? new Date(legacyTimestamps[key]).toISOString()
          : null;
        await queueOperation({
          id: crypto.randomUUID(), key,
          baseRevision: base?.revision ?? 0,
          baseHash: base?.contentHash ?? null,
          baseValue: base?.deleted ? null : base?.value ?? null,
          value: parseStorageValue(current),
          deleted: current === undefined,
          clientUpdatedAt: legacyTimestamp ?? new Date().toISOString(),
        });
      }
      lastSnapshot = snapshot;
    }

    async function flush(deviceId: string): Promise<void> {
      const operations = await compactOutbox();
      if (!operations.length) return;
      await publishStatus('syncing');
      const request = buildSyncRequest(deviceId, deviceDescription(), operations);
      const response = await fetch('/api/sync/v2', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: request.body,
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
        throw new Error(failure?.error?.code ? `${failure.error.message ?? '同步写入失败'} (${failure.error.code})` : `同步写入失败 (${response.status})`);
      }
      const payload = await response.json() as {
        applied: Array<{ operationId: string; key: string; revision: number; contentHash: string; updatedAt?: string }>;
        remote: SyncRecord[];
        conflicts: SyncConflict[];
      };
      const byId = new Map(request.operations.map((operation) => [operation.id, operation]));
      const byKey = new Map(request.operations.map((operation) => [operation.key, operation]));
      for (const applied of payload.applied) {
        const operation = byId.get(applied.operationId);
        if (!operation) continue;
        await saveMetadata({ key: operation.key, value: operation.value, revision: applied.revision, contentHash: applied.contentHash, deleted: operation.deleted, updatedAt: applied.updatedAt ?? operation.clientUpdatedAt });
        await removeOperation(applied.operationId);
      }
      for (const record of payload.remote ?? []) {
        const matchingOperation = byKey.get(record.key);
        if (!matchingOperation) continue;
        const current = localStorage.getItem(record.key);
        const localHasNotChanged = matchingOperation.deleted
          ? current === null
          : current !== null && canonicalJson(parseStorageValue(current)) === canonicalJson(matchingOperation.value);
        if (localHasNotChanged) {
          if (record.deleted) localStorage.removeItem(record.key);
          else localStorage.setItem(record.key, storageValueToString(record.value));
        }
        await saveMetadata(record);
        await removeOperation(matchingOperation.id);
      }
      for (const conflict of payload.conflicts) {
        const operation = byId.get(conflict.operationId);
        if (!operation) continue;
        await removeOperation(operation.id);
        const remoteIsNewer = conflict.remoteUpdatedAt
          && Date.parse(conflict.remoteUpdatedAt) > Date.parse(operation.clientUpdatedAt);
        if (remoteIsNewer) {
          if (conflict.remoteDeleted) localStorage.removeItem(operation.key);
          else localStorage.setItem(operation.key, storageValueToString(conflict.remoteValue));
          await saveMetadata({ key: operation.key, value: conflict.remoteValue, revision: conflict.remoteRevision, contentHash: conflict.remoteHash, deleted: conflict.remoteDeleted, updatedAt: conflict.remoteUpdatedAt! });
        } else {
          await queueOperation({ ...operation, id: crypto.randomUUID(), baseRevision: conflict.remoteRevision, baseHash: conflict.remoteHash, baseValue: conflict.remoteValue, resolvesOperationId: conflict.operationId });
        }
      }
    }

    async function pull() {
      const [cursor, pending] = await Promise.all([getSetting<string>('cursor'), getOutbox()]);
      const pendingKeys = new Set(pending.map((item) => item.key));
      const response = await fetch(`/api/sync/v2${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { cache: 'no-store' });
      if (!response.ok) {
        const failure = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
        throw new Error(failure?.error?.code ? `${failure.error.message ?? '同步读取失败'} (${failure.error.code})` : `同步读取失败 (${response.status})`);
      }
      const payload = await response.json() as { records: SyncRecord[]; cursor: string };
      for (const record of payload.records) {
        if (pendingKeys.has(record.key)) continue;
        const current = localStorage.getItem(record.key) ?? undefined;
        if (current === lastSnapshot[record.key]) {
          if (record.deleted) localStorage.removeItem(record.key);
          else localStorage.setItem(record.key, storageValueToString(record.value));
        }
        await saveMetadata(record);
      }
      await setSetting('cursor', payload.cursor);
      await queueChanges();
    }

    async function sync() {
      if (running || cancelled) return;
      running = true;
      try {
        const deviceId = await getOrCreateDeviceId();
        await clearConflicts();
        await queueChanges();
        await flush(deviceId);
        await queueChanges();
        await pull();
        await flush(deviceId);
        const now = new Date().toISOString();
        await setSetting('lastSyncedAt', now);
        if (!cancelled) await publishStatus('synced');
      } catch (error) {
        if (!cancelled) await publishStatus(navigator.onLine ? 'error' : 'offline_pending', error instanceof Error ? error.message : 'Sync failed');
      } finally { running = false; }
    }

    lastSnapshot = localSnapshot();
    void sync();
    // Changes are durable in IndexedDB immediately; a calmer network cadence
    // avoids continuous RSC/API contention while keeping cross-device sync prompt.
    const timer = window.setInterval(() => void sync(), 30_000);
    const onSync = () => void sync();
    const onVisibility = () => { if (document.visibilityState === 'visible') void sync(); };
    window.addEventListener('online', onSync);
    window.addEventListener('focus', onSync);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('jackyun-sync-retry', onSync);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('online', onSync);
      window.removeEventListener('focus', onSync);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('jackyun-sync-retry', onSync);
    };
  }, [userId]);

  return null;
}
