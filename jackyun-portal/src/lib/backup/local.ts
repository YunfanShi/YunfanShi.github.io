'use client';

import { isBackupableLegacyKey, legacyBackupPage, type BackupPage } from './pages';

const DB_NAME = 'jackyun-page-backups-v1';
const LIMIT_KEY = 'jackyun_backup_local_limit';

export type LocalBackup = {
  id: number;
  userId: string;
  page: BackupPage;
  createdAt: string;
  values: Record<string, string>;
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

export function getLocalBackupLimit(): 20 | 50 | 100 {
  const value = Number(localStorage.getItem(LIMIT_KEY));
  return value === 20 || value === 100 ? value : 50;
}

export function setLocalBackupLimit(value: 20 | 50 | 100) {
  localStorage.setItem(LIMIT_KEY, String(value));
}

export function pruneLocalBackups(userId: string): Promise<void> {
  return transaction<void>('readwrite', (store, finish) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const byPage = new Map<BackupPage, LocalBackup[]>();
      for (const item of request.result as LocalBackup[]) {
        if (item.userId !== userId) continue;
        byPage.set(item.page, [...(byPage.get(item.page) ?? []), item]);
      }
      for (const versions of byPage.values()) {
        versions.sort((a, b) => b.id - a.id);
        for (const old of versions.slice(getLocalBackupLimit())) store.delete(old.id);
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
    const request = store.index('ownerPage').getAll(IDBKeyRange.only([userId, page]));
    request.onsuccess = () => {
      const previous = (request.result as LocalBackup[])
        .sort((a, b) => b.id - a.id);
      if (previous[0] && JSON.stringify(previous[0].values) === JSON.stringify(values)) { finish(); return; }
      store.add({ userId, page, values, createdAt: new Date().toISOString() });
      for (const old of previous.slice(Math.max(0, getLocalBackupLimit() - 1))) store.delete(old.id);
      finish();
    };
  });
}
