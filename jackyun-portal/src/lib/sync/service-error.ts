import type { SyncStatus } from '../../types/sync.ts';
import { SERVICE_NOTICE_FAILURE_THRESHOLD } from './notice-policy.ts';

export class SyncHttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'SyncHttpError';
    this.status = status;
  }
}

export function isServerUnavailable(error: unknown, online: boolean): boolean {
  const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined;
  return online && ((typeof status === 'number' && (status >= 500 || status === 408 || status === 429))
    || error instanceof TypeError || (error instanceof Error && error.name === 'TimeoutError'));
}

export function syncFailureStatus(error: unknown, online: boolean, failures: number): SyncStatus {
  if (!online) return 'offline_pending';
  if (isServerUnavailable(error, online)) return failures >= SERVICE_NOTICE_FAILURE_THRESHOLD ? 'server_unavailable' : 'offline_pending';
  return 'error';
}
