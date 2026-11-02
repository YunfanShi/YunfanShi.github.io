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
  if (Array.isArray(value)) return value.filter((item): item is Entry => Boolean(item) && typeof item === 'object' && !Array.isArray(item));
  if (value && typeof value === 'object') return Object.entries(value as Record<string, unknown>).flatMap(([backupKey, item]) => item && typeof item === 'object' && !Array.isArray(item) ? [{ ...(item as Entry), backupKey }] : []);
  return [];
}

function label(item: Entry): string {
  const value = item.prompt ?? item.title ?? item.taskTitle ?? item.name ?? item.id ?? item.backupKey;
  return typeof value === 'string' ? value.slice(0, 52) : '未命名记录';
}

function changes(oldItems: Entry[], currentItems: Entry[], name: string): string[] {
  const oldById = new Map(oldItems.map((item) => [String(item.id ?? item.backupKey ?? ''), item] as const).filter(([id]) => Boolean(id)));
  const currentById = new Map(currentItems.map((item) => [String(item.id ?? item.backupKey ?? ''), item] as const).filter(([id]) => Boolean(id)));
  const onlyOld = [...oldById].filter(([id]) => !currentById.has(id)).map(([, item]) => label(item));
  const onlyCurrent = [...currentById].filter(([id]) => !oldById.has(id)).map(([, item]) => label(item));
  const changed = [...oldById].filter(([id, item]) => currentById.has(id) && canonicalJson(item) !== canonicalJson(currentById.get(id))).map(([, item]) => label(item));
  if (!onlyOld.length && !onlyCurrent.length && !changed.length) return [`${name}：与当前相同`];
  const result = [`${name}：这个版本独有 ${onlyOld.length}、当前独有 ${onlyCurrent.length}、内容不同 ${changed.length}`];
  if (onlyOld.length) result.push(`仅这个版本有：${onlyOld.slice(0, 3).join('；')}${onlyOld.length > 3 ? '…' : ''}`);
  if (onlyCurrent.length) result.push(`仅当前有：${onlyCurrent.slice(0, 3).join('；')}${onlyCurrent.length > 3 ? '…' : ''}`);
  return result;
}

function learningProgressFacts(state: ScheduleState | null, label: string): string[] {
  const cues = rows(state, 'cues');
  const reviews = rows(state, 'cueReviews');
  const drafts = rows(state, 'cueStudyDrafts');
  if (state?.cueStudyDraft && typeof state.cueStudyDraft === 'object' && !Array.isArray(state.cueStudyDraft)) {
    drafts.push({ ...(state.cueStudyDraft as Entry), backupKey: 'legacy-current-draft' });
  }
  const status = (name: string) => cues.filter((cue) => cue.status === name).length;
  const due = cues.filter((cue) => typeof cue.nextReviewDate === 'string' && cue.nextReviewDate <= new Date().toISOString().slice(0, 10)).length;
  const currentDraft = drafts.find((draft) => Array.isArray(draft.cueIds) && Number.isInteger(draft.index));
  return [
    `${label}学习进度：CUE ${cues.length} 张 · √ ${status('stable')} / △ ${status('partial')} / ○ ${status('unclear')} / 未评价 ${Math.max(0, cues.length - status('stable') - status('partial') - status('unclear'))} · 到期 ${due} · 复习历史 ${reviews.length} 条`,
    `${label}未完成学习：${drafts.length} 份${currentDraft ? ` · 当前第 ${Number(currentDraft.index) + 1}/${Array.isArray(currentDraft.cueIds) ? currentDraft.cueIds.length : 0} 张${currentDraft.updatedAt ? ` · 更新于 ${String(currentDraft.updatedAt)}` : ' · 时间未知'}` : ''}`,
  ];
}

function questionFacts(value: unknown, label: string): string[] {
  const bank = scheduleState(value);
  return [`${label}题库：${rows(bank, 'questions').length} 题 · 作答 ${rows(bank, 'attempts').length} 次 · 未完成草稿 ${Object.keys((bank?.drafts as Record<string, unknown>) ?? {}).length} 项`];
}

export function inspectScheduleVersion(savedValue: unknown, currentValue: unknown, savedQuestionValue?: unknown, currentQuestionValue?: unknown): BackupInspection {
  const saved = scheduleState(savedValue);
  const current = scheduleState(currentValue);
  if (!saved) return { facts: ['这个版本没有可识别的 Schedule 主数据。'], comparison: [], warning: '请先下载检查，暂不要直接恢复。' };
  const groups = [['CUE', 'cues'], ['CUE 复习历史', 'cueReviews'], ['手动任务', 'manualTasks'], ['学习记录', 'learningRecords'], ['未完成 CUE 学习', 'cueStudyDrafts'], ['已完成任务状态', 'completions'], ['学科复习进度', 'reviewProgress']] as const;
  return {
    facts: groups.map(([name, key]) => `${name} ${rows(saved, key).length} 条`),
    comparison: current ? [...groups.flatMap(([name, key]) => changes(rows(saved, key), rows(current, key), name)), ...learningProgressFacts(saved, '备份'), ...learningProgressFacts(current, '本机'), ...questionFacts(savedQuestionValue, '备份'), ...questionFacts(currentQuestionValue, '本机'), ...(savedQuestionValue !== undefined || currentQuestionValue !== undefined ? changes(rows(scheduleState(savedQuestionValue), 'questions'), rows(scheduleState(currentQuestionValue), 'questions'), '题目') : [])] : [],
    ...(!current ? { warning: '当前数据无法读取，暂时只能查看此版本的数量。' } : {}),
  };
}

export function inspectCloudBackup(
  page: string,
  snapshot: Record<string, Entry[]>,
  currentScheduleValue?: unknown,
  currentQuestionValue?: unknown,
): BackupInspection {
  const legacy = snapshot.legacy_sync_data ?? [];
  const nonLegacyCount = Object.entries(snapshot)
    .filter(([name]) => name !== 'legacy_sync_data')
    .reduce((count, [, items]) => count + (Array.isArray(items) ? items.length : 0), 0);
  if (page === 'schedule') {
    const saved = legacy.find((item) => item.storage_key === SCHEDULE_KEY)?.storage_value;
    const savedQuestions = legacy.find((item) => item.storage_key === 'jackyun_schedule_questions_v1')?.storage_value;
    const inspected = inspectScheduleVersion(saved, currentScheduleValue, savedQuestions, currentQuestionValue);
    const questions = scheduleState(savedQuestions);
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
