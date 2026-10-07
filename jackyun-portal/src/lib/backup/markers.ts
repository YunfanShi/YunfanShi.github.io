import { ALL_BACKUP_PAGES, type BackupPage } from './pages.ts';
export type BackupChangeMarker = { page: BackupPage; generation: string; due: boolean };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validateBackupMarkers(value: unknown): BackupChangeMarker[] {
  if (!Array.isArray(value) || value.length > ALL_BACKUP_PAGES.length
    || value.some(r => !r || !ALL_BACKUP_PAGES.includes(r.page) || !UUID.test(r.generation)
      || typeof r.due !== 'boolean') || new Set(value.map(r => r.page)).size !== value.length) {
    throw Error('备份改动标记无效，自动备份未完成。');
  }
  return value.map(r => ({ page:r.page,generation:r.generation,due:r.due }));
}
