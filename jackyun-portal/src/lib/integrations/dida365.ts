import type { LearningTask, LearningTaskType } from '@/lib/learning/schedule-control';

export const DIDA365_API_BASE = 'https://api.dida365.com/open/v1';

export interface DidaProject { id: string; name: string }
export interface DidaAccountView {
  id: string;
  provider: 'dida365';
  displayName: string;
  projectId: string;
  projectName: string;
  status: 'active' | 'error';
  lastVerifiedAt?: string;
}

const TYPE_LABELS: Record<LearningTaskType, string> = {
  'course-review': '今日复习', 'interval-review': '间隔复习', 'weekly-review': '周末集中', 'cue-review': 'Cue 复习',
  'completeness-audit': '完整性检查', 'unit-review': '单元复习', 'cumulative-review': '总复习', study: '学习',
  'self-study': '自学', practice: '练习', repair: '修复', preview: '预习', special: '专项学习', exam: '考试', custom: '待办',
};

export function didaSourceKey(task: Pick<LearningTask, 'key' | 'mergedTaskKeys'>): string {
  return [...new Set(task.mergedTaskKeys?.length ? task.mergedTaskKeys : [task.key])].sort().join('|').slice(0, 2000);
}

function timedTaskRange(date: string, start: string, durationMinutes: number, offset: string) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = start.split(':').map(Number);
  const startValue = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const dueValue = new Date(startValue.getTime() + Math.max(1, Math.round(durationMinutes)) * 60_000);
  const format = (value: Date) => `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}T${String(value.getUTCHours()).padStart(2, '0')}:${String(value.getUTCMinutes()).padStart(2, '0')}:00${offset}`;
  return { startDate: format(startValue), dueDate: format(dueValue) };
}

export function buildDidaTask(task: LearningTask, projectId: string, timeZone = 'Asia/Shanghai') {
  const parts = task.mergedTasks?.length ? task.mergedTasks : [{ key: task.key, type: task.type, title: task.title, detail: task.detail }];
  const date = /^\d{4}-\d{2}-\d{2}$/.test(task.date) ? task.date : new Date().toISOString().slice(0, 10);
  const offset = timeZone === 'Asia/Shanghai' ? '+0800' : '+0000';
  const timed = typeof task.start === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(task.start);
  const range = timed
    ? timedTaskRange(date, task.start!, task.durationMinutes, offset)
    : { startDate: `${date}T00:00:00${offset}`, dueDate: `${date}T23:59:00${offset}` };
  const content = [
    '来自 JackYun Schedule',
    task.subjectName ? `科目：${task.subjectName}` : '',
    `预计：${Math.max(1, Math.round(task.durationMinutes || 1))} 分钟`,
    '',
    ...parts.flatMap((item, index) => [`${index + 1}. [${TYPE_LABELS[item.type]}] ${item.title}`, item.detail]),
    '',
    '完成后请回到 JackYun 记录学习证据；复习任务还需判定 √ / △ / ○。',
  ].filter(Boolean).join('\n').slice(0, 5000);
  return {
    title: `[JackYun] ${task.title}`.slice(0, 500),
    projectId,
    content,
    isAllDay: !timed,
    ...range,
    timeZone,
    tags: ['jackyun'],
    ...(parts.length > 1 ? { items: parts.slice(0, 20).map((item) => ({ title: `[${TYPE_LABELS[item.type]}] ${item.title}`.slice(0, 500), status: 0 })) } : {}),
  };
}

export function isPushableLearningTask(value: unknown): value is LearningTask {
  if (!value || typeof value !== 'object') return false;
  const task = value as Partial<LearningTask>;
  return typeof task.key === 'string' && task.key.length > 0 && task.key.length <= 500
    && typeof task.title === 'string' && task.title.length > 0 && task.title.length <= 1000
    && typeof task.detail === 'string' && task.detail.length <= 5000
    && typeof task.type === 'string' && task.type in TYPE_LABELS
    && typeof task.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(task.date)
    && typeof task.durationMinutes === 'number' && Number.isFinite(task.durationMinutes)
    && (!task.mergedTasks || (Array.isArray(task.mergedTasks) && task.mergedTasks.length <= 20));
}
