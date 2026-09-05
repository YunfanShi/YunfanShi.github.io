export type SyncStatus = 'guest' | 'synced' | 'syncing' | 'offline_pending' | 'conflict' | 'error';

export interface SyncDevice {
  id: string;
  name: string;
  platform: 'web' | 'pwa' | 'mobile-web';
  lastSeenAt: string;
  revokedAt: string | null;
}

export interface SyncRecord {
  key: string;
  value: unknown;
  revision: number;
  contentHash: string | null;
  deleted: boolean;
  updatedAt: string;
}

export interface SyncOperation {
  id: string;
  key: string;
  baseRevision: number;
  baseHash: string | null;
  baseValue: unknown;
  value: unknown;
  deleted: boolean;
  clientUpdatedAt: string;
  resolvesOperationId?: string;
}

export interface SyncConflict {
  id?: string;
  operationId: string;
  key: string;
  baseRevision: number;
  baseValue: unknown;
  localValue: unknown;
  localDeleted: boolean;
  remoteValue: unknown;
  remoteDeleted: boolean;
  remoteHash: string | null;
  remoteRevision: number;
  remoteUpdatedAt?: string;
  createdAt?: string;
}

export interface SyncStatusDetail {
  state: SyncStatus;
  pending: number;
  conflicts: number;
  lastSyncedAt: string | null;
  error?: string;
}

export interface DataArchiveV2<TTable extends string = string> {
  version: 2;
  schema_version: 'sync-v2';
  exported_at: string;
  checksum: string;
  tables: Partial<Record<TTable, Record<string, unknown>[]>>;
}
