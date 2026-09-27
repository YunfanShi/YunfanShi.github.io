import type { SyncStatusDetail } from '../../types/sync.ts';
export const SERVICE_NOTICE_FAILURE_THRESHOLD = 3;
export const SERVICE_NOTICE_SNOOZE_MS = 10 * 60_000;
/** A failed probe or a single fetch failure does not establish a blocked sync. */
export function shouldShowServiceNotice(detail: SyncStatusDetail | null, now: number, mutedUntil: number, dismissed: boolean): boolean {
  return !dismissed && now >= mutedUntil && detail?.state === 'server_unavailable' && (detail.consecutiveFailures ?? 0) >= SERVICE_NOTICE_FAILURE_THRESHOLD;
}
