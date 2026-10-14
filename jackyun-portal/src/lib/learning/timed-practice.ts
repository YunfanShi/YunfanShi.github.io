import { addCalendarDays, dateKey, type ManualLearningTask, type ScheduleControlState } from './schedule-control.ts';
import { threeWayMerge } from '../sync/merge.ts';
import { currentPracticeRecords } from './practice-timer.ts';

export const PRACTICE_SUBJECTS = ['Pure Math', 'Mechanics', 'Physics', 'Statistics', 'Computer Science'] as const;
export type PracticeSubject = string;
export type PracticeMetricScope = 'new' | 'all' | 'repair' | 'mock';
export function inPracticeScope(record:TimedPracticeRecord, scope:PracticeMetricScope):boolean {
  return scope==='all' || (scope==='new' ? !newPracticeExclusion(record) : record.source===(scope==='repair'?'A':'C'));
}
export interface PracticeFrequency { id: string; subject: string; sessions: number; minutes: number }
export const DEFAULT_PRACTICE_FREQUENCIES: PracticeFrequency[] = PRACTICE_SUBJECTS.map(subject => ({id:subject,subject,sessions:subject === 'Statistics' ? 0 : subject === 'Computer Science' ? 2 : 1, minutes:subject === 'Statistics' || subject === 'Computer Science' ? 20 : 25}));
export function normalizePracticeFrequencies(value: unknown): PracticeFrequency[] {
  if (value === undefined) return DEFAULT_PRACTICE_FREQUENCIES.map(x => ({...x}));
  if (!Array.isArray(value) || value.length > 50 || value.some(x => !x || typeof x.id !== 'string' || !x.id || typeof x.subject !== 'string' || !x.subject.trim() || x.subject.length > 100 || !Number.isInteger(x.sessions) || x.sessions < 0 || x.sessions > 7 || !Number.isInteger(x.minutes) || x.minutes < 5 || x.minutes > 120) || new Set(value.map(x => x.id)).size !== value.length || new Set(value.map(x => x.subject)).size !== value.length) throw Error('每周频率格式无效，原设置已保留。');
  return value;
}
export function weeklyTrainingCredit(state: ScheduleControlState, date: string, frequency: PracticeFrequency): number {
  const entries = weeklyPracticeSummary(currentPracticeRecords(state),date).entries;
  const family = { 'Pure Math':'math', Mechanics:'mechanics', Physics:'physics', Statistics:'statistics', 'Computer Science':'cs' }[frequency.subject];
  return entries.filter(r => (r.subject === frequency.subject || (family && r.presetFamily === family)) && r.minutes >= frequency.minutes).length;
}
export function planWeeklyTraining(state: ScheduleControlState, date: string, frequency: PracticeFrequency, id: string): ScheduleControlState {
  const week = practiceWeek(date), presetId = `timed-new-${frequency.subject.toLowerCase().replaceAll(' ', '-')}`;
  const credit = weeklyTrainingCredit(state,date,frequency);
  const planned = state.manualTasks.filter(t => t.presetId === presetId && t.date >= week.start && t.date <= week.end && !state.cancellations[t.id] && !state.completions[t.id]).length;
  if (credit + planned >= frequency.sessions) return state;
  return {...state, manualTasks:[...state.manualTasks,{id,date,presetId,type:'practice',subject:frequency.subject,durationMinutes:frequency.minutes,title:`限时新题 · ${frequency.subject}`,note:'独立 B 新题或首次学校作业；计时器报告自动记证据，不重复录入。只修主要卡点，再换新题验证。',scope:{cueIds:[],questionIds:[]},guide:{tab:'practice',subTab:'timed'}}]};
}
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
  firstResults?: { minutes:number; onTime:number; overtime:number; failed:number; blocked:number; failedOvertime:number };
  corrections?: Array<{id:string; results:NonNullable<TimedPracticeRecord['firstResults']>}>;
}
export function originalPracticeRecord(r: TimedPracticeRecord): TimedPracticeRecord { return {...r,...r.firstResults}; }
export function saveManualPractice(state: ScheduleControlState, next:TimedPracticeRecord, base?:TimedPracticeRecord): ScheduleControlState {
  if (next.id.startsWith('timer-') || !normalizeTimedPractice([next]).length) throw Error('请在逐题报告修改计时器记录，或检查手动记录格式。');
  const current=state.timedPracticeRecords?.find(r=>r.id===next.id);
  if(current && !base) throw Error('记录已存在，请重新打开。');
  const result={minutes:next.minutes,onTime:next.onTime,overtime:next.overtime,failed:next.failed,blocked:next.blocked,failedOvertime:next.failedOvertime ?? 0};
  const first=base?.firstResults ?? (base ? {minutes:base.minutes,onTime:base.onTime,overtime:base.overtime,failed:base.failed,blocked:base.blocked,failedOvertime:base.failedOvertime ?? 0} : result);
  const candidate={...next,firstResults:first,corrections:base?[...(base.corrections ?? []),{id:crypto.randomUUID(),results:result}] : []};
  const merged=current?threeWayMerge(base,candidate,current):{merged:candidate,conflicts:[]};
  if(merged.conflicts.length) throw Error('另一设备修改了同一记录，请导出并重新打开。');
  return {...state,timedPracticeRecords:normalizeTimedPractice([...(state.timedPracticeRecords ?? []).filter(r=>r.id!==next.id),merged.merged])};
}

export function normalizeTimedPractice(value: unknown): TimedPracticeRecord[] {
  if (!Array.isArray(value)) return [];
  const validSnapshot = (v:unknown) => {const s=v as NonNullable<TimedPracticeRecord['firstResults']>;return s && Number.isFinite(s.minutes) && s.minutes>0 && s.minutes<=1440 && ['onTime','overtime','failed','blocked','failedOvertime'].every(k=>Number.isInteger(s[k as keyof typeof s])&&s[k as keyof typeof s]>=0&&s[k as keyof typeof s]<=1000)&&s.onTime+s.overtime+s.failed>0&&s.blocked<=s.failed&&s.failedOvertime<=s.failed;};
  for (const raw of value) {
    const item=raw as TimedPracticeRecord;
    if(item?.firstResults !== undefined && !validSnapshot(item.firstResults)) throw Error('首次训练结果快照格式无效，原记录已保留。');
    if(item?.corrections !== undefined && (!Array.isArray(item.corrections)||item.corrections.some(c=>!c||typeof c.id!=='string'||!c.id||!validSnapshot(c.results))||new Set(item.corrections.map(c=>c.id)).size!==item.corrections.length)) throw Error('训练修正历史格式无效，原记录已保留。');
  }
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

export function weeklyPracticeSummary(records: TimedPracticeRecord[], date: string, scope: PracticeMetricScope = 'new') {
  const week = practiceWeek(date);
  const entries = normalizeTimedPractice(records).map(originalPracticeRecord).filter(item => item.date >= week.start && item.date <= week.end && inPracticeScope(item,scope));
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
