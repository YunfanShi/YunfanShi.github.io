'use client';

import type { SyncConflict, SyncOperation, SyncRecord } from '@/types/sync';
import { compactSyncOperations } from '@/lib/sync/batch';

const DB_NAME = 'jackyun-sync-v2';
const DB_VERSION = 1;
export type SyncMetadata = SyncRecord;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('metadata')) db.createObjectStore('metadata', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('conflicts')) db.createObjectStore('conflicts', { keyPath: 'operationId' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeRequest<T>(storeName: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const request = action(transaction.objectStore(storeName));
      let result: T;
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    });
  } finally { db.close(); }
}

export function getOutbox(): Promise<SyncOperation[]> {
  return storeRequest('outbox', 'readonly', (store) => store.getAll());
}

async function updateOutbox(action: (store: IDBObjectStore, operations: SyncOperation[]) => SyncOperation[]): Promise<SyncOperation[]> {
  const db = await openDatabase();
  try {
    return await new Promise<SyncOperation[]>((resolve, reject) => {
      const transaction = db.transaction('outbox', 'readwrite');
      const store = transaction.objectStore('outbox');
      const request = store.getAll();
      let result: SyncOperation[] = [];
      request.onsuccess = () => { result = action(store, request.result); };
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    });
  } finally { db.close(); }
}

export async function compactOutbox(): Promise<SyncOperation[]> {
  return updateOutbox((store, operations) => {
    const compacted = compactSyncOperations(operations);
    const retainedIds = new Set(compacted.map((operation) => operation.id));
    for (const operation of operations) if (!retainedIds.has(operation.id)) store.delete(operation.id);
    for (const operation of compacted) store.put(operation);
    return compacted;
  });
}

export async function queueOperation(operation: SyncOperation): Promise<void> {
  await updateOutbox((store, operations) => {
    const matching = operations.filter((item) => item.key === operation.key);
    const next = compactSyncOperations([...matching, operation])[0];
    for (const previous of matching) store.delete(previous.id);
    store.put(next);
    return [next];
  });
}

export async function removeOperation(id: string): Promise<void> {
  await storeRequest('outbox', 'readwrite', (store) => store.delete(id));
}

export function getMetadata(): Promise<SyncMetadata[]> {
  return storeRequest('metadata', 'readonly', (store) => store.getAll());
}

export async function saveMetadata(metadata: SyncMetadata): Promise<void> {
  await storeRequest('metadata', 'readwrite', (store) => store.put(metadata));
}

export function getConflicts(): Promise<SyncConflict[]> {
  return storeRequest('conflicts', 'readonly', (store) => store.getAll());
}

export async function saveConflict(conflict: SyncConflict): Promise<void> {
  await storeRequest('conflicts', 'readwrite', (store) => store.put(conflict));
}

export async function removeConflict(operationId: string): Promise<void> {
  await storeRequest('conflicts', 'readwrite', (store) => store.delete(operationId));
}

export async function clearConflicts(): Promise<void> {
  await storeRequest('conflicts', 'readwrite', (store) => store.clear());
}

export async function getSetting<T>(key: string): Promise<T | null> {
  const row = await storeRequest<{ key: string; value: T } | undefined>('settings', 'readonly', (store) => store.get(key));
  return row?.value ?? null;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await storeRequest('settings', 'readwrite', (store) => store.put({ key, value }));
}

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await getSetting<string>('deviceId');
  if (existing) return existing;
  const id = crypto.randomUUID();
  await setSetting('deviceId', id);
  return id;
}
