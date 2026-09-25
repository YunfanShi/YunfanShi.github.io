// A checkpoint happens after enough changed data OR enough time with changes.
// Both counters restart after a successful checkpoint.
export const BACKUP_CHANGE_BYTES = 4 * 1024 * 1024;
export const BACKUP_MAX_WAIT_MS = 15 * 60_000;
export const BACKUP_CHANGE_CAP_BYTES = 1024 * 1024;

export type PendingBackup = { bytes: number; firstChangedAt: number };

export function recordBackupChange(pending: PendingBackup | undefined, bytes: number, now: number): PendingBackup {
  return {
    bytes: Math.min(BACKUP_CHANGE_BYTES, (pending?.bytes ?? 0) + Math.min(BACKUP_CHANGE_CAP_BYTES, Math.max(1, bytes))),
    firstChangedAt: pending?.firstChangedAt ?? now,
  };
}

export function backupIsDue(pending: PendingBackup | undefined, now: number): boolean {
  return Boolean(pending && (pending.bytes >= BACKUP_CHANGE_BYTES || now - pending.firstChangedAt >= BACKUP_MAX_WAIT_MS));
}
