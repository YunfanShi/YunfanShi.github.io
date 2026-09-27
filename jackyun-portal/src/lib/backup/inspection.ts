import { canonicalJson } from '../sync/hash.ts';

type Entry = Record<string, unknown>;
type ScheduleState = Record<string, unknown>;

export type BackupInspection = {
  facts: string[];
  comparison: string[];
  warning?: string;
};

const SCHEDULE_KEY = 'jackyun_schedule_control_v1';

function scheduleState(value: unknown): ScheduleState | null {
  let parsed = value;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch { return null; }
  }
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as ScheduleState : null;
}

function rows(state: ScheduleState | null, key: string): Entry[] {
  const value = state?.[key];
  return Array.isArray(value) ? value.filter((item): item is Entry => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : [];
}

function label(item: Entry): string {
  const value = item.prompt ?? item.title ?? item.taskTitle ?? item.name ?? item.id;
  return typeof value === 'string' ? value.slice(0, 52) : '未命名记录';
}

function changes(oldItems: Entry[], currentItems: Entry[], name: string): string[] {
  const oldById = new Map(oldItems.map((item) => [String(item.id ?? ''), item] as const).filter(([id]) => Boolean(id)));
  const currentById = new Map(currentItems.map((item) => [String(item.id ?? ''), item] as const).filter(([id]) => Boolean(id)));
  const onlyOld = [...oldById].filter(([id]) => !currentById.has(id)).map(([, item]) => label(item));
  const onlyCurrent = [...currentById].filter(([id]) => !oldById.has(id)).map(([, item]) => label(item));
  const changed = [...oldById].filter(([id, item]) => currentById.has(id) && canonicalJson(item) !== canonicalJson(currentById.get(id))).map(([, item]) => label(item));
  if (!onlyOld.length && !onlyCurrent.length && !changed.length) return [`${name}：与当前相同`];
  const result = [`${name}：这个版本独有 ${onlyOld.length}、当前独有 ${onlyCurrent.length}、内容不同 ${changed.length}`];
  if (onlyOld.length) result.push(`仅这个版本有：${onlyOld.slice(0, 3).join('；')}${onlyOld.length > 3 ? '…' : ''}`);
  if (onlyCurrent.length) result.push(`仅当前有：${onlyCurrent.slice(0, 3).join('；')}${onlyCurrent.length > 3 ? '…' : ''}`);
  return result;
}

export function inspectScheduleVersion(savedValue: unknown, currentValue: unknown): BackupInspection {
  const saved = scheduleState(savedValue);
  const current = scheduleState(currentValue);
  if (!saved) return { facts: ['这个版本没有可识别的 Schedule 主数据。'], comparison: [], warning: '请先下载检查，暂不要直接恢复。' };
  const groups = [['Cue', 'cues'], ['手动任务', 'manualTasks'], ['学习记录', 'learningRecords']] as const;
  return {
    facts: groups.map(([name, key]) => `${name} ${rows(saved, key).length} 条`),
    comparison: current ? groups.flatMap(([name, key]) => changes(rows(saved, key), rows(current, key), name)) : [],
    ...(!current ? { warning: '当前数据无法读取，暂时只能查看此版本的数量。' } : {}),
  };
}

export function inspectCloudBackup(
  page: string,
  snapshot: Record<string, Entry[]>,
  currentScheduleValue?: unknown,
): BackupInspection {
  const legacy = snapshot.legacy_sync_data ?? [];
  const nonLegacyCount = Object.entries(snapshot)
    .filter(([name]) => name !== 'legacy_sync_data')
    .reduce((count, [, items]) => count + (Array.isArray(items) ? items.length : 0), 0);
  if (page === 'schedule') {
    const saved = legacy.find((item) => item.storage_key === SCHEDULE_KEY)?.storage_value;
    const inspected = inspectScheduleVersion(saved, currentScheduleValue);
    const questions = scheduleState(legacy.find((item) => item.storage_key === 'jackyun_schedule_questions_v1')?.storage_value);
    return {
      ...inspected,
      facts: [...inspected.facts, `题库 ${rows(questions, 'questions').length} 题`, `题目作答 ${rows(questions, 'attempts').length} 次`, `学习草稿 ${Object.keys((questions?.drafts as Record<string, unknown>) ?? {}).length} 项`, `课表计划 ${legacy.filter((item) => typeof item.storage_key === 'string' && item.storage_key.startsWith('jack_timetable_plan')).length} 份`, `其他 Schedule 记录 ${nonLegacyCount} 条`],
    };
  }
  return {
    facts: [`该页面云端记录 ${nonLegacyCount} 条`, `同步页面数据 ${legacy.length} 项`],
    comparison: [],
    warning: '此页面暂无逐条对比；可下载这个版本检查内容，恢复前会先保存当前状态。',
  };
}
