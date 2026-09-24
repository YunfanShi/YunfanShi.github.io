export const BACKUP_LIMITS = [4, 5, 6, 7, 8, 9, 10] as const;
export type BackupLimit = typeof BACKUP_LIMITS[number];
export const DEFAULT_BACKUP_LIMIT: BackupLimit = 10;

export function isBackupLimit(value: unknown): value is BackupLimit {
  return typeof value === 'number' && Number.isInteger(value) && value >= 4 && value <= 10;
}
