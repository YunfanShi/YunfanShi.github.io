import type { SyncStatusDetail } from '../../types/sync.ts';
import { LOCAL_SYNC_STATUS_EVENT } from '../local-workspace.ts';

let latest: SyncStatusDetail | null = null;

/** Late-mounted panels must see the current sync, including an in-flight transfer. */
export function getLatestSyncStatus(): SyncStatusDetail | null {
  return latest;
}

export function announceSyncStatus(detail: SyncStatusDetail): void {
  latest = detail;
  window.dispatchEvent(new CustomEvent(LOCAL_SYNC_STATUS_EVENT, { detail }));
}
