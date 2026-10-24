'use client';

import { fetchSyncWithTimeout } from '@/lib/request-timeout';

export type OfflineScope = 'tasks' | 'review' | 'reading';

export interface OfflineMutation {
  id: string;
  userId: string;
  kind: string;
  payload: Record<string, unknown>;
  createdAt: string;
  attemptCount?: number;
  nextAttemptAt?: string;
  lastError?: string;
}

interface SnapshotRow<T = unknown> {
  id: string;
  userId: string;
  scope: OfflineScope;
  value: T;
  updatedAt: string;
}

const DB_NAME = 'jackyun-offline-workspace';
const DB_VERSION = 1;
const USER_KEY = 'active-user';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact<T>(stores: string | string[], mode: IDBTransactionMode, run: (transaction: IDBTransaction) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(stores, mode);
      const request = run(transaction);
      let value: T;
      request.onsuccess = () => { value = request.result; };
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve(value);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('Offline database transaction aborted'));
    });
  } finally {
    db.close();
  }
}

async function clearStores(): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(['snapshots', 'outbox', 'settings'], 'readwrite');
      transaction.objectStore('snapshots').clear();
      transaction.objectStore('outbox').clear();
      transaction.objectStore('settings').clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('Offline database clear aborted'));
    });
  } finally {
    db.close();
  }
}

export async function bindOfflineWorkspaceUser(userId: string | null): Promise<void> {
  // Missing claims or intentional logout must not discard pending work.
  if (!userId) return;
  const existing = await transact<{ key: string; value: string } | undefined>('settings', 'readonly', (transaction) => transaction.objectStore('settings').get(USER_KEY));
  if (existing?.value && existing.value !== userId) {
    if ((await listOfflineMutations(existing.value)).length) throw new Error('此设备保留着另一账户的离线操作，请先登录原账户同步。');
    await clearStores();
  }
  await transact('settings', 'readwrite', (transaction) => transaction.objectStore('settings').put({ key: USER_KEY, value: userId }));
}

export async function clearOfflineWorkspace(): Promise<void> {
  await clearStores();
}

export async function saveOfflineSnapshot<T>(userId: string, scope: OfflineScope, value: T): Promise<void> {
  const row: SnapshotRow<T> = { id: `${userId}:${scope}`, userId, scope, value, updatedAt: new Date().toISOString() };
  await transact('snapshots', 'readwrite', (transaction) => transaction.objectStore('snapshots').put(row));
  window.dispatchEvent(new CustomEvent('jackyun-offline-snapshot', { detail: { userId, scope, value } }));
}

export async function readOfflineSnapshot<T>(userId: string, scope: OfflineScope): Promise<T | null> {
  const row = await transact<SnapshotRow<T> | undefined>('snapshots', 'readonly', (transaction) => transaction.objectStore('snapshots').get(`${userId}:${scope}`));
  return row?.userId === userId ? row.value : null;
}

export async function queueOfflineMutation(userId: string, kind: string, payload: Record<string, unknown>): Promise<void> {
  const operation: OfflineMutation = { id: crypto.randomUUID(), userId, kind, payload, createdAt: new Date().toISOString() };
  await transact('outbox', 'readwrite', (transaction) => transaction.objectStore('outbox').put(operation));
  window.dispatchEvent(new CustomEvent('jackyun-offline-queued', { detail: operation }));
}

export async function listOfflineMutations(userId: string): Promise<OfflineMutation[]> {
  const rows = await transact<OfflineMutation[]>('outbox', 'readonly', (transaction) => transaction.objectStore('outbox').getAll());
  return rows.filter((row) => row.userId === userId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function removeOfflineMutation(id: string): Promise<void> {
  await transact('outbox', 'readwrite', (transaction) => transaction.objectStore('outbox').delete(id));
  window.dispatchEvent(new CustomEvent('jackyun-offline-synced', { detail: { id } }));
}

export async function deferOfflineMutation(id: string, error: string, now = Date.now()): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('outbox', 'readwrite');
      const store = transaction.objectStore('outbox');
      const request = store.get(id);
      request.onsuccess = () => {
        const operation = request.result as OfflineMutation | undefined;
        if (!operation) return;
        const attemptCount = (operation.attemptCount ?? 0) + 1;
        const delay = Math.min(5 * 60_000, 5_000 * 2 ** Math.min(attemptCount - 1, 6));
        store.put({ ...operation, attemptCount, nextAttemptAt: new Date(now + delay).toISOString(), lastError: error.slice(0, 240) });
      };
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('Offline retry schedule aborted'));
    });
  } finally { db.close(); }
}

class OfflineApiError extends Error {}

export async function runOfflineMutation(userId: string, kind: string, payload: Record<string, unknown>): Promise<'synced' | 'queued'> {
  const operation: OfflineMutation = { id: crypto.randomUUID(), userId, kind, payload, createdAt: new Date().toISOString() };
  if (typeof navigator === 'undefined' || !navigator.onLine) {
    await persistMutation(operation);
    return 'queued';
  }
  try {
    const response = await fetchSyncWithTimeout('/api/offline/workspace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operationId: operation.id, kind, payload }),
    });
    if (!response.ok) {
      if (response.status >= 500 || response.status === 408 || response.status === 429 || response.status === 401 || response.status === 403 || response.status === 409) {
        await persistMutation(operation);
        await deferOfflineMutation(operation.id, `HTTP ${response.status}`);
        return 'queued';
      }
      throw new OfflineApiError(`Offline mutation failed (${response.status})`);
    }
    return 'synced';
  } catch (error) {
    if (error instanceof OfflineApiError) throw error;
    await persistMutation(operation);
    await deferOfflineMutation(operation.id, error instanceof Error ? error.message : 'Network request failed');
    return 'queued';
  }
}

async function persistMutation(operation: OfflineMutation): Promise<void> {
  await transact('outbox', 'readwrite', (transaction) => transaction.objectStore('outbox').put(operation));
  window.dispatchEvent(new CustomEvent('jackyun-offline-queued', { detail: operation }));
}
