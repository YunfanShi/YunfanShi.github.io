'use client';
import { workspaceStorage } from '../sync/repository.ts';


import { isBackupableLegacyKey, legacyBackupPage, type BackupPage } from './pages.ts';

const DB_NAME = 'jackyun-page-backups-v1';

export type LocalBackup = {
  id: number;
  userId: string;
  page: BackupPage;
  createdAt: string;
  values: Record<string, string>;
  deletedKeys?: string[];
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('versions', { keyPath: 'id', autoIncrement: true });
      store.createIndex('ownerPage', ['userId', 'page']);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore, finish: (value: T) => void) => void): Promise<T> {
  return openDatabase().then((db) => new Promise<T>((resolve, reject) => {
    const tx = db.transaction('versions', mode);
    let value: T;
    tx.oncomplete = () => { db.close(); resolve(value); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Local backup transaction aborted')); };
    operation(tx.objectStore('versions'), (result) => { value = result; });
  }));
}

export function getLocalBackupLimit(): number {
  return 10;
}

function samePageValues(left: Record<string, string>, right: Record<string, string>): boolean {
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => left[key] === right[key]);
}

export function pruneLocalBackups(userId: string): Promise<void> {
  return transaction<void>('readwrite', (store, finish) => {
    // Retention needs only ownership and primary keys, never snapshot contents.
    const request = store.index('ownerPage').openKeyCursor();
    const byPage = new Map<BackupPage, number[]>();
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        const [owner, page] = cursor.key as [string, BackupPage];
        if (owner === userId) {
          const ids = byPage.get(page) ?? [];
          ids.push(cursor.primaryKey as number);
          byPage.set(page, ids);
        }
        cursor.continue();
        return;
      }
      for (const ids of byPage.values()) {
        ids.sort((a, b) => b - a);
        for (const id of ids.slice(getLocalBackupLimit())) store.delete(id);
      }
      finish();
    };
  });
}

export function localPageValues(snapshot: Record<string, string>, page: BackupPage): Record<string, string> {
  return Object.fromEntries(Object.entries(snapshot).filter(([key]) => isBackupableLegacyKey(key) && legacyBackupPage(key) === page));
}

export function listLocalBackups(userId: string, page: BackupPage): Promise<LocalBackup[]> {
  return transaction('readonly', (store, finish) => {
    const request = store.index('ownerPage').getAll(IDBKeyRange.only([userId, page]));
    request.onsuccess = () => finish((request.result as LocalBackup[])
      .sort((a, b) => b.id - a.id));
  });
}

export async function saveLocalBackup(userId: string, page: BackupPage, values: Record<string, string>): Promise<void> {
  if (!Object.keys(values).length) return;
  await transaction<void>('readwrite', (store, finish) => {
    const index = store.index('ownerPage');
    const range = IDBKeyRange.only([userId, page]);
    const request = index.openCursor(range, 'prev');
    request.onsuccess = () => {
      const latest = request.result?.value as LocalBackup | undefined;
      if (latest && samePageValues(latest.values, values)) { finish(); return; }
      const keys = index.getAllKeys(range);
      keys.onsuccess = () => {
        const ids = (keys.result as number[]).sort((a, b) => b - a);
        store.add({ userId, page, values, createdAt: new Date().toISOString() });
        for (const id of ids.slice(Math.max(0, getLocalBackupLimit() - 1))) store.delete(id);
        finish();
      };
    };
  });
}

/** Await this before an intentional sign-out; pagehide cannot await IndexedDB. */
export async function saveCurrentLocalBackups(userId: string): Promise<void> {
  const snapshot: Record<string, string> = {};
  for (let index = 0; index < workspaceStorage.length; index += 1) {
    const key = workspaceStorage.key(index);
    if (!key || !isBackupableLegacyKey(key)) continue;
    const value = workspaceStorage.getItem(key);
    if (value !== null) snapshot[key] = value;
  }
  const pages = new Set(Object.keys(snapshot).map(legacyBackupPage));
  for (const page of pages) await saveLocalBackup(userId, page, localPageValues(snapshot, page));
}
