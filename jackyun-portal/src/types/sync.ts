export type SyncStatus = 'guest' | 'synced' | 'syncing' | 'offline_pending' | 'server_unavailable' | 'conflict' | 'error';

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
  large?: boolean;
}

export interface SyncOperation {
  id: string;
  key: string;
  baseRevision: number;
  baseHash: string | null;
  baseValue: unknown;
  baseDeleted?: boolean;
  value: unknown;
  deleted: boolean;
  clientUpdatedAt: string;
  resolvesOperationId?: string;
  sequence?: number;
}

/** Immutable request, retained until every operation has a verified receipt. */
export interface SyncSubmission {
  body: string;
  operations: SyncOperation[];
  compressed: boolean;
}
export interface SyncDownloadPart {
  key: string;
  revision: number;
  hash: string | null;
  index: number;
  count: number;
  data: string;
  receivedAt: number;
}

export interface SyncConflict {
  id?: string;
  operationId: string;
  key: string;
  baseRevision: number;
  baseValue: unknown;
  baseDeleted?: boolean;
  localValue: unknown;
  localDeleted: boolean;
  remoteValue: unknown;
  remoteLarge?: boolean;
  remoteDeleted: boolean;
  remoteHash: string | null;
  remoteRevision: number;
  remoteUpdatedAt?: string;
  createdAt?: string;
  paths?: string[];
}

export type SyncResolutionChoice = 'local' | 'remote' | 'merged';
export interface SyncResolutionReview {
  expectedLocal: string | null;
  remoteRevision: number;
  remoteHash: string | null;
  value?: unknown;
  deleted?: boolean;
}
export interface SyncResolutionRequest {
  operationId: string;
  choice: SyncResolutionChoice;
  review?: SyncResolutionReview;
}

export interface SyncStatusDetail {
  state: SyncStatus;
  pending: number;
  conflicts: number;
  lastSyncedAt: string | null;
  error?: string;
  progress?: string;
  consecutiveFailures?: number;
}

export interface DataArchiveV2<TTable extends string = string> {
  version: 2;
  schema_version: 'sync-v2';
  exported_at: string;
  checksum: string;
  tables: Partial<Record<TTable, Record<string, unknown>[]>>;
}
