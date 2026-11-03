'use client';
import { workspaceStorage } from '../sync/repository.ts';
import { scheduleHasContent, SCHEDULE_STORAGE_KEY } from '../sync/schedule-safety.ts';
import { ALL_BACKUP_PAGES, isBackupableLegacyKey, legacyBackupPage, type BackupPage } from './pages.ts';

const DB_NAME = 'jackyun-page-backups-v1';
const FULL_CHECKPOINT_INTERVAL = 5;

export type LocalBackup = {
  id: number;
  userId: string;
  page: BackupPage;
  createdAt: string;
  values: Record<string, string>;
  encoding?: 'full' | 'delta';
  deletedKeys?: string[];
};
type MaterializedBackup = Omit<LocalBackup, 'id' | 'encoding' | 'deletedKeys'> & { id?: number };

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

export function getLocalBackupLimit(): number { return 10; }

function samePageValues(left: Record<string, string>, right: Record<string, string>): boolean {
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => left[key] === right[key]);
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasMeaningfulValue);
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).some(hasMeaningfulValue);
  return true;
}

/** Empty page snapshots waste slots; malformed data is retained so it can still be recovered. */
export function hasLocalPageData(page: BackupPage, values: Record<string, string>): boolean {
  return Object.entries(values).some(([key, raw]) => {
    if (key === SCHEDULE_STORAGE_KEY) {
      try { return scheduleHasContent(JSON.parse(raw)); } catch { return raw.trim().length > 0; }
    }
    try { return hasMeaningfulValue(JSON.parse(raw)); } catch { return raw.trim().length > 0; }
  });
}

function materialize(rows: LocalBackup[]): MaterializedBackup[] {
  const current: Record<string, string> = {};
  let hasBase = false;
  return [...rows].sort((a, b) => a.id - b.id).map((row) => {
    if (row.encoding !== 'delta') {
      for (const key of Object.keys(current)) delete current[key];
      Object.assign(current, row.values);
      hasBase = true;
    } else {
      if (!hasBase) throw new Error('本机备份缺少完整恢复点，原备份已保留。');
      for (const key of row.deletedKeys ?? []) delete current[key];
      Object.assign(current, row.values);
    }
    return { ...row, values: { ...current }, encoding: 'full', deletedKeys: undefined };
  });
}

/** Re-encode with two complete restore points at most; deltas never span over four versions. */
function encode(rows: MaterializedBackup[]): LocalBackup[] {
  let previous: Record<string, string> = {};
  return rows.map((row, index) => {
    const full = index === 0 || index % FULL_CHECKPOINT_INTERVAL === 0;
    if (full) {
      previous = { ...row.values };
      return { ...row, encoding: 'full', values: { ...row.values }, deletedKeys: [] } as LocalBackup;
    }
    const values = Object.fromEntries(Object.entries(row.values).filter(([key, value]) => previous[key] !== value));
    const deletedKeys = Object.keys(previous).filter((key) => !Object.hasOwn(row.values, key));
    previous = { ...row.values };
    return { ...row, encoding: 'delta', values, deletedKeys } as LocalBackup;
  });
}

function writeEncodedRows(store: IDBObjectStore, prior: LocalBackup[], rows: MaterializedBackup[]): void {
  const encoded = encode(rows);
  const retainedIds = new Set<number>();
  for (const row of encoded) {
    if (row.id === undefined) store.add(row);
    else { retainedIds.add(row.id); store.put(row); }
  }
  for (const row of prior) if (!retainedIds.has(row.id)) store.delete(row.id);
}

export function pruneLocalBackups(userId: string): Promise<void> {
  return transaction<void>('readwrite', (store, finish) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const owned = (request.result as LocalBackup[]).filter((row) => row.userId === userId);
      const byPage = new Map<BackupPage, LocalBackup[]>();
      for (const row of owned) byPage.set(row.page, [...(byPage.get(row.page) ?? []), row]);
      for (const [page, rows] of byPage) {
        const snapshots = materialize(rows).filter((row) => hasLocalPageData(page, row.values));
        const retained = snapshots.slice(-getLocalBackupLimit());
        writeEncodedRows(store, rows, retained);
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
    request.onsuccess = () => finish(materialize(request.result as LocalBackup[]).sort((a, b) => (b.id ?? 0) - (a.id ?? 0)).map((row) => row as LocalBackup));
  });
}

export async function saveLocalBackup(userId: string, page: BackupPage, values: Record<string, string>, forceDuplicate = false): Promise<void> {
  if (!hasLocalPageData(page, values)) return;
  await transaction<void>('readwrite', (store, finish) => {
    const request = store.index('ownerPage').getAll(IDBKeyRange.only([userId, page]));
    request.onsuccess = () => {
      const prior = request.result as LocalBackup[];
      const snapshots = materialize(prior);
      const latest = snapshots.at(-1);
      if (!forceDuplicate && latest && samePageValues(latest.values, values)) { finish(); return; }
      snapshots.push({ userId, page, values: { ...values }, createdAt: new Date().toISOString() });
      writeEncodedRows(store, prior, snapshots.slice(-getLocalBackupLimit()));
      finish();
    };
  });
}

/** Save one meaningful baseline when a page first has data; do not pad empty history slots. */
export async function ensureLocalBackupBaseline(userId: string, page: BackupPage, values: Record<string, string>): Promise<void> {
  if (!hasLocalPageData(page, values)) return;
  const latest = (await listLocalBackups(userId, page))[0];
  if (!latest || !samePageValues(latest.values, values)) await saveLocalBackup(userId, page, values);
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
  await pruneLocalBackups(userId);
  for (const page of ALL_BACKUP_PAGES) await ensureLocalBackupBaseline(userId, page, localPageValues(snapshot, page));
}
