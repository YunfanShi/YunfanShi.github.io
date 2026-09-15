import { scheduleReview } from './review-schedule.ts';

export type ScheduleMode = 'term' | 'holiday';
export type LearningTaskType = 'course-review' | 'interval-review' | 'weekly-review' | 'preview' | 'special' | 'exam' | 'custom';
export type LearningStatus = 'stable' | 'partial' | 'unclear';

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
  weekendReviewDay: 6 | 7;
}

export interface ManualLearningTask {
  id: string;
  title: string;
  type: 'special' | 'exam' | 'custom';
  date: string;
  start?: string;
  durationMinutes: number;
  subject?: string;
  note?: string;
}

export interface ReviewProgress {
  subjectId: string;
  subjectName: string;
  intervalDays: number;
  easeFactor: number;
  streak: number;
  nextReviewDate: string;
  lastStatus: LearningStatus;
  lastNote: string;
  updatedAt: string;
}

export interface TaskCompletion {
  completedAt: string;
  status?: LearningStatus;
  note?: string;
}

export interface ScheduleControlState {
  schemaVersion: 1;
  timetable: TimetableImport | null;
  settings: ScheduleSettings;
  manualTasks: ManualLearningTask[];
  completions: Record<string, TaskCompletion>;
  reviewProgress: Record<string, ReviewProgress>;
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
  note?: string;
  overdue?: boolean;
}

export const DEFAULT_SCHEDULE_SETTINGS: ScheduleSettings = {
  mode: 'term',
  previewEnabled: true,
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
  return [...courses.values()].map((course) => ({
    key: `course-review:${key}:${course.id}`,
    title: `复习 ${course.shortName ?? course.name}`,
    detail: reviewDetail('daily'),
    type: 'course-review',
    date: key,
    durationMinutes: 25,
    subjectId: course.id,
    subjectName: course.name,
  }));
}

function intervalReviewTasks(state: ScheduleControlState, date: Date, existingSubjectIds: Set<string>): LearningTask[] {
  const key = dateKey(date);
  return Object.values(state.reviewProgress).flatMap((progress) => {
    if (progress.nextReviewDate > key || existingSubjectIds.has(progress.subjectId)) return [];
    const taskKey = `interval-review:${progress.nextReviewDate}:${progress.subjectId}`;
    if (state.completions[taskKey]) return [];
    return [{
      key: taskKey,
      title: `间隔复习 ${progress.subjectName}`,
      detail: reviewDetail('interval'),
      type: 'interval-review' as const,
      date: progress.nextReviewDate,
      durationMinutes: 25,
      subjectId: progress.subjectId,
      subjectName: progress.subjectName,
      note: progress.lastNote,
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
      overdue: task.date < key,
    }));
  return [...manual, ...automatic]
    .filter((task) => !state.completions[task.key])
    .sort((a, b) => Number(Boolean(b.overdue)) - Number(Boolean(a.overdue)) || (a.start ?? '99:99').localeCompare(b.start ?? '99:99') || a.type.localeCompare(b.type));
}

export function completeReview(
  state: ScheduleControlState,
  task: LearningTask,
  status: LearningStatus,
  note: string,
  completedAt: Date,
): ScheduleControlState {
  if (!task.subjectId || !task.subjectName) throw new Error('复习任务缺少科目信息。');
  const previous = state.reviewProgress[task.subjectId];
  const scheduled = scheduleReview({
    intervalDays: previous?.intervalDays ?? 0,
    easeFactor: previous?.easeFactor ?? 2.5,
    streak: previous?.streak ?? 0,
  }, status === 'stable' ? 5 : status === 'partial' ? 2 : 1, completedAt);
  const reviewedDate = dateKey(completedAt);
  return {
    ...state,
    completions: {
      ...state.completions,
      [task.key]: { completedAt: completedAt.toISOString(), status, note: note.trim().slice(0, 1000) },
    },
    reviewProgress: {
      ...state.reviewProgress,
      [task.subjectId]: {
        subjectId: task.subjectId,
        subjectName: task.subjectName,
        intervalDays: scheduled.intervalDays,
        easeFactor: scheduled.easeFactor,
        streak: scheduled.streak,
        nextReviewDate: addCalendarDays(reviewedDate, scheduled.intervalDays),
        lastStatus: status,
        lastNote: note.trim().slice(0, 1000),
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
