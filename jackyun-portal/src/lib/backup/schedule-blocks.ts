import { QUESTION_BANK_KEY } from '../learning/question-bank.ts';
import { SCHEDULE_STORAGE_KEY } from '../sync/schedule-safety.ts';

export const SCHEDULE_DATA_BLOCKS = [
  { id: 'cues', label: 'CUE 内容与状态', key: SCHEDULE_STORAGE_KEY, field: 'cues', kind: 'array' },
  { id: 'cueReviews', label: 'CUE 复习历史', key: SCHEDULE_STORAGE_KEY, field: 'cueReviews', kind: 'array' },
  { id: 'learningRecords', label: '学习记录', key: SCHEDULE_STORAGE_KEY, field: 'learningRecords', kind: 'array' },
  { id: 'manualTasks', label: '手动学习任务', key: SCHEDULE_STORAGE_KEY, field: 'manualTasks', kind: 'array' },
  { id: 'cueStudyDrafts', label: '未完成 CUE 学习草稿', key: SCHEDULE_STORAGE_KEY, field: 'cueStudyDrafts', kind: 'object' },
  { id: 'timetable', label: 'Schedule 课表', key: SCHEDULE_STORAGE_KEY, field: 'timetable', kind: 'object' },
  { id: 'questionBank', label: '题库、作答与未完成草稿', key: QUESTION_BANK_KEY, field: '', kind: 'object' },
] as const;

export type ScheduleDataBlock = typeof SCHEDULE_DATA_BLOCKS[number]['id'];
export type ScheduleDataBlockBundle = { format: 'jackyun-schedule-data-block'; version: 1; block: ScheduleDataBlock; exportedAt: string; dataUpdatedAt: string | null; count: number; data: unknown };

function parseObject(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try { const parsed: unknown = JSON.parse(value); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}; }
  catch { return {}; }
}

export function readScheduleDataBlock(block: ScheduleDataBlock, snapshot: Record<string, string>): unknown {
  const definition = SCHEDULE_DATA_BLOCKS.find((item) => item.id === block)!;
  const stored = snapshot[definition.key] ?? null;
  if (!definition.field) return parseObject(stored);
  return parseObject(stored)[definition.field] ?? (definition.kind === 'array' ? [] : {});
}

function countData(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.keys(value).length;
  return value === undefined || value === null ? 0 : 1;
}

function latestTimestamp(value: unknown): string | null {
  let latest = 0;
  const visit = (item: unknown): void => {
    if (Array.isArray(item)) { for (const child of item) visit(child); return; }
    if (!item || typeof item !== 'object') return;
    for (const [key, child] of Object.entries(item as Record<string, unknown>)) {
      if (/^(updatedAt|updated_at|createdAt|created_at|reviewedAt|lastReviewedAt|completedAt|savedAt)$/i.test(key) && typeof child === 'string') {
        const timestamp = Date.parse(child); if (Number.isFinite(timestamp)) latest = Math.max(latest, timestamp);
      }
      visit(child);
    }
  };
  visit(value);
  return latest ? new Date(latest).toISOString() : null;
}

export function createScheduleDataBlockBundle(block: ScheduleDataBlock, snapshot: Record<string, string>, exportedAt = new Date().toISOString()): ScheduleDataBlockBundle {
  const data = readScheduleDataBlock(block, snapshot);
  return { format: 'jackyun-schedule-data-block', version: 1, block, exportedAt, dataUpdatedAt: latestTimestamp(data), count: countData(data), data };
}

export function parseScheduleDataBlockBundle(text: string, expectedBlock: ScheduleDataBlock): ScheduleDataBlockBundle {
  let raw: unknown; try { raw = JSON.parse(text); } catch { throw new Error('文件不是有效的 JSON。'); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('数据块文件格式无效。');
  const bundle = raw as Partial<ScheduleDataBlockBundle>;
  if (bundle.format !== 'jackyun-schedule-data-block' || bundle.version !== 1 || bundle.block !== expectedBlock || !Object.hasOwn(bundle, 'data')) throw new Error('文件格式或数据块与当前选择不一致。');
  const definition = SCHEDULE_DATA_BLOCKS.find((item) => item.id === expectedBlock)!;
  const valid = definition.kind === 'array' ? Array.isArray(bundle.data) : Boolean(bundle.data && typeof bundle.data === 'object' && !Array.isArray(bundle.data));
  if (!valid) throw new Error('文件中的数据结构与所选数据块不匹配。');
  if (bundle.exportedAt && !Number.isFinite(Date.parse(bundle.exportedAt))) throw new Error('文件导出时间无效。');
  if (bundle.dataUpdatedAt && !Number.isFinite(Date.parse(bundle.dataUpdatedAt))) throw new Error('数据更新时间无效。');
  return { format: 'jackyun-schedule-data-block', version: 1, block: expectedBlock, exportedAt: bundle.exportedAt ?? '', dataUpdatedAt: bundle.dataUpdatedAt ?? null, count: countData(bundle.data), data: bundle.data };
}

export function scheduleDataBlockReplacement(bundle: ScheduleDataBlockBundle, snapshot: Record<string, string>): { key: string; value: string } {
  const definition = SCHEDULE_DATA_BLOCKS.find((item) => item.id === bundle.block)!;
  if (!definition.field) return { key: definition.key, value: JSON.stringify(bundle.data) };
  const state = parseObject(snapshot[definition.key] ?? null);
  return { key: definition.key, value: JSON.stringify({ ...state, [definition.field]: bundle.data }) };
}
