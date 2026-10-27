import { isBackupableLegacyKey, legacyBackupPage, type BackupPage } from './pages.ts';
import { scheduleHasContent, SCHEDULE_STORAGE_KEY } from '../sync/schedule-safety.ts';

export function parseLocalPageBackup(text: string, page: BackupPage): Record<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('JSON 文件格式错误。');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('文件不是当前页面的本地备份。');
  const backup = parsed as { version?: unknown; page?: unknown; values?: unknown };
  if (backup.version !== 1 || backup.page !== page || !backup.values || typeof backup.values !== 'object'
    || Array.isArray(backup.values) || !Object.keys(backup.values).length) throw new Error('文件不是当前页面的本地备份。');

  const values = backup.values as Record<string, unknown>;
  for (const [key, value] of Object.entries(values)) {
    if (typeof value !== 'string' || !isBackupableLegacyKey(key) || legacyBackupPage(key) !== page) {
      throw new Error(`不允许导入的页面数据键：${key}`);
    }
    if (key === SCHEDULE_STORAGE_KEY) {
      let schedule: unknown;
      try {
        schedule = JSON.parse(value);
      } catch {
        throw new Error('Schedule JSON 格式错误。');
      }
      if (!scheduleHasContent(schedule)) throw new Error('拒绝导入空 Schedule。');
    }
  }
  return values as Record<string, string>;
}
