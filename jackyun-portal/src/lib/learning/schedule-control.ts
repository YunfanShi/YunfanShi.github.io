import { scheduleReview } from './review-schedule.ts';

export type ScheduleMode = 'term' | 'holiday';
export type LearningTaskType = 'course-review' | 'interval-review' | 'weekly-review' | 'cue-review' | 'completeness-audit' | 'unit-review' | 'cumulative-review' | 'study' | 'self-study' | 'practice' | 'repair' | 'preview' | 'special' | 'exam' | 'custom';
export type LearningStatus = 'stable' | 'partial' | 'unclear';
export type CueType = 'general' | 'definition' | 'explain' | 'state' | 'calculate';
export type LearningMaterialCode = 'B' | 'PQ' | 'BW' | 'N' | 'BQ' | 'PPT' | 'HW' | 'OTHER';

export interface LearningMaterialProgress {
  code: LearningMaterialCode;
  progress?: string;
}

export interface LearningScope {
  unit?: string;
  subsection?: string;
  cueIds?: string[];
}

export interface StudyGuideTarget {
  tab: 'learn' | 'practice' | 'exam' | 'procrastination' | 'ielts';
  subTab: string;
}

export interface ReviewDetails {
  studiedContent: string;
  issue: string;
  note: string;
}

export interface CourseSession {
  day: number;
  start: string;
  end: string;
  location?: string;
  teacher?: string;
  weeks?: number[];
}

export interface ScheduleCourse {
  id: string;
  name: string;
  shortName?: string;
  color: string;
  review: boolean;
  sessions: CourseSession[];
}

export interface TimetableImport {
  version: 1;
  name: string;
  termStart?: string;
  termEnd?: string;
  courses: ScheduleCourse[];
}

export interface ScheduleSettings {
  mode: ScheduleMode;
  previewEnabled: boolean;
  previewPreferenceSet: boolean;
  weekendReviewDay: 6 | 7;
}

export interface ManualLearningTask {
  id: string;
  title: string;
  type: Exclude<LearningTaskType, 'course-review' | 'interval-review' | 'weekly-review' | 'cue-review'>;
  date: string;
  start?: string;
  durationMinutes: number;
  subject?: string;
  note?: string;
  presetId?: string;
  scope?: LearningScope;
  materials?: LearningMaterialProgress[];
  guide?: StudyGuideTarget;
}

export interface StudyCue {
  id: string;
  subjectId: string;
  subjectName: string;
  unit: string;
  subsection: string;
  prompt: string;
  answer?: string;
  type: CueType;
  markingPoints: string[];
  status?: LearningStatus;
  intervalDays: number;
  easeFactor: number;
  streak: number;
  nextReviewDate?: string;
  lastReviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CueReview {
  id: string;
  cueId: string;
  taskKey?: string;
  status: LearningStatus;
  note?: string;
  reviewedAt: string;
  nextReviewDate: string;
}

export interface CueAssessment {
  cueId: string;
  status: LearningStatus;
  note?: string;
}

export interface LearningTaskPreset {
  id: string;
  label: string;
  group: '常规学习' | '复习与检查' | '练习与修复' | 'IELTS';
  type: ManualLearningTask['type'];
  durationMinutes: number;
  title: string;
  note: string;
  guide?: StudyGuideTarget;
}

export interface ReviewProgress {
  subjectId: string;
  subjectName: string;
  intervalDays: number;
  easeFactor: number;
  streak: number;
  nextReviewDate: string;
  lastStatus: LearningStatus;
  lastStudiedContent?: string;
  lastIssue?: string;
  lastNote: string;
  updatedAt: string;
}

export interface TaskCompletion {
  completedAt: string;
  status?: LearningStatus;
  studiedContent?: string;
  issue?: string;
  note?: string;
}

export interface ScheduleControlState {
  schemaVersion: 1;
  timetable: TimetableImport | null;
  settings: ScheduleSettings;
  manualTasks: ManualLearningTask[];
  completions: Record<string, TaskCompletion>;
  reviewProgress: Record<string, ReviewProgress>;
  cues: StudyCue[];
  cueReviews: CueReview[];
  importedAt?: string;
}

export interface LearningTask {
  key: string;
  title: string;
  detail: string;
  type: LearningTaskType;
  date: string;
  start?: string;
  durationMinutes: number;
  subjectId?: string;
  subjectName?: string;
  studiedContent?: string;
  issue?: string;
  note?: string;
  lastStatus?: LearningStatus;
  lastReviewedAt?: string;
  overdue?: boolean;
  scope?: LearningScope;
  materials?: LearningMaterialProgress[];
  guide?: StudyGuideTarget;
  cueIds?: string[];
  manual?: boolean;
}

export const LEARNING_MATERIALS: ReadonlyArray<{ code: LearningMaterialCode; label: string }> = [
  { code: 'B', label: 'Textbook / Book' },
  { code: 'PQ', label: 'Problematic Questions' },
  { code: 'BW', label: 'Blackboard Writing' },
  { code: 'N', label: 'Notebook' },
  { code: 'BQ', label: 'Textbook Questions' },
  { code: 'PPT', label: 'PPT' },
  { code: 'HW', label: 'Homework' },
  { code: 'OTHER', label: '其他资料' },
];

export const LEARNING_TASK_PRESETS: ReadonlyArray<LearningTaskPreset> = [
  { id: 'learn-content', label: '学习新内容', group: '常规学习', type: 'study', durationMinutes: 45, title: '学习新内容', note: '记录实际学到的范围，并为需要检索的内容建立 Cue。', guide: { tab: 'learn', subTab: 'cornell' } },
  { id: 'after-class-cues', label: '课后整理 Notes + Cue', group: '常规学习', type: 'study', durationMinutes: 30, title: '整理 Notes 并创建 Cue', note: '只补课堂留下的缺口；Cue 跟 subsection 走。', guide: { tab: 'learn', subTab: 'cornell' } },
  { id: 'self-study', label: '自学未理解内容', group: '常规学习', type: 'self-study', durationMinutes: 50, title: '自学未理解内容', note: '定位最小知识缺口，学习后用一个 Cue 或代表任务验证。', guide: { tab: 'learn', subTab: 'selfstudy' } },
  { id: 'cue-recall', label: 'Cue Recall', group: '复习与检查', type: 'unit-review', durationMinutes: 25, title: 'Cue Recall', note: '遮住 Notes，逐条回答 Cue，并分别记录 √ / △ / ○。', guide: { tab: 'learn', subTab: 'review' } },
  { id: 'friday-audit', label: 'Friday Completeness Audit', group: '复习与检查', type: 'completeness-audit', durationMinutes: 35, title: 'Friday Completeness Audit', note: '检查 Notes → 对照 Textbook / PPT → Fill Gaps → 补 Cue → 检查 Cue 是否可用于检索。', guide: { tab: 'learn', subTab: 'cornell' } },
  { id: 'weekend-retrieval', label: 'Weekend Retrieval & Repair', group: '复习与检查', type: 'unit-review', durationMinutes: 60, title: 'Weekend Retrieval & Repair', note: '逐条 Cue 检索 → 证据检查 → 针对性修复；稳定的 √ 不必全部重做。', guide: { tab: 'learn', subTab: 'review' } },
  { id: 'unit-review', label: 'Unit Review', group: '复习与检查', type: 'unit-review', durationMinutes: 50, title: 'Unit Review', note: '检查 Syllabus coverage，优先复习未验证、△、○，并抽查旧 √。', guide: { tab: 'learn', subTab: 'traffic' } },
  { id: 'cumulative-review', label: 'Cumulative Review', group: '复习与检查', type: 'cumulative-review', durationMinutes: 60, title: 'Cumulative Review', note: '跨 Unit 抽查长期留存，不机械重做全部内容。', guide: { tab: 'learn', subTab: 'review' } },
  { id: 'problem-repair', label: '错题修复与重测', group: '练习与修复', type: 'repair', durationMinutes: 35, title: '修复 Problematic Questions', note: '定位 Knowledge Node、Root Cause 和 Retest；修完后换题验证。', guide: { tab: 'practice', subTab: 'diagnose' } },
  { id: 'targeted-practice', label: '专项练习', group: '练习与修复', type: 'practice', durationMinutes: 45, title: '专项练习', note: '围绕一个明确能力完成代表任务并记录证据。', guide: { tab: 'practice', subTab: 'types' } },
  { id: 'ielts-listening', label: 'IELTS Listening', group: 'IELTS', type: 'practice', durationMinutes: 60, title: 'IELTS Listening', note: '第一次连续听，不暂停、不回拨；复盘时确定至少一个具体错因。', guide: { tab: 'ielts', subTab: 'listening' } },
  { id: 'ielts-reading', label: 'IELTS Reading', group: 'IELTS', type: 'practice', durationMinutes: 60, title: 'IELTS Reading', note: '记录用时，并判断慢在定位、同义替换、证据还是作答。', guide: { tab: 'ielts', subTab: 'reading' } },
  { id: 'ielts-writing-draft', label: 'IELTS Writing · 首稿', group: 'IELTS', type: 'practice', durationMinutes: 60, title: 'IELTS Writing · 首稿', note: '独立审题、建立论证链并保留真实首稿。', guide: { tab: 'ielts', subTab: 'writing' } },
  { id: 'ielts-writing-repair', label: 'IELTS Writing · Repair', group: 'IELTS', type: 'repair', durationMinutes: 60, title: 'IELTS Writing · Repair', note: 'AI 只指出问题，自己修改；随后用新材料验证迁移。', guide: { tab: 'ielts', subTab: 'writing' } },
  { id: 'ielts-speaking', label: 'IELTS Speaking · Repair + Transfer', group: 'IELTS', type: 'practice', durationMinutes: 45, title: 'IELTS Speaking · Repair + Transfer', note: '首次录音 → 只修一个问题 → 换题验证。', guide: { tab: 'ielts', subTab: 'speaking' } },
  { id: 'ielts-weekly-review', label: 'IELTS Weekly Review', group: 'IELTS', type: 'unit-review', durationMinutes: 45, title: 'IELTS Weekly Review', note: '记录四科进度、一个主要问题和下周唯一优先项；未完成内容正常顺延。', guide: { tab: 'ielts', subTab: 'overview' } },
];

export const DEFAULT_SCHEDULE_SETTINGS: ScheduleSettings = {
  mode: 'term',
  previewEnabled: false,
  previewPreferenceSet: false,
  weekendReviewDay: 6,
};

export function createEmptyScheduleState(): ScheduleControlState {
  return {
    schemaVersion: 1,
    timetable: null,
    settings: { ...DEFAULT_SCHEDULE_SETTINGS },
    manualTasks: [],
    completions: {},
    reviewProgress: {},
    cues: [],
    cueReviews: [],
  };
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/u;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/iu;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function requiredText(value: unknown, label: string, maximum = 100): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label}不能为空。`);
  return value.trim().slice(0, maximum);
}

function optionalText(value: unknown, maximum = 100): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maximum) : undefined;
}

function validDate(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !DATE_PATTERN.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${label}必须是 YYYY-MM-DD。`);
  }
  return value;
}

function validTime(value: unknown, label: string): string {
  if (typeof value !== 'string' || !TIME_PATTERN.test(value)) throw new Error(`${label}必须是 HH:mm。`);
  return value;
}

function makeCourseId(name: string, index: number): string {
  const slug = name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/gu, '').slice(0, 36);
  return `${slug || 'course'}-${index + 1}`;
}

/** Validates untrusted JSON/AI output and returns only the supported timetable fields. */
export function parseTimetableImport(value: unknown): TimetableImport {
  const source = record(value);
  if (!source) throw new Error('课表必须是一个 JSON 对象。');
  const rawCourses = Array.isArray(source.courses) ? source.courses : null;
  if (!rawCourses) throw new Error('课表缺少 courses 数组。');
  if (rawCourses.length > 100) throw new Error('一次最多导入 100 门课程。');

  const courses = rawCourses.map((rawCourse, courseIndex): ScheduleCourse => {
    const course = record(rawCourse);
    if (!course) throw new Error(`第 ${courseIndex + 1} 门课程格式错误。`);
    const name = requiredText(course.name, `第 ${courseIndex + 1} 门课程名称`);
    const rawSessions = Array.isArray(course.sessions) ? course.sessions : null;
    if (!rawSessions?.length) throw new Error(`${name} 至少需要一个上课时段。`);
    if (rawSessions.length > 30) throw new Error(`${name} 的时段过多。`);
    const sessions = rawSessions.map((rawSession, sessionIndex): CourseSession => {
      const session = record(rawSession);
      if (!session) throw new Error(`${name} 第 ${sessionIndex + 1} 个时段格式错误。`);
      const day = Number(session.day);
      if (!Number.isInteger(day) || day < 1 || day > 7) throw new Error(`${name} 的 day 必须是 1–7。`);
      const start = validTime(session.start, `${name} 开始时间`);
      const end = validTime(session.end, `${name} 结束时间`);
      if (end <= start) throw new Error(`${name} 的结束时间必须晚于开始时间。`);
      const weeks = Array.isArray(session.weeks)
        ? [...new Set(session.weeks.map(Number).filter((week) => Number.isInteger(week) && week >= 1 && week <= 60))].sort((a, b) => a - b)
        : undefined;
      return {
        day,
        start,
        end,
        location: optionalText(session.location, 80),
        teacher: optionalText(session.teacher, 80),
        ...(weeks?.length ? { weeks } : {}),
      };
    });
    const requestedId = optionalText(course.id, 80);
    return {
      id: requestedId?.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-|-$/gu, '') || makeCourseId(name, courseIndex),
      name,
      shortName: optionalText(course.shortName, 40),
      color: typeof course.color === 'string' && COLOR_PATTERN.test(course.color) ? course.color : '#3b82f6',
      review: course.review === true,
      sessions,
    };
  });

  if (new Set(courses.map((course) => course.id)).size !== courses.length) throw new Error('课程 id 不能重复。');
  const termStart = validDate(source.termStart, 'termStart');
  const termEnd = validDate(source.termEnd, 'termEnd');
  if (termStart && termEnd && termEnd < termStart) throw new Error('termEnd 不能早于 termStart。');
  return {
    version: 1,
    name: optionalText(source.name, 100) ?? '我的课表',
    ...(termStart ? { termStart } : {}),
    ...(termEnd ? { termEnd } : {}),
    courses,
  };
}

export function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function dateFromKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

export function addCalendarDays(key: string, days: number): string {
  const date = dateFromKey(key);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

export function isoDay(date: Date): number {
  return date.getDay() === 0 ? 7 : date.getDay();
}

export function mondayOf(date: Date): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  result.setDate(result.getDate() - (isoDay(result) - 1));
  return result;
}

export function weekDates(date: Date): Date[] {
  const monday = mondayOf(date);
  return Array.from({ length: 7 }, (_, index) => {
    const result = new Date(monday);
    result.setDate(monday.getDate() + index);
    return result;
  });
}

export function termWeek(timetable: TimetableImport, date: Date): number | null {
  if (!timetable.termStart) return null;
  const start = mondayOf(dateFromKey(timetable.termStart));
  const target = mondayOf(date);
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const targetUtc = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.floor((targetUtc - startUtc) / 604_800_000) + 1;
}

export function sessionOccurs(timetable: TimetableImport, session: CourseSession, date: Date): boolean {
  const key = dateKey(date);
  if (timetable.termStart && key < timetable.termStart) return false;
  if (timetable.termEnd && key > timetable.termEnd) return false;
  if (session.day !== isoDay(date)) return false;
  if (!session.weeks?.length) return true;
  const week = termWeek(timetable, date);
  return week === null || session.weeks.includes(week);
}

export function sessionsForDate(timetable: TimetableImport | null, date: Date): Array<CourseSession & { course: ScheduleCourse }> {
  if (!timetable) return [];
  return timetable.courses
    .flatMap((course) => course.sessions.filter((session) => sessionOccurs(timetable, session, date)).map((session) => ({ ...session, course })))
    .sort((a, b) => a.start.localeCompare(b.start));
}

function reviewDetail(type: 'daily' | 'interval' | 'weekly'): string {
  if (type === 'weekly') return '只验证本周 Cue、△ / ○、重复错误和精选 Problematic Questions；稳定的 √ 不需要全部重做。';
  if (type === 'interval') return '先闭卷检索，再用笔记、教材或代表题核对；根据证据更新 Cue 与易错点。';
  return '闭卷回忆 Cue → 对照笔记或教材 → 按需做 1–2 道代表题 → 用 √ / △ / ○ 记录状态。';
}

function courseReviewTasks(state: ScheduleControlState, date: Date): LearningTask[] {
  if (state.settings.mode !== 'term' || !state.timetable) return [];
  const key = dateKey(date);
  const courses = new Map<string, ScheduleCourse>();
  for (const session of sessionsForDate(state.timetable, date)) if (session.course.review) courses.set(session.course.id, session.course);
  return [...courses.values()].map((course) => {
    const progress = state.reviewProgress[course.id];
    const failedToday = progress?.lastStatus === 'unclear' && dateKey(new Date(progress.updatedAt)) === key;
    return {
      key: `course-review:${key}:${course.id}`,
      title: `复习 ${course.shortName ?? course.name}`,
      detail: reviewDetail('daily'),
      type: 'course-review',
      date: key,
      durationMinutes: 25,
      subjectId: course.id,
      subjectName: course.name,
      ...(failedToday ? {
        studiedContent: progress.lastStudiedContent,
        issue: progress.lastIssue ?? progress.lastNote,
        note: progress.lastNote,
        lastStatus: progress.lastStatus,
        lastReviewedAt: progress.updatedAt,
      } : {}),
    } satisfies LearningTask;
  });
}

function intervalReviewTasks(state: ScheduleControlState, date: Date, existingSubjectIds: Set<string>): LearningTask[] {
  const key = dateKey(date);
  return Object.values(state.reviewProgress).flatMap((progress) => {
    if (progress.nextReviewDate > key || existingSubjectIds.has(progress.subjectId)) return [];
    const taskKey = `interval-review:${progress.nextReviewDate}:${progress.subjectId}`;
    if (state.completions[taskKey]) return [];
    const statusMark = progress.lastStatus === 'stable' ? '√' : progress.lastStatus === 'partial' ? '△' : '○';
    return [{
      key: taskKey,
      title: `${progress.subjectName} · ${statusMark} 后续复习`,
      detail: `原因：${progress.subjectName} 上次记录为 ${statusMark}，需要按复习间隔再次检索。${reviewDetail('interval')}`,
      type: 'interval-review' as const,
      date: progress.nextReviewDate,
      durationMinutes: 25,
      subjectId: progress.subjectId,
      subjectName: progress.subjectName,
      studiedContent: progress.lastStudiedContent,
      issue: progress.lastIssue ?? (progress.lastStatus === 'stable' ? undefined : progress.lastNote),
      note: progress.lastNote,
      lastStatus: progress.lastStatus,
      lastReviewedAt: progress.updatedAt,
      overdue: progress.nextReviewDate < key,
    }];
  });
}

function weeklyReviewTasks(state: ScheduleControlState, date: Date): LearningTask[] {
  if (state.settings.mode !== 'term' || !state.timetable || isoDay(date) !== state.settings.weekendReviewDay) return [];
  const key = dateKey(date);
  const courses = new Map<string, ScheduleCourse>();
  for (const day of weekDates(date)) {
    for (const session of sessionsForDate(state.timetable, day)) if (session.course.review) courses.set(session.course.id, session.course);
  }
  return [...courses.values()].map((course) => ({
    key: `weekly-review:${key}:${course.id}`,
    title: `本周集中复习 · ${course.shortName ?? course.name}`,
    detail: reviewDetail('weekly'),
    type: 'weekly-review',
    date: key,
    durationMinutes: 35,
    subjectId: course.id,
    subjectName: course.name,
  }));
}

function cueReviewTasks(state: ScheduleControlState, date: Date): LearningTask[] {
  const key = dateKey(date);
  const due = state.cues.filter((cue) => cue.nextReviewDate && cue.nextReviewDate <= key);
  const groups = new Map<string, StudyCue[]>();
  for (const cue of due) groups.set(cue.subjectId, [...(groups.get(cue.subjectId) ?? []), cue]);
  return [...groups.values()].map((cues) => ({
    key: `cue-review:${key}:${cues[0].subjectId}`,
    title: `${cues[0].subjectName} · ${cues.length} 条 Cue 到期`,
    detail: '遮住 Notes，逐条回答；每条 Cue 独立记录 √ / △ / ○。Definition 必须包含必要关键词，Explain 必须保持 marking-point chain。',
    type: 'cue-review',
    date: key,
    durationMinutes: Math.min(60, Math.max(15, cues.length * 5)),
    subjectId: cues[0].subjectId,
    subjectName: cues[0].subjectName,
    cueIds: cues.map((cue) => cue.id),
    scope: {
      unit: [...new Set(cues.map((cue) => cue.unit))].join('、'),
      subsection: [...new Set(cues.map((cue) => cue.subsection))].join('、'),
      cueIds: cues.map((cue) => cue.id),
    },
    guide: { tab: 'learn', subTab: 'review' },
    overdue: cues.some((cue) => Boolean(cue.nextReviewDate && cue.nextReviewDate < key)),
  }));
}

function previewTasks(state: ScheduleControlState, date: Date): LearningTask[] {
  if (state.settings.mode !== 'term' || !state.settings.previewEnabled || !state.timetable) return [];
  let targetDate: Date | null = null;
  let sessions: ReturnType<typeof sessionsForDate> = [];
  for (let offset = 1; offset <= 7; offset += 1) {
    const candidate = dateFromKey(addCalendarDays(dateKey(date), offset));
    const candidateSessions = sessionsForDate(state.timetable, candidate);
    if (candidateSessions.length) { targetDate = candidate; sessions = candidateSessions; break; }
  }
  if (!targetDate) return [];
  const courses = new Map<string, ScheduleCourse>();
  for (const session of sessions) courses.set(session.course.id, session.course);
  const today = dateKey(date);
  const target = dateKey(targetDate);
  return [...courses.values()].map((course) => ({
    key: `preview:${today}:${target}:${course.id}`,
    title: `预习 ${course.shortName ?? course.name}`,
    detail: '只在新 Unit 开始时快速看 Structure、Logic、Connection；普通续课只写下明天要确认的问题。',
    type: 'preview',
    date: today,
    durationMinutes: 15,
    subjectId: course.id,
    subjectName: course.name,
  }));
}

export function tasksForDate(state: ScheduleControlState, date: Date): LearningTask[] {
  const key = dateKey(date);
  const daily = courseReviewTasks(state, date);
  const subjectIds = new Set(daily.map((task) => task.subjectId).filter((id): id is string => Boolean(id)));
  const automatic = [
    ...cueReviewTasks(state, date),
    ...intervalReviewTasks(state, date, subjectIds),
    ...daily,
    ...weeklyReviewTasks(state, date),
    ...previewTasks(state, date),
  ];
  const manual = state.manualTasks
    .filter((task) => task.date <= key && !state.completions[task.id])
    .map((task): LearningTask => ({
      key: task.id,
      title: task.title,
      detail: task.note || (task.type === 'exam' ? '按当前考试日期安排 Diagnose、Repair、Verify 与 Simulate。' : '自定义学习任务。'),
      type: task.type,
      date: task.date,
      start: task.start,
      durationMinutes: task.durationMinutes,
      subjectName: task.subject,
      note: task.note,
      scope: task.scope,
      materials: task.materials,
      guide: task.guide,
      cueIds: task.scope?.cueIds,
      manual: true,
      overdue: task.presetId?.startsWith('ielts-') ? false : task.date < key,
    }));
  return [...manual, ...automatic]
    .filter((task) => !state.completions[task.key])
    .sort((a, b) => Number(Boolean(b.overdue)) - Number(Boolean(a.overdue)) || (a.start ?? '99:99').localeCompare(b.start ?? '99:99') || a.type.localeCompare(b.type));
}

export function completeCueReviews(
  state: ScheduleControlState,
  assessments: CueAssessment[],
  completedAt: Date,
  taskKey?: string,
): ScheduleControlState {
  if (!assessments.length) throw new Error('请至少评估一条 Cue。');
  const byCueId = new Map(assessments.map((assessment) => [assessment.cueId, assessment]));
  if (byCueId.size !== assessments.length) throw new Error('同一条 Cue 不能重复评估。');
  const reviewedDate = dateKey(completedAt);
  const reviewedAt = completedAt.toISOString();
  const found = new Set<string>();
  const reviews: CueReview[] = [];
  const cues = state.cues.map((cue) => {
    const assessment = byCueId.get(cue.id);
    if (!assessment) return cue;
    found.add(cue.id);
    const scheduled = scheduleReview({
      intervalDays: cue.intervalDays,
      easeFactor: cue.easeFactor,
      streak: cue.streak,
    }, assessment.status === 'stable' ? 5 : assessment.status === 'partial' ? 2 : 1, completedAt);
    const intervalDays = assessment.status === 'stable' ? Math.max(3, scheduled.intervalDays) : assessment.status === 'partial' ? 1 : 0;
    const nextReviewDate = addCalendarDays(reviewedDate, intervalDays);
    reviews.push({
      id: `${cue.id}:${reviewedAt}`,
      cueId: cue.id,
      ...(taskKey ? { taskKey } : {}),
      status: assessment.status,
      ...(assessment.note?.trim() ? { note: assessment.note.trim().slice(0, 1000) } : {}),
      reviewedAt,
      nextReviewDate,
    });
    return {
      ...cue,
      status: assessment.status,
      intervalDays,
      easeFactor: scheduled.easeFactor,
      streak: assessment.status === 'unclear' ? 0 : scheduled.streak,
      nextReviewDate,
      lastReviewedAt: reviewedAt,
      updatedAt: reviewedAt,
    };
  });
  if (found.size !== byCueId.size) throw new Error('评估中包含不存在的 Cue。');
  return {
    ...state,
    cues,
    cueReviews: [...state.cueReviews, ...reviews],
  };
}

export function isCueReviewTask(type: LearningTaskType): boolean {
  return ['course-review', 'interval-review', 'weekly-review', 'cue-review', 'unit-review', 'cumulative-review'].includes(type);
}

export function completeReview(
  state: ScheduleControlState,
  task: LearningTask,
  status: LearningStatus,
  details: ReviewDetails,
  completedAt: Date,
): ScheduleControlState {
  if (!task.subjectId || !task.subjectName) throw new Error('复习任务缺少科目信息。');
  const studiedContent = details.studiedContent.trim().slice(0, 1000);
  const issue = status === 'stable' ? '' : details.issue.trim().slice(0, 1000);
  const note = details.note.trim().slice(0, 1000);
  if (!studiedContent) throw new Error('请填写本次复习了什么。');
  if (status !== 'stable' && !issue) throw new Error('△ 和 ○ 必须填写发现的问题。');
  const previous = state.reviewProgress[task.subjectId];
  const scheduled = scheduleReview({
    intervalDays: previous?.intervalDays ?? 0,
    easeFactor: previous?.easeFactor ?? 2.5,
    streak: previous?.streak ?? 0,
  }, status === 'stable' ? 5 : status === 'partial' ? 2 : 1, completedAt);
  const reviewedDate = dateKey(completedAt);
  const passed = status !== 'unclear';
  const intervalDays = status === 'stable' ? Math.max(3, scheduled.intervalDays) : status === 'partial' ? 1 : 0;
  const nextReviewDate = passed ? addCalendarDays(reviewedDate, intervalDays) : reviewedDate;
  return {
    ...state,
    completions: passed ? {
      ...state.completions,
      [task.key]: { completedAt: completedAt.toISOString(), status, studiedContent, issue, note },
    } : state.completions,
    reviewProgress: {
      ...state.reviewProgress,
      [task.subjectId]: {
        subjectId: task.subjectId,
        subjectName: task.subjectName,
        intervalDays,
        easeFactor: scheduled.easeFactor,
        streak: status === 'unclear' ? 0 : scheduled.streak,
        nextReviewDate,
        lastStatus: status,
        lastStudiedContent: studiedContent,
        lastIssue: issue,
        lastNote: note,
        updatedAt: completedAt.toISOString(),
      },
    },
  };
}

/** Applies the user's explicit subject selection after an import preview. */
export function withReviewCourseSelection(timetable: TimetableImport, courseIds: Iterable<string>): TimetableImport {
  const selected = new Set(courseIds);
  return {
    ...timetable,
    courses: timetable.courses.map((course) => ({ ...course, review: selected.has(course.id) })),
  };
}

export function timetableImportTemplate(): TimetableImport {
  return {
    version: 1,
    name: '我的课表',
    termStart: '2026-09-01',
    termEnd: '2027-01-31',
    courses: [{
      id: 'example-course',
      name: '示例课程',
      shortName: '示例',
      color: '#3b82f6',
      review: false,
      sessions: [{ day: 1, start: '08:00', end: '08:45', location: '教室', teacher: '教师', weeks: [1, 2, 3] }],
    }],
  };
}
