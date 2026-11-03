'use client';

const DATABASE = 'jackyun-local-data-v1';
const STORE = 'values';

function openLocalData(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onerror = () => reject(request.error ?? new Error('本机 IndexedDB 无法打开。'));
    request.onblocked = () => reject(new Error('本机 IndexedDB 正在被其他页面占用。'));
  });
}

export type LocalDataRow = { key: string; value: string };

export async function readLocalData(): Promise<LocalDataRow[]> {
  const db = await openLocalData();
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly'), request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result as LocalDataRow[]);
    request.onerror = () => reject(request.error);
    tx.onabort = () => reject(tx.error ?? new Error('本机数据读取失败。'));
  }); } finally { db.close(); }
}

export async function writeLocalData(key: string, value: string | null): Promise<void> {
  const db = await openLocalData();
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite'), store = tx.objectStore(STORE);
    if (value === null) store.delete(key); else store.put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('本机数据保存失败。'));
  }); } finally { db.close(); }
}
