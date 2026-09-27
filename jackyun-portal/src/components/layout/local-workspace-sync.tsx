'use client';

import { fetchSyncWithTimeout } from '@/lib/request-timeout';
import { syncRetryDelay, shouldPauseSync } from '@/lib/sync/retry-policy';
import { useEffect } from 'react';
import { remoteRecordIsCurrent } from '@/lib/sync/remote-record';
import { createSyncRunGate } from '@/lib/sync/run-gate';
import { announceSyncStatus as announce, getLatestSyncStatus } from '@/lib/sync/status';
import { CLOUD_STATE_APPLIED_EVENT, MAX_SYNC_VALUE_CHARACTERS, isSyncableStorageKey, storageValueToString, syncValueFits } from '@/lib/local-workspace';
import { bindSyncUser, clearConflicts, compactOutbox, getMetadata, getOrCreateDeviceId, getOutbox, getSetting, queueOperation, removeOperation, saveMetadata, setSetting } from '@/lib/sync/outbox';
import { buildSyncRequest, MAX_SYNC_BATCH_BYTES } from '@/lib/sync/batch';
import { canonicalJson } from '@/lib/sync/hash';
import { joinSyncParts, splitSyncBody } from '@/lib/sync/transfer';
import { SCHEDULE_STORAGE_KEY, scheduleHasContent, shouldQueueLocalValue } from '@/lib/sync/schedule-safety';
import { isBackupableLegacyKey, legacyBackupPage, type BackupPage } from '@/lib/backup/pages';
import { localPageValues, saveLocalBackup } from '@/lib/backup/local';
import { backupIsDue, recordBackupChange, type PendingBackup } from '@/lib/backup/cadence';
import { createDueBackupVersions } from '@/actions/backup-center';
import { isServerUnavailable, SyncHttpError } from '@/lib/sync/service-error';
import type { SyncConflict, SyncRecord, SyncStatus } from '@/types/sync';

function localSnapshot(includeLarge = false): Record<string, string> {
  const snapshot: Record<string, string> = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key || !isSyncableStorageKey(key)) continue;
    const value = localStorage.getItem(key);
    if (value !== null && (includeLarge || value.length <= MAX_SYNC_VALUE_CHARACTERS)) snapshot[key] = value;
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

async function publishStatus(state: SyncStatus, error?: string, progress?: string) {
  const [pending, lastSyncedAt] = await Promise.all([getOutbox(), getSetting<string>('lastSyncedAt')]);
  announce({ state, pending: pending.length, conflicts: 0, lastSyncedAt, error, progress });
}

export default function LocalWorkspaceSync({ userId }: { userId: string | null }) {
  useEffect(() => {
    let owner = userId ?? 'guest';
    let previous = localSnapshot(true);
    let pending = Promise.resolve();
    const dirtyPages = new Map<BackupPage, PendingBackup>();
    const capture = () => {
      const current = localSnapshot(true);
      const now = Date.now();
      for (const key of new Set([...Object.keys(previous), ...Object.keys(current)])) {
        if (previous[key] !== current[key] && isBackupableLegacyKey(key)) {
          const page = legacyBackupPage(key);
          const bytes = new TextEncoder().encode(current[key] ?? previous[key] ?? '').byteLength;
          dirtyPages.set(page, recordBackupChange(dirtyPages.get(page), bytes, now));
        }
      }
      previous = current;
    };
    const checkpoint = (force = false) => {
      capture();
      const now = Date.now();
      const pages = [...dirtyPages].filter(([, pendingPage]) => force || backupIsDue(pendingPage, now));
      for (const [page] of pages) dirtyPages.delete(page);
      const snapshot = previous;
      if (!pages.length) return;
      pending = pending.then(async () => {
        for (const [page, pendingPage] of pages) {
          try { await saveLocalBackup(owner, page, localPageValues(snapshot, page)); }
          catch (error) {
            const newer = dirtyPages.get(page);
            dirtyPages.set(page, {
              bytes: Math.max(pendingPage.bytes, newer?.bytes ?? 0),
              firstChangedAt: Math.min(pendingPage.firstChangedAt, newer?.firstChangedAt ?? pendingPage.firstChangedAt),
            });
            console.error('[Backup] Local version write failed', error);
          }
        }
      });
    };
    pending = pending.then(async () => {
      owner = userId ?? await getSetting<string>('activeUserId') ?? 'guest';
      for (const page of new Set(Object.keys(previous).filter(isBackupableLegacyKey).map(legacyBackupPage))) {
        await saveLocalBackup(owner, page, localPageValues(previous, page));
      }
    }).catch((error) => { console.error('[Backup] Local baseline failed', error); });
    const timer = window.setInterval(() => checkpoint(), 2_000);
    const onStorage = () => checkpoint();
    const onLeave = () => checkpoint(true);
    const onVisibility = () => { if (document.visibilityState === 'hidden') onLeave(); };
    window.addEventListener('storage', onStorage);
    window.addEventListener('pagehide', onLeave);
    document.addEventListener('visibilitychange', onVisibility);
    return () => { onLeave(); window.clearInterval(timer); window.removeEventListener('storage', onStorage); window.removeEventListener('pagehide', onLeave); document.removeEventListener('visibilitychange', onVisibility); };
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    const runGate = createSyncRunGate();
    let bound = false;
    let signingOut = false;
    let failures = 0;
    let retryAt = 0;
    let authPaused = false;
    let lastBackupCheck = 0;
    let lastSnapshot: Record<string, string> = {};

    if (!userId) {
      // A failed token refresh is not a confirmed sign-out. Retain the local
      // outbox and account marker until this account is available again.
      announce({ state: 'guest', pending: 0, conflicts: 0, lastSyncedAt: null });
      return;
    }
    localStorage.removeItem('jackyun_guest_mode');
    void publishStatus('syncing', undefined, '正在初始化同步…');
    const reportProgress = (progress: string) => {
      if (cancelled) return;
      const current = getLatestSyncStatus();
      announce({ state: 'syncing', pending: current?.pending ?? 0, conflicts: 0, lastSyncedAt: current?.lastSyncedAt ?? null, progress });
    };

    async function queueChanges() {
      const snapshot = localSnapshot(true);
      const metadata = await getMetadata();
      const metadataByKey = new Map(metadata.map((item) => [item.key, item]));
      const pendingByKey = new Map((await getOutbox()).map((item) => [item.key, item]));
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
        if (!shouldQueueLocalValue(key, current, lastSnapshot[key])) continue;
        const queued = pendingByKey.get(key);
        if (queued && queued.deleted === (current === undefined)
            && (queued.deleted || canonicalJson(parseStorageValue(current)) === canonicalJson(queued.value))) continue;
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

    async function loadLargeValue(key: string, revision: number): Promise<unknown> {
      const parts: string[] = [];
      let count = 1;
      for (let part = 0; part < count; part += 1) {
        reportProgress(`下载分片 ${part + 1} / ${count}`);
        const response = await fetchSyncWithTimeout(`/api/sync/v2/large?key=${encodeURIComponent(key)}&revision=${revision}&part=${part}`, { cache: 'no-store' });
        if (!response.ok) throw new SyncHttpError(`同步分片下载失败 (${response.status})`, response.status);
        const chunk = await response.json() as { count: number; data: string };
        count = chunk.count;
        parts.push(chunk.data);
      }
      return joinSyncParts(parts);
    }

    async function flush(deviceId: string): Promise<void> {
      const operations = await compactOutbox();
      if (!operations.length) return;
      await publishStatus('syncing');
      // The current RPC compares revision/hash, not baseValue. Old cloud data
      // can exceed today's limit; omit that unused field for the upload.
      const uploadable = operations.map((operation) => syncValueFits(operation.baseValue)
        ? operation : { ...operation, baseValue: null });
      const oversized = uploadable.find((operation) => !syncValueFits(operation.value));
      const request = buildSyncRequest(deviceId, deviceDescription(), oversized ? [oversized] : uploadable);
      const large = Boolean(oversized)
        || new TextEncoder().encode(request.body).length > MAX_SYNC_BATCH_BYTES;
      let response: Response;
      if (large) {
        const operation = request.operations[0];
        const parts = splitSyncBody(request.body);
        for (let index = 0; index < parts.length; index += 1) {
          reportProgress(`上传分片 ${index + 1} / ${parts.length}`);
          const partResponse = await fetchSyncWithTimeout('/api/sync/v2/large', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uploadId: operation.id, index, count: parts.length, data: parts[index] }),
          });
          if (!partResponse.ok) throw new SyncHttpError(`同步分片上传失败 (${partResponse.status})`, partResponse.status);
        }
        reportProgress('分片已上传，正在保存到云端…');
        response = await fetchSyncWithTimeout('/api/sync/v2/large', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uploadId: operation.id, complete: true }),
        });
      } else {
        reportProgress(`上传 ${request.operations.length} 项修改…`);
        response = await fetchSyncWithTimeout('/api/sync/v2', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: request.body,
        });
      }
      if (!response.ok) {
        const failure = await response.json().catch(() => null) as { error?: { code?: string; message?: string }; requestId?: string } | null;
        const detail = failure?.error?.code
          ? `${failure.error.message ?? '同步写入失败'} (${failure.error.code})${failure.requestId ? ` · ${failure.requestId}` : ''}`
          : `同步写入失败 (${response.status})`;
        console.error('[Sync/BETA diagnostics] Write failed', { status: response.status, code: failure?.error?.code, requestId: failure?.requestId, pending: request.operations.length });
        throw new SyncHttpError(detail, response.status);
      }
      const payload = await response.json() as {
        applied: Array<{ operationId: string; key: string; revision: number; contentHash: string; updatedAt?: string }>;
        remote: SyncRecord[];
        conflicts: SyncConflict[];
      };
      const acknowledged = new Set([
        ...payload.applied.map((item) => item.operationId),
        ...(payload.remote ?? []).map((item) => request.operations.find((operation) => operation.key === item.key)?.id),
        ...payload.conflicts.map((item) => item.operationId),
      ]);
      if (!request.operations.some((operation) => acknowledged.has(operation.id))) throw new Error('云端没有确认本次修改，待上传数据已保留。');
      const byId = new Map(request.operations.map((operation) => [operation.id, operation]));
      const byKey = new Map(request.operations.map((operation) => [operation.key, operation]));
      const appliedRemoteKeys: string[] = [];
      for (const applied of payload.applied) {
        const operation = byId.get(applied.operationId);
        if (!operation) continue;
        await saveMetadata({ key: operation.key, value: operation.value, revision: applied.revision, contentHash: applied.contentHash, deleted: operation.deleted, updatedAt: applied.updatedAt ?? operation.clientUpdatedAt });
        await removeOperation(applied.operationId);
      }
      for (const record of payload.remote ?? []) {
        const matchingOperation = byKey.get(record.key);
        if (!matchingOperation) continue;
        if (record.large) record.value = await loadLargeValue(record.key, record.revision);
        const current = localStorage.getItem(record.key);
        const localHasNotChanged = matchingOperation.deleted
          ? current === null
          : current !== null && canonicalJson(parseStorageValue(current)) === canonicalJson(matchingOperation.value);
        if (localHasNotChanged) {
          const next = record.deleted ? null : storageValueToString(record.value);
          if (current !== next) {
            if (record.deleted) localStorage.removeItem(record.key);
            else localStorage.setItem(record.key, next!);
            appliedRemoteKeys.push(record.key);
          }
        }
        await saveMetadata(record);
        await removeOperation(matchingOperation.id);
      }
      for (const conflict of payload.conflicts) {
        const operation = byId.get(conflict.operationId);
        if (!operation) continue;
        if (conflict.remoteLarge) conflict.remoteValue = await loadLargeValue(conflict.key, conflict.remoteRevision);
        await removeOperation(operation.id);
        const remoteIsNewer = conflict.remoteUpdatedAt
          && Date.parse(conflict.remoteUpdatedAt) > Date.parse(operation.clientUpdatedAt);
        if (remoteIsNewer) {
          if (conflict.remoteDeleted) localStorage.removeItem(operation.key);
          else localStorage.setItem(operation.key, storageValueToString(conflict.remoteValue));
          appliedRemoteKeys.push(operation.key);
          await saveMetadata({ key: operation.key, value: conflict.remoteValue, revision: conflict.remoteRevision, contentHash: conflict.remoteHash, deleted: conflict.remoteDeleted, updatedAt: conflict.remoteUpdatedAt! });
        } else {
          await queueOperation({ ...operation, id: crypto.randomUUID(), baseRevision: conflict.remoteRevision, baseHash: conflict.remoteHash, baseValue: conflict.remoteValue, resolvesOperationId: conflict.operationId });
        }
      }
      if (appliedRemoteKeys.length) window.dispatchEvent(new CustomEvent(CLOUD_STATE_APPLIED_EVENT, { detail: { keys: appliedRemoteKeys } }));
    }

    async function pull() {
      const [cursor, pending] = await Promise.all([getSetting<string>('cursor'), getOutbox()]);
      const pendingKeys = new Set(pending.map((item) => item.key));
      const response = await fetchSyncWithTimeout(`/api/sync/v2${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { cache: 'no-store' });
      if (!response.ok) {
        const failure = await response.json().catch(() => null) as { error?: { code?: string; message?: string }; requestId?: string } | null;
        const detail = failure?.error?.code
          ? `${failure.error.message ?? '同步读取失败'} (${failure.error.code})${failure.requestId ? ` · ${failure.requestId}` : ''}`
          : `同步读取失败 (${response.status})`;
        console.error('[Sync/BETA diagnostics] Read failed', { status: response.status, code: failure?.error?.code, requestId: failure?.requestId });
        throw new SyncHttpError(detail, response.status);
      }
      const payload = await response.json() as { records: SyncRecord[]; cursor: string };
      const metadataByKey = new Map((await getMetadata()).map((record) => [record.key, record]));
      const records = payload.records.filter((record) => !remoteRecordIsCurrent(
        record, metadataByKey.get(record.key), localStorage.getItem(record.key),
      ));
      if (!pendingKeys.has(SCHEDULE_STORAGE_KEY)
          && !scheduleHasContent(parseStorageValue(localStorage.getItem(SCHEDULE_STORAGE_KEY) ?? undefined))
          && !payload.records.some((record) => record.key === SCHEDULE_STORAGE_KEY)) {
        const scheduleResponse = await fetchSyncWithTimeout(`/api/sync/v2?key=${encodeURIComponent(SCHEDULE_STORAGE_KEY)}`, { cache: 'no-store' });
        if (!scheduleResponse.ok) throw new SyncHttpError(`Schedule 云端读取失败 (${scheduleResponse.status})`, scheduleResponse.status);
        const schedulePayload = await scheduleResponse.json() as { records: SyncRecord[] };
        records.push(...schedulePayload.records);
      }
      for (const record of records) {
        if (!record.large || pendingKeys.has(record.key)) continue;
        record.value = await loadLargeValue(record.key, record.revision);
        record.large = false;
      }
      const appliedRemoteKeys: string[] = [];
      for (const record of records) {
        if (pendingKeys.has(record.key)) continue;
        const current = localStorage.getItem(record.key) ?? undefined;
        const emptyScheduleNeedsCloud = record.key === SCHEDULE_STORAGE_KEY
          && !scheduleHasContent(parseStorageValue(current)) && scheduleHasContent(record.value);
        if (current === lastSnapshot[record.key] || emptyScheduleNeedsCloud) {
          const next = record.deleted ? undefined : storageValueToString(record.value);
          if (current !== next) {
            if (record.deleted) localStorage.removeItem(record.key);
            else localStorage.setItem(record.key, next!);
            appliedRemoteKeys.push(record.key);
          }
        }
        await saveMetadata(record);
      }
      if (appliedRemoteKeys.length) window.dispatchEvent(new CustomEvent(CLOUD_STATE_APPLIED_EVENT, { detail: { keys: appliedRemoteKeys } }));
      await setSetting('cursor', payload.cursor);
      await queueChanges();
    }

    async function sync(onlyPending = false, manual = false) {
      if (cancelled || signingOut || !bound) return;
      if (!runGate.begin(manual)) return;
      if (manual) { authPaused = false; retryAt = 0; }
      try {
        if (authPaused || Date.now() < retryAt) { await queueChanges(); return; }
        if (!navigator.onLine) {
          await queueChanges();
          if (!cancelled) await publishStatus('offline_pending');
          return;
        }
        if (!onlyPending) await publishStatus('syncing', undefined, '正在读取云端并检查本机修改…');
        const deviceId = await getOrCreateDeviceId();
        await clearConflicts();
        await queueChanges();
        if (onlyPending && !(await getOutbox()).length) return;
        for (const operation of await getOutbox()) {
          if (operation.key === SCHEDULE_STORAGE_KEY && !scheduleHasContent(operation.deleted ? null : operation.value)) {
            await removeOperation(operation.id);
          }
        }
        await pull();
        await flush(deviceId);
        await queueChanges();
        for (let batch = 1; batch < 100 && !cancelled && (await getOutbox()).length; batch += 1) {
          await flush(deviceId);
          await queueChanges();
        }
        if (cancelled) return;
        if ((await getOutbox()).length) {
          await publishStatus('offline_pending', undefined, '本轮已保存的修改保留在云端，剩余修改将继续同步。');
          return;
        }
        const now = new Date().toISOString();
        await setSetting('lastSyncedAt', now);
        if (Date.now() - lastBackupCheck >= 5 * 60_000) {
          lastBackupCheck = Date.now();
          try { await createDueBackupVersions(); }
          catch (error) { console.warn('[Backup] Deferred cloud backup failed', error); }
        }
        failures = 0;
        retryAt = 0;
        if (!cancelled) await publishStatus('synced');
      } catch (error) {
        failures += 1;
        retryAt = Date.now() + syncRetryDelay(failures);
        authPaused = shouldPauseSync(error);
        if (!cancelled) await publishStatus(!navigator.onLine ? 'offline_pending' : isServerUnavailable(error, navigator.onLine) ? 'server_unavailable' : 'error', error instanceof Error ? error.message : 'Sync failed');
      } finally {
        if (runGate.finish() && !cancelled && !signingOut) void sync(false, true);
      }
    }

    lastSnapshot = localSnapshot(true);
    void bindSyncUser(userId).then(() => { bound = true; return sync(); }).catch((error) => {
      if (!cancelled) void publishStatus('error', error instanceof Error ? error.message : '无法绑定同步账户');
    });
    // Frequent Schedule edits wait briefly so one burst becomes one sync.
    // Idle ticks only capture local changes; no database liveness polling.
    let editTimer: number | null = null;
    const onEdit = () => {
      if (editTimer !== null) window.clearTimeout(editTimer);
      editTimer = window.setTimeout(() => { editTimer = null; void sync(true); }, 8_000);
    };
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void sync(true); }, 30_000);
    const onSync = () => void sync();
    const onRetry = () => { reportProgress('已收到立即同步请求，正在同步…'); void sync(false, true); };
    const onSignOut = () => { signingOut = true; };
    const onSignOutCancel = () => { signingOut = false; };
    window.addEventListener('jackyun-signout-start', onSignOut);
    window.addEventListener('jackyun-signout-cancel', onSignOutCancel);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void sync();
      else void queueChanges();
    };
    const onLeave = () => { void queueChanges(); };
    const onBeforeSignOut = (event: Event) => {
      const complete = (event as CustomEvent<{ complete: () => void }>).detail?.complete;
      void queueChanges().then(() => sync()).finally(() => complete?.());
    };
    window.addEventListener('online', onSync);
    window.addEventListener('focus', onSync);
    window.addEventListener('pagehide', onLeave);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('jackyun-sync-retry', onRetry);
    window.addEventListener('jackyun-sync-edit', onEdit);
    window.addEventListener('jackyun-sync-before-signout', onBeforeSignOut);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      if (editTimer !== null) window.clearTimeout(editTimer);
      window.removeEventListener('online', onSync);
      window.removeEventListener('focus', onSync);
      window.removeEventListener('pagehide', onLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('jackyun-sync-retry', onRetry);
      window.removeEventListener('jackyun-signout-start', onSignOut);
      window.removeEventListener('jackyun-signout-cancel', onSignOutCancel);
      window.removeEventListener('jackyun-sync-edit', onEdit);
      window.removeEventListener('jackyun-sync-before-signout', onBeforeSignOut);
    };
  }, [userId]);

  return null;
}
