import { addCalendarDays, dateKey, type ManualLearningTask, type ScheduleControlState } from './schedule-control.ts';

export const PRACTICE_SUBJECTS = ['Pure Math', 'Mechanics', 'Physics', 'Statistics', 'Computer Science'] as const;
export type PracticeSubject = string;
export const PRACTICE_CONTENT_TYPES = { textbook: 'TEXTBOOK 教材', homework: 'HOMEWORK 作业', exam: 'EXAM 考试', pastPaper: 'PAST PAPER 历年卷', worksheet: 'WORKSHEET 练习单', other: 'OTHER 其他' } as const;
export type PracticeContentType = keyof typeof PRACTICE_CONTENT_TYPES;
export interface TimedPracticeRecord {
  id: string;
  date: string;
  subject: PracticeSubject;
  courseId?: string;
  presetFamily?: string;
  source: 'A' | 'B' | 'C' | 'homework';
  reference: string;
  contentType?: PracticeContentType;
  questionRange?: string;
  retestPlan?: string;
  unit?: string;
  subsection?: string;
  independent: boolean;
  minutes: number;
  onTime: number;
  overtime: number;
  failed: number;
  failedOvertime?: number;
  blocked: number;
  bottleneck: string;
}

export function normalizeTimedPractice(value: unknown): TimedPracticeRecord[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.filter((item): item is TimedPracticeRecord => {
    if (!item || typeof item !== 'object') return false;
    const valid = typeof item.id === 'string' && item.id.length > 0 && !ids.has(item.id)
      && typeof item.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date)
      && Number.isFinite(Date.parse(`${item.date}T00:00:00Z`))
      && new Date(`${item.date}T00:00:00Z`).toISOString().slice(0, 10) === item.date
      && typeof item.subject === 'string' && item.subject.trim().length > 0 && item.subject.length <= 100 && ['A', 'B', 'C', 'homework'].includes(item.source)
      && typeof item.reference === 'string' && item.reference.trim().length > 0
      && (item.contentType === undefined || Object.hasOwn(PRACTICE_CONTENT_TYPES, item.contentType))
      && ['questionRange', 'retestPlan', 'unit', 'subsection'].every(key => item[key] === undefined || (typeof item[key] === 'string' && item[key].length <= 200))
      && typeof item.independent === 'boolean' && Number.isFinite(item.minutes) && item.minutes > 0 && item.minutes <= 1440
      && ['onTime', 'overtime', 'failed', 'blocked'].every(key => Number.isInteger(item[key]) && item[key] >= 0 && item[key] <= 1000)
      && item.onTime + item.overtime + item.failed > 0 && item.blocked <= item.failed
      && (item.failedOvertime === undefined || (Number.isInteger(item.failedOvertime) && item.failedOvertime >= 0 && item.failedOvertime <= item.failed))
      && typeof item.bottleneck === 'string';
    if (valid) ids.add(item.id);
    return valid;
  }).map(item => ({ ...item, reference: item.reference.trim().slice(0, 200), bottleneck: item.bottleneck.trim().slice(0, 80), ...(item.questionRange !== undefined ? { questionRange: item.questionRange.trim() } : {}), ...(item.retestPlan !== undefined ? { retestPlan: item.retestPlan.trim() } : {}) }));
}

export function practiceContentLabel(record: Pick<TimedPracticeRecord, 'contentType' | 'reference' | 'questionRange'>): string {
  return [record.contentType ? PRACTICE_CONTENT_TYPES[record.contentType] : '', record.reference, record.questionRange].filter(Boolean).join(' · ');
}

export function newPracticeExclusion(record: TimedPracticeRecord): string | null {
  if (record.source === 'A') return '熟题 / PQ 修复';
  if (record.source === 'C') return '完整卷模拟';
  if (!record.independent) return '未标记独立新题尝试';
  return null;
}

export function practiceWeek(date: string): { start: string; end: string } {
  const day = new Date(`${date}T12:00:00`);
  const monday = addCalendarDays(dateKey(day), -((day.getDay() + 6) % 7));
  return { start: monday, end: addCalendarDays(monday, 6) };
}

export function weeklyPracticeSubjects(date: string): PracticeSubject[] {
  const { start } = practiceWeek(date);
  const weeks = Math.round((Date.parse(`${start}T00:00:00Z`) - Date.UTC(2026, 9, 12)) / (7 * 86400000));
  return ['Pure Math', 'Mechanics', 'Physics', weeks % 2 === 0 ? 'Statistics' : 'Computer Science'];
}

export function weeklyPracticeSummary(records: TimedPracticeRecord[], date: string, scope: 'new' | 'all' = 'new') {
  const week = practiceWeek(date);
  const entries = records.filter(item => item.date >= week.start && item.date <= week.end && (scope === 'all' || !newPracticeExclusion(item)));
  const attempted = entries.reduce((total, item) => total + item.onTime + item.overtime + item.failed, 0);
  const onTime = entries.reduce((total, item) => total + item.onTime, 0);
  const bottlenecks = new Map<string, number>();
  entries.forEach(item => { if (item.bottleneck) bottlenecks.set(item.bottleneck, (bottlenecks.get(item.bottleneck) ?? 0) + 1); });
  return {
    ...week, entries, attempted, onTimeRate: attempted ? Math.round(onTime / attempted * 100) : null,
    overtime: entries.reduce((total, item) => total + item.overtime + (item.failedOvertime ?? 0), 0),
    blocked: entries.reduce((total, item) => total + item.blocked, 0),
    bottlenecks: [...bottlenecks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([name]) => name),
    creditedSubjects: new Set(entries.filter(item => !newPracticeExclusion(item) && item.minutes >= 20).flatMap(item => [item.subject, ...({math:['Pure Math'],mechanics:['Mechanics'],statistics:['Statistics'],physics:['Physics'],cs:['Computer Science']}[item.presetFamily ?? ''] ?? [])])),
  };
}

/** Planning is explicit and idempotent; ticking a task alone never grants training credit. */
export function planTimedPractice(state: ScheduleControlState, subject: PracticeSubject, date: string, id: string): ScheduleControlState {
  const week = practiceWeek(date);
  if (weeklyPracticeSummary(state.timedPracticeRecords ?? [], date).creditedSubjects.has(subject)) return state;
  const presetId = `timed-new-${subject.toLowerCase().replaceAll(' ', '-')}`;
  if (state.manualTasks.some(task => task.presetId === presetId && task.date >= week.start && task.date <= week.end && !state.cancellations[task.id])) return state;
  const task: ManualLearningTask = {
    id, date, presetId, type: 'practice', subject, durationMinutes: subject === 'Statistics' || subject === 'Computer Science' ? 20 : 25,
    title: `限时新题 · ${subject}`,
    note: '先独立计时做 B 类未见新题；首次接触且独立计时的作业可抵扣。批改记 ✓ / △ / ○ → 只修最高影响卡点 → 换新题复测。不要先清空 Cue/PQ。完成后在限时新题卡片记录真实结果。',
    scope: { cueIds: [], questionIds: [] },
    guide: { tab: 'practice', subTab: 'timed' },
  };
  return { ...state, manualTasks: [...state.manualTasks, task] };
}
