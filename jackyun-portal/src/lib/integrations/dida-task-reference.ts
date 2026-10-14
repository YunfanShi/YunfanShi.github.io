import { createHash } from 'node:crypto';
import { normalizeDidaTasks } from './dida-schedule.ts';

export const DIDA_TARGET_PREFIX = 'dida:';
export function parseDidaTarget(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const match = /^dida:([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}):([A-Za-z0-9_-]{1,128}):([A-Za-z0-9_-]{1,128})$/i.exec(value);
  return match ? { accountId: match[1], projectId: match[2], taskId: match[3] } : undefined;
}
export function didaTarget(accountId: string, projectId: string, taskId: string) { return `dida:${accountId}:${projectId}:${taskId}`; }
export const isDidaVersion = (value: unknown): value is string => typeof value === 'string' && /^dida-v1:[a-f0-9]{64}$/.test(value);
export function didaTaskVersion(task: Record<string, unknown>, projectId: string) {
  const value = typeof task.etag === 'string' && task.etag ? task.etag : JSON.stringify(normalizeDidaTasks([task], projectId)[0]);
  return 'dida-v1:' + createHash('sha256').update(value ?? 'missing').digest('hex');
}
