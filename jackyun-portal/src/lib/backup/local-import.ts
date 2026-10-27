import { isBackupableLegacyKey, legacyBackupPage, type BackupPage } from './pages.ts';
import { scheduleHasContent, SCHEDULE_STORAGE_KEY } from '../sync/schedule-safety.ts';
import { localPageValues } from './local.ts';
import { resourceTargetsForStorageKeys } from '../sync/resource-model.ts';

type LocalPageImportStorage = {
  keys: () => string[];
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  flush: () => Promise<void>;
};

type LocalPageImportOptions = {
  page: BackupPage;
  owner: string;
  values: Record<string, string>;
  storage: LocalPageImportStorage;
  saveRecoveryPoint: (owner: string, page: BackupPage, values: Record<string, string>) => Promise<void>;
  queueV5Targets?: (targets: ReturnType<typeof resourceTargetsForStorageKeys>) => Promise<void>;
};

function validateValues(values: Record<string, string>, page: BackupPage): void {
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
}

/** Save a durable recovery point before changing the repository; success follows flush only. */
export async function applyLocalPageImport(options: LocalPageImportOptions): Promise<string[]> {
  const { page, owner, values, storage, saveRecoveryPoint } = options;
  validateValues(values, page);

  const current: Record<string, string> = {};
  for (const key of storage.keys()) {
    if (!isBackupableLegacyKey(key) || legacyBackupPage(key) !== page) continue;
    const value = storage.getItem(key);
    if (value !== null) current[key] = value;
  }

  await saveRecoveryPoint(owner, page, localPageValues(current, page));
  for (const key of Object.keys(current)) if (!(key in values)) storage.removeItem(key);
  for (const [key, value] of Object.entries(values)) storage.setItem(key, value);
  await storage.flush();
  const changedKeys=[...new Set([...Object.keys(current), ...Object.keys(values)])];
  await options.queueV5Targets?.(resourceTargetsForStorageKeys(changedKeys));
  return changedKeys;
}

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
  validateValues(values as Record<string, string>, page);
  return values as Record<string, string>;
}
