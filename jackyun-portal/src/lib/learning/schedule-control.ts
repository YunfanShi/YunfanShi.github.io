import { scheduleReview } from './review-schedule.ts';

export type ScheduleMode = 'term' | 'holiday';
export type LearningTaskType = 'course-review' | 'interval-review' | 'weekly-review' | 'cue-review' | 'completeness-audit' | 'unit-review' | 'cumulative-review' | 'study' | 'self-study' | 'practice' | 'repair' | 'preview' | 'special' | 'exam' | 'custom';
export type LearningStatus = 'stable' | 'partial' | 'unclear';
export type CueType = 'general' | 'definition' | 'explain' | 'state' | 'calculate' | 'formula' | 'derivation' | 'proof' | 'compare' | 'process' | 'application' | 'diagram' | 'multiple-choice';
export type CueDisplayPreset = 'standard' | 'headline' | 'formula' | 'steps' | 'comparison' | 'scenario' | 'definition-card' | 'multiple-choice';
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
  defaultRecordView: 'calendar' | 'subjects';
  recordReminderEnabled: boolean;
  recordReminderTime: string;
  cueShowMastered: boolean;
}

export interface LearningCatalogUnit {
  name: string;
  subsections: string[];
}

export interface LearningCatalogSubject {
  id: string;
  name: string;
  units: LearningCatalogUnit[];
  materialProgress: Partial<Record<LearningMaterialCode, string>>;
}

export interface LearningCatalogImport {
  version: 1;
  subjects: LearningCatalogSubject[];
}

export interface LearningReminder {
  id: string;
  title: string;
  date: string;
  subjectId?: string;
  completed: boolean;
}

export interface ManualLearningTask {
  id: string;
  title: string;
  type: LearningTaskType;
  date: string;
  start?: string;
  durationMinutes: number;
  subjectId?: string;
  subject?: string;
  note?: string;
  presetId?: string;
  sourceTaskKey?: string;
  overdueSince?: string;
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
  subtitle?: string;
  answer?: string;
  type: CueType;
  display?: CueDisplayPreset;
  choices?: string[];
  correctChoice?: number;
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
  subjectName?: string;
  scope?: LearningScope;
  materials?: LearningMaterialProgress[];
  cueIds?: string[];
}

export interface LearningSessionEvidence {
  subjectName?: string;
  scope?: LearningScope;
  materials: LearningMaterialProgress[];
  cueIds: string[];
  newCues: StudyCue[];
  assessments: CueAssessment[];
}

export interface LearningRecordCue {
  cueId: string;
  subjectName: string;
  unit: string;
  subsection: string;
  prompt: string;
  subtitle?: string;
  type: CueType;
  display?: CueDisplayPreset;
  choices?: string[];
  correctChoice?: number;
  markingPoints: string[];
  status: LearningStatus | 'linked';
}

export interface LearningSystemReport {
  cueTotal: number;
  stableCount: number;
  partialCount: number;
  unclearCount: number;
  linkedCount: number;
  passRate: number;
  summary: string;
  nextActions: string[];
}

export interface LearningRecord {
  id: string;
  taskKey: string;
  taskTitle: string;
  taskType: LearningTaskType;
  completedAt: string;
  status: LearningStatus;
  studiedContent: string;
  issue: string;
  note: string;
  subjectName?: string;
  scope?: LearningScope;
  materials: LearningMaterialProgress[];
  cues: LearningRecordCue[];
  guide?: StudyGuideTarget;
  systemReport: LearningSystemReport;
  aiReport?: { content: string; generatedAt: string };
}

export interface TaskCancellation {
  cancelledAt: string;
  reason?: 'cancelled' | 'merged' | 'postponed';
  mergedInto?: string;
}

export interface CueBatchImportItem {
  unit: string;
  prompt: string;
  subtitle?: string;
  answer?: string;
  type: CueType;
  display: CueDisplayPreset;
  choices?: string[];
  correctChoice?: number;
  markingPoints: string[];
}

export interface CueBatchImport {
  version: 1;
  cues: CueBatchImportItem[];
}

export interface CueEnrichmentItem {
  id: string;
  subtitle?: string;
  answer?: string;
  type?: CueType;
  display?: CueDisplayPreset;
  choices?: string[];
  correctChoice?: number;
  markingPoints?: string[];
}

export interface CueStudyDraft {
  id: string;
  task: LearningTask;
  cueIds: string[];
  index: number;
  revealed: boolean;
  selectedChoice?: number;
  assessments: Record<string, LearningStatus>;
  updatedAt: string;
}

export interface ScheduleControlState {
  schemaVersion: 1;
  timetable: TimetableImport | null;
  settings: ScheduleSettings;
  manualTasks: ManualLearningTask[];
  completions: Record<string, TaskCompletion>;
  cancellations: Record<string, TaskCancellation>;
  reviewProgress: Record<string, ReviewProgress>;
  cues: StudyCue[];
  cueReviews: CueReview[];
  learningRecords: LearningRecord[];
  learningCatalog: LearningCatalogSubject[];
  learningReminders: LearningReminder[];
  cueStudyDraft?: CueStudyDraft;
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
  mergedTaskKeys?: string[];
  mergedTasks?: Array<{
    key: string;
    type: LearningTaskType;
    title: string;
    detail: string;
  }>;
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
  { id: 'after-class-cues', label: '课后整理 Notes + Cue', group: '常规学习', type: 'study', durationMinutes: 30, title: '整理 Notes 并创建 Cue', note: '只补课堂留下的缺口；Cue 按大单元整理。', guide: { tab: 'learn', subTab: 'cornell' } },
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
  defaultRecordView: 'calendar',
  recordReminderEnabled: true,
  recordReminderTime: '20:00',
  cueShowMastered: true,
};

export function createEmptyScheduleState(): ScheduleControlState {
  return {
    schemaVersion: 1,
    timetable: null,
    settings: { ...DEFAULT_SCHEDULE_SETTINGS },
    manualTasks: [],
    completions: {},
    cancellations: {},
    reviewProgress: {},
    cues: [],
    cueReviews: [],
    learningRecords: [],
    learningCatalog: [],
    learningReminders: [],
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

export function learningCatalogImportTemplate(): LearningCatalogImport {
  return {
    version: 1,
    subjects: [{
      id: 'physics',
      name: 'Physics',
      units: [{ name: 'Mechanics', subsections: [] }],
      materialProgress: { B: '1.2', N: 'P18' },
    }],
  };
}

export function parseLearningCatalogImport(value: unknown): LearningCatalogImport {
  const source = record(value);
  if (!source || !Array.isArray(source.subjects)) throw new Error('分类配置必须包含 subjects 数组。');
  if (source.subjects.length > 100) throw new Error('一次最多导入 100 个科目。');
  const materialCodes = new Set(LEARNING_MATERIALS.map((material) => material.code));
  const subjects = source.subjects.map((rawSubject, subjectIndex): LearningCatalogSubject => {
    const subject = record(rawSubject);
    if (!subject) throw new Error(`第 ${subjectIndex + 1} 个科目格式错误。`);
    const name = requiredText(subject.name, `第 ${subjectIndex + 1} 个科目名称`, 80);
    const requestedId = optionalText(subject.id, 80);
    const id = requestedId?.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-|-$/gu, '') || makeCourseId(name, subjectIndex);
    const rawUnits = Array.isArray(subject.units) ? subject.units : [];
    const units = rawUnits.map((rawUnit, unitIndex): LearningCatalogUnit => {
      const unit = record(rawUnit);
      if (!unit) throw new Error(`${name} 第 ${unitIndex + 1} 个大单元格式错误。`);
      const unitName = requiredText(unit.name, `${name} 第 ${unitIndex + 1} 个大单元名称`, 120);
      const subsections = Array.isArray(unit.subsections)
        ? [...new Set(unit.subsections.map((item) => requiredText(item, `${unitName} 小单元`, 120)))]
        : [];
      return { name: unitName, subsections };
    });
    const rawProgress = record(subject.materialProgress) ?? {};
    const materialProgress = Object.fromEntries(Object.entries(rawProgress).flatMap(([code, progress]) => materialCodes.has(code as LearningMaterialCode) && typeof progress === 'string' && progress.trim() ? [[code, progress.trim().slice(0, 200)]] : [])) as Partial<Record<LearningMaterialCode, string>>;
    return { id, name, units, materialProgress };
  });
  if (new Set(subjects.map((subject) => subject.id)).size !== subjects.length) throw new Error('科目 id 不能重复。');
  return { version: 1, subjects };
}

/** Merges a partial catalog import without removing existing subjects, units, subsections, or material positions. */
export function mergeLearningCatalog(
  existing: LearningCatalogSubject[],
  incoming: LearningCatalogSubject[],
): LearningCatalogSubject[] {
  const result = existing.map((subject) => ({
    ...subject,
    units: subject.units.map((unit) => ({ ...unit, subsections: [...unit.subsections] })),
    materialProgress: { ...subject.materialProgress },
  }));
  const normalize = (value: string) => value.trim().toLocaleLowerCase();
  for (const importedSubject of incoming) {
    const subjectIndex = result.findIndex((subject) => subject.id === importedSubject.id || normalize(subject.name) === normalize(importedSubject.name));
    if (subjectIndex < 0) {
      result.push({ ...importedSubject, units: importedSubject.units.map((unit) => ({ ...unit, subsections: [...unit.subsections] })), materialProgress: { ...importedSubject.materialProgress } });
      continue;
    }
    const current = result[subjectIndex];
    const units = current.units.map((unit) => ({ ...unit, subsections: [...unit.subsections] }));
    for (const importedUnit of importedSubject.units) {
      const unitIndex = units.findIndex((unit) => normalize(unit.name) === normalize(importedUnit.name));
      if (unitIndex < 0) {
        units.push({ ...importedUnit, subsections: [...importedUnit.subsections] });
        continue;
      }
      const seen = new Set(units[unitIndex].subsections.map(normalize));
      const subsections = [...units[unitIndex].subsections];
      for (const subsection of importedUnit.subsections) {
        const key = normalize(subsection);
        if (seen.has(key)) continue;
        seen.add(key);
        subsections.push(subsection);
      }
      units[unitIndex] = {
        ...units[unitIndex],
        subsections,
      };
    }
    result[subjectIndex] = {
      ...current,
      units,
      materialProgress: { ...current.materialProgress, ...importedSubject.materialProgress },
    };
  }
  return result;
}

/** Parses one learning unit per line. Legacy subsection syntax remains readable for old imports. */
export function parseLearningUnitOutline(value: string): LearningCatalogUnit[] {
  return value.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean).map((line, index) => {
    const separator = line.search(/[|｜:：]/u);
    const name = (separator < 0 ? line : line.slice(0, separator)).trim().slice(0, 120);
    if (!name) throw new Error(`第 ${index + 1} 行缺少大单元名称。`);
    const subsections = separator < 0 ? [] : [...new Set(line.slice(separator + 1).split(/[,，;；]/u).map((item) => item.trim().slice(0, 120)).filter(Boolean))];
    return { name, subsections };
  });
}

const SUBJECT_TOKEN_ALIASES: Record<string, string> = {
  math: 'mathematics', maths: 'mathematics', stats: 'statistics', comp: 'computer', cs: 'computerscience',
};
const SUBJECT_NOISE_TOKENS = new Set(['al', 'a', 'as', 'level', 'course', 'class', 'paper']);

function subjectKeywords(value: string): string[] {
  const tokens = value.normalize('NFKC').toLocaleLowerCase().match(/[a-z]+|\p{Script=Han}+|\d+/gu) ?? [];
  return [...new Set(tokens.map((token) => SUBJECT_TOKEN_ALIASES[token] ?? token).filter((token) => !SUBJECT_NOISE_TOKENS.has(token) && !/^\d+$/u.test(token)))];
}

/** Finds one unambiguous learning subject whose meaningful keywords occur in a timetable course name. */
export function matchLearningCatalogSubject(catalog: LearningCatalogSubject[], courseName: string): LearningCatalogSubject | undefined {
  const courseKeywords = new Set(subjectKeywords(courseName));
  if (!courseKeywords.size) return undefined;
  const matches = catalog.flatMap((subject) => {
    const keywords = subjectKeywords(subject.name);
    if (!keywords.length || !keywords.every((keyword) => courseKeywords.has(keyword))) return [];
    return [{ subject, score: keywords.length }];
  }).sort((left, right) => right.score - left.score);
  if (!matches.length || (matches[1] && matches[1].score === matches[0].score)) return undefined;
  return matches[0].subject;
}

/** Rewrites current subject references to catalog identities while leaving historical task titles intact. */
export function reconcileScheduleSubjects(state: ScheduleControlState): ScheduleControlState {
  if (!state.learningCatalog.length) return state;
  const resolve = (name?: string, id?: string) => {
    if (id) {
      const exact = state.learningCatalog.find((subject) => subject.id === id);
      if (exact) return exact;
    }
    return name ? matchLearningCatalogSubject(state.learningCatalog, name) : undefined;
  };
  const reviewProgress: Record<string, ReviewProgress> = {};
  for (const progress of Object.values(state.reviewProgress)) {
    const subject = resolve(progress.subjectName, progress.subjectId);
    const normalized = subject ? { ...progress, subjectId: subject.id, subjectName: subject.name } : progress;
    const previous = reviewProgress[normalized.subjectId];
    if (!previous || normalized.updatedAt > previous.updatedAt) reviewProgress[normalized.subjectId] = normalized;
  }
  return {
    ...state,
    manualTasks: state.manualTasks.map((task) => { const subject = resolve(task.subject, task.subjectId); return subject ? { ...task, subjectId: subject.id, subject: subject.name } : task; }),
    completions: Object.fromEntries(Object.entries(state.completions).map(([key, completion]) => { const subject = resolve(completion.subjectName); return [key, subject ? { ...completion, subjectName: subject.name } : completion]; })),
    reviewProgress,
    cues: state.cues.map((cue) => { const subject = resolve(cue.subjectName, cue.subjectId); return subject ? { ...cue, subjectId: subject.id, subjectName: subject.name } : cue; }),
    learningRecords: state.learningRecords.map((record) => {
      const subject = resolve(record.subjectName);
      return {
        ...record,
        ...(subject ? { subjectName: subject.name } : {}),
        cues: record.cues.map((cue) => { const cueSubject = resolve(cue.subjectName); return cueSubject ? { ...cue, subjectName: cueSubject.name } : cue; }),
      };
    }),
  };
}

export function cueBatchImportTemplate(): CueBatchImport {
  return {
    version: 1,
    cues: [
      { unit: 'Kinematics', prompt: 'Acceleration', subtitle: 'Recall the precise physical definition and include the time relationship.', answer: 'Change in velocity per unit time.', type: 'definition', display: 'definition-card', markingPoints: ['change in velocity', 'per unit time'] },
      { unit: 'Algebra', prompt: 'Solve \\(ax^2+bx+c=0\\).', subtitle: 'Assume \\(a\\ne0\\); state the condition for real roots.', answer: '\\(x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}\\), with \\(b^2-4ac\\ge0\\) for real roots.', type: 'formula', display: 'formula', markingPoints: ['correct quadratic formula', '\\(b^2-4ac\\ge0\\)'] },
      { unit: 'Forces', prompt: 'Which quantity is a vector?', type: 'multiple-choice', display: 'multiple-choice', choices: ['speed', 'distance', 'velocity', 'energy'], correctChoice: 2, markingPoints: ['velocity has magnitude and direction'] },
    ],
  };
}

export function parseCueBatchImport(value: unknown): CueBatchImport {
  const source = record(value);
  if (!source || !Array.isArray(source.cues)) throw new Error('Cue 配置必须包含 cues 数组。');
  if (!source.cues.length) throw new Error('至少需要一条 Cue。');
  if (source.cues.length > 200) throw new Error('一次最多导入 200 条 Cue。');
  const allowedTypes = new Set<CueType>(['general', 'definition', 'explain', 'state', 'calculate', 'formula', 'derivation', 'proof', 'compare', 'process', 'application', 'diagram', 'multiple-choice']);
  const allowedDisplays = new Set<CueDisplayPreset>(['standard', 'headline', 'formula', 'steps', 'comparison', 'scenario', 'definition-card', 'multiple-choice']);
  const cues = source.cues.map((rawCue, index): CueBatchImportItem => {
    const cue = record(rawCue);
    if (!cue) throw new Error(`第 ${index + 1} 条 Cue 格式错误。`);
    const unit = requiredText(cue.unit, `第 ${index + 1} 条 Cue 的大单元`, 120);
    const prompt = requiredText(cue.prompt, `第 ${index + 1} 条 Cue`, 500);
    const subtitle = optionalText(cue.subtitle, 500);
    const type = typeof cue.type === 'string' && allowedTypes.has(cue.type as CueType) ? cue.type as CueType : 'general';
    const display = typeof cue.display === 'string' && allowedDisplays.has(cue.display as CueDisplayPreset) ? cue.display as CueDisplayPreset : 'standard';
    const answer = optionalText(cue.answer, 2000);
    const choices = Array.isArray(cue.choices) ? cue.choices.map((item) => requiredText(item, `第 ${index + 1} 条 Cue 的选项`, 500)).slice(0, 6) : [];
    const correctChoice = Number.isInteger(cue.correctChoice) ? Number(cue.correctChoice) : undefined;
    if (type === 'multiple-choice' && (choices.length < 2 || correctChoice === undefined || correctChoice < 0 || correctChoice >= choices.length)) throw new Error(`第 ${index + 1} 条选择题必须有 2–6 个选项和有效的 correctChoice（从 0 开始）。`);
    const markingPoints = Array.isArray(cue.markingPoints)
      ? cue.markingPoints.map((item) => requiredText(item, `第 ${index + 1} 条 Cue 的 marking point`, 300)).slice(0, 12)
      : [];
    return { unit, prompt, ...(subtitle ? { subtitle } : {}), ...(answer ? { answer } : {}), type, display, ...(choices.length ? { choices, correctChoice } : {}), markingPoints };
  });
  return { version: 1, cues };
}

export function applyCueUnitMappings(
  cues: CueBatchImportItem[],
  mappings: Record<string, string>,
): CueBatchImportItem[] {
  return cues.map((cue) => ({
    ...cue,
    unit: mappings[cue.unit]?.trim() || cue.unit,
  }));
}

export function parseCueEnrichments(value: unknown): CueEnrichmentItem[] {
  const source = record(value);
  if (!source || !Array.isArray(source.updates) || !source.updates.length) throw new Error('补充配置必须包含非空 updates 数组。');
  if (source.updates.length > 200) throw new Error('一次最多补充 200 条 Cue。');
  const allowedTypes = new Set<CueType>(['general', 'definition', 'explain', 'state', 'calculate', 'formula', 'derivation', 'proof', 'compare', 'process', 'application', 'diagram', 'multiple-choice']);
  const allowedDisplays = new Set<CueDisplayPreset>(['standard', 'headline', 'formula', 'steps', 'comparison', 'scenario', 'definition-card', 'multiple-choice']);
  return source.updates.map((rawUpdate, index) => {
    const update = record(rawUpdate);
    if (!update) throw new Error(`第 ${index + 1} 条补充格式错误。`);
    const id = requiredText(update.id, `第 ${index + 1} 条补充的 id`, 120);
    const type = typeof update.type === 'string' && allowedTypes.has(update.type as CueType) ? update.type as CueType : undefined;
    const display = typeof update.display === 'string' && allowedDisplays.has(update.display as CueDisplayPreset) ? update.display as CueDisplayPreset : undefined;
    const subtitle = optionalText(update.subtitle, 500);
    const answer = optionalText(update.answer, 2000);
    const markingPoints = Array.isArray(update.markingPoints) ? update.markingPoints.map((item) => requiredText(item, `第 ${index + 1} 条补充的 marking point`, 300)).slice(0, 12) : undefined;
    const choices = Array.isArray(update.choices) ? update.choices.map((item) => requiredText(item, `第 ${index + 1} 条补充的选项`, 500)).slice(0, 6) : undefined;
    const correctChoice = Number.isInteger(update.correctChoice) ? Number(update.correctChoice) : undefined;
    if ((type === 'multiple-choice' || choices) && (!choices || choices.length < 2 || correctChoice === undefined || correctChoice < 0 || correctChoice >= choices.length)) throw new Error(`第 ${index + 1} 条选择题补充必须有 2–6 个选项和有效的 correctChoice。`);
    return { id, ...(subtitle ? { subtitle } : {}), ...(answer ? { answer } : {}), ...(type ? { type } : {}), ...(display ? { display } : {}), ...(choices ? { choices, correctChoice } : {}), ...(markingPoints ? { markingPoints } : {}) };
  });
}

export function applyCueEnrichments(cues: StudyCue[], updates: CueEnrichmentItem[], updatedAt: string): StudyCue[] {
  const byId = new Map(updates.map((update) => [update.id, update]));
  return cues.map((cue) => {
    const update = byId.get(cue.id);
    return update ? { ...cue, ...update, id: cue.id, updatedAt } : cue;
  });
}

export function updateSubjectMaterialProgress(
  subjects: LearningCatalogSubject[],
  subjectName: string,
  materials: LearningMaterialProgress[],
): LearningCatalogSubject[] {
  const normalized = subjectName.trim().toLocaleLowerCase();
  if (!normalized || !materials.some((material) => material.progress?.trim())) return subjects;
  return subjects.map((subject) => subject.name.trim().toLocaleLowerCase() !== normalized ? subject : {
    ...subject,
    materialProgress: {
      ...subject.materialProgress,
      ...Object.fromEntries(materials.flatMap((material) => material.progress?.trim() ? [[material.code, material.progress.trim().slice(0, 200)]] : [])),
    },
  });
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

const IELTS_WEEK_PRESET_IDS = [
  'ielts-listening',
  'ielts-reading',
  'ielts-writing-draft',
  'ielts-speaking',
  'ielts-weekly-review',
] as const;

/** Creates one IELTS module per weekday instead of placing the whole week on Monday. */
export function createIeltsWeekTasks(weekStart: string): ManualLearningTask[] {
  return IELTS_WEEK_PRESET_IDS.flatMap((presetId, index) => {
    const preset = LEARNING_TASK_PRESETS.find((item) => item.id === presetId);
    if (!preset) return [];
    return [{
      id: `ielts:${weekStart}:${presetId}`,
      title: preset.title,
      type: preset.type,
      date: addCalendarDays(weekStart, index),
      durationMinutes: preset.durationMinutes,
      subject: 'IELTS',
      presetId,
      note: preset.note,
      guide: preset.guide,
    } satisfies ManualLearningTask];
  });
}

/** Repairs IELTS weeks created by older clients that assigned every module to Monday. */
export function migrateIeltsWeekTaskDates(tasks: ManualLearningTask[]): ManualLearningTask[] {
  return tasks.map((task) => {
    const match = /^ielts:(\d{4}-\d{2}-\d{2}):(ielts-[a-z-]+)$/u.exec(task.id);
    if (!match || task.date !== match[1]) return task;
    const offset = IELTS_WEEK_PRESET_IDS.indexOf(match[2] as typeof IELTS_WEEK_PRESET_IDS[number]);
    return offset > 0 ? { ...task, date: addCalendarDays(match[1], offset) } : task;
  });
}

export function rescheduleManualTask(tasks: ManualLearningTask[], taskId: string, targetDate: string): ManualLearningTask[] {
  return tasks.map((task) => task.id === taskId ? { ...task, date: targetDate, start: undefined } : task);
}

/** Moves either a stored task or a generated task while preserving its learning context. */
export function postponeLearningTask(
  state: ScheduleControlState,
  task: LearningTask,
  targetDate: string,
  postponedAt = new Date().toISOString(),
): ScheduleControlState {
  if (task.manual && !task.mergedTaskKeys?.length) {
    return {
      ...state,
      manualTasks: state.manualTasks.map((item) => item.id === task.key ? {
        ...item,
        date: targetDate,
        start: undefined,
        ...(task.overdue ? { overdueSince: item.overdueSince ?? task.date } : {}),
      } : item),
    };
  }
  const id = `postponed:${task.key}`;
  const copy: ManualLearningTask = {
    id,
    title: task.title,
    type: task.type,
    date: targetDate,
    durationMinutes: task.durationMinutes,
    ...(task.subjectId ? { subjectId: task.subjectId } : {}),
    ...(task.subjectName ? { subject: task.subjectName } : {}),
    ...(task.detail ? { note: task.detail } : {}),
    ...(task.scope ? { scope: task.scope } : {}),
    ...(task.materials ? { materials: task.materials } : {}),
    ...(task.guide ? { guide: task.guide } : {}),
    sourceTaskKey: task.key,
    ...(task.overdue ? { overdueSince: task.date } : {}),
  };
  return {
    ...state,
    manualTasks: [...state.manualTasks.filter((item) => item.id !== id), copy],
    cancellations: {
      ...state.cancellations,
      ...Object.fromEntries((task.mergedTaskKeys ?? [task.key]).map((key) => [key, { cancelledAt: postponedAt, reason: 'postponed' as const, mergedInto: id }])),
    },
  };
}

function manualTaskMergeKey(task: ManualLearningTask): string {
  return JSON.stringify([
    task.presetId ?? '',
    task.type,
    task.title.trim().replace(/\s+/gu, ' ').toLocaleLowerCase(),
    task.subject?.trim().replace(/\s+/gu, ' ').toLocaleLowerCase() ?? '',
    task.scope?.unit?.trim().replace(/\s+/gu, ' ').toLocaleLowerCase() ?? '',
    task.scope?.subsection?.trim().replace(/\s+/gu, ' ').toLocaleLowerCase() ?? '',
  ]);
}

/** Rolls unfinished overdue work into today and merges equivalent due tasks. */
export function rollOverManualTasks(
  state: ScheduleControlState,
  today: string,
  rolledAt = new Date().toISOString(),
): ScheduleControlState {
  const dueGroups = new Map<string, ManualLearningTask[]>();
  for (const task of state.manualTasks) {
    if (task.date > today || state.completions[task.id] || state.cancellations[task.id]) continue;
    const key = manualTaskMergeKey(task);
    dueGroups.set(key, [...(dueGroups.get(key) ?? []), task]);
  }

  const updatedDates = new Map<string, ManualLearningTask>();
  const cancellations = { ...state.cancellations };
  let changed = false;
  for (const tasks of dueGroups.values()) {
    const survivor = tasks.find((task) => task.date === today) ?? tasks[0];
    const overdueSince = tasks.map((task) => task.overdueSince ?? task.date).filter((date) => date < today).sort()[0];
    if (survivor.date < today || overdueSince) {
      updatedDates.set(survivor.id, { ...survivor, date: today, start: survivor.date < today ? undefined : survivor.start, ...(overdueSince ? { overdueSince } : {}) });
      changed = true;
    }
    for (const duplicate of tasks) {
      if (duplicate.id === survivor.id) continue;
      cancellations[duplicate.id] = { cancelledAt: rolledAt, reason: 'merged', mergedInto: survivor.id };
      changed = true;
    }
  }

  if (!changed) return state;
  return {
    ...state,
    manualTasks: state.manualTasks.map((task) => updatedDates.get(task.id) ?? task),
    cancellations,
  };
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
    const catalogSubject = matchLearningCatalogSubject(state.learningCatalog, `${course.name} ${course.shortName ?? ''}`);
    const progress = state.reviewProgress[catalogSubject?.id ?? course.id];
    const failedToday = progress?.lastStatus === 'unclear' && dateKey(new Date(progress.updatedAt)) === key;
    return {
      key: `course-review:${key}:${course.id}`,
      title: `复习 ${course.shortName ?? course.name}`,
      detail: reviewDetail('daily'),
      type: 'course-review',
      date: key,
      durationMinutes: 25,
      subjectId: catalogSubject?.id ?? course.id,
      subjectName: catalogSubject?.name ?? course.name,
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

function intervalReviewTasks(state: ScheduleControlState, date: Date): LearningTask[] {
  const key = dateKey(date);
  return Object.values(state.reviewProgress).flatMap((progress) => {
    if (progress.nextReviewDate > key) return [];
    const taskKey = `interval-review:${progress.nextReviewDate}:${progress.subjectId}`;
    if (state.completions[taskKey]) return [];
    const reviewCues = state.cues.filter((cue) => cue.subjectId === progress.subjectId && cue.status !== 'stable');
    const cueIds = reviewCues.map((cue) => cue.id);
    const sameScope = reviewCues.length > 0 && reviewCues.every((cue) => cue.unit === reviewCues[0].unit && cue.subsection === reviewCues[0].subsection);
    const detail = reviewCues.length
      ? `复习 ${reviewCues.length} 条 Cue：${reviewCues.map((cue) => cue.prompt).join('；')}`
      : `复习：${progress.lastStudiedContent || progress.subjectName}`;
    return [{
      key: taskKey,
      title: `${progress.subjectName} · 间隔复习`,
      detail,
      type: 'interval-review' as const,
      date: key,
      durationMinutes: 25,
      subjectId: progress.subjectId,
      subjectName: progress.subjectName,
      ...(cueIds.length ? { cueIds, scope: { ...(sameScope ? { unit: reviewCues[0].unit, subsection: reviewCues[0].subsection } : {}), cueIds } } : {}),
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
  return [...courses.values()].map((course) => {
    const catalogSubject = matchLearningCatalogSubject(state.learningCatalog, `${course.name} ${course.shortName ?? ''}`);
    return {
      key: `weekly-review:${key}:${course.id}`,
      title: `本周集中复习 · ${course.shortName ?? course.name}`,
      detail: reviewDetail('weekly'),
      type: 'weekly-review' as const,
      date: key,
      durationMinutes: 35,
      subjectId: catalogSubject?.id ?? course.id,
      subjectName: catalogSubject?.name ?? course.name,
    };
  });
}

function cueReviewTasks(state: ScheduleControlState, date: Date): LearningTask[] {
  const key = dateKey(date);
  const due = state.cues.filter((cue) => cue.nextReviewDate && cue.nextReviewDate <= key);
  const groups = new Map<string, StudyCue[]>();
  for (const cue of due) {
    groups.set(cue.subjectId, [...(groups.get(cue.subjectId) ?? []), cue]);
  }
  return [...groups.values()].map((cues) => {
    const cueIds = cues.map((cue) => cue.id);
    const sameScope = cues.every((cue) => cue.unit === cues[0].unit && cue.subsection === cues[0].subsection);
    return {
      key: `cue-review:${key}:${cues[0].subjectId}`,
      title: `${cues[0].subjectName} · ${cues.length} 条 Cue`,
      detail: `复习：${cues.map((cue) => cue.prompt).join('；')}`,
      type: 'cue-review' as const,
      date: key,
      durationMinutes: Math.min(60, Math.max(15, cues.length * 5)),
      subjectId: cues[0].subjectId,
      subjectName: cues[0].subjectName,
      cueIds,
      scope: { ...(sameScope ? { unit: cues[0].unit, subsection: cues[0].subsection } : {}), cueIds },
      guide: { tab: 'learn' as const, subTab: 'review' },
      overdue: cues.some((cue) => Boolean(cue.nextReviewDate && cue.nextReviewDate < key)),
    };
  });
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

function taskAction(type: LearningTaskType): string {
  return ['course-review', 'interval-review', 'weekly-review', 'cue-review', 'unit-review', 'cumulative-review'].includes(type) ? 'review' : type;
}

function mergeSameSubjectActions(tasks: LearningTask[], cues: StudyCue[]): LearningTask[] {
  const primaryTypePriority: Partial<Record<LearningTaskType, number>> = {
    'course-review': 3,
    'interval-review': 2,
    'weekly-review': 1,
  };
  const groups = new Map<string, LearningTask[]>();
  for (const task of tasks) {
    const subject = task.subjectId ?? task.subjectName?.trim().toLocaleLowerCase();
    const signature = subject
      ? `${taskAction(task.type)}:${subject}`
      : JSON.stringify([task.type, task.title, task.scope?.unit ?? '', task.scope?.subsection ?? '']);
    groups.set(signature, [...(groups.get(signature) ?? []), task]);
  }
  return [...groups.values()].map((group) => {
    if (group.length === 1) return group[0];
    const primary = group.toSorted((left, right) => (
      (right.cueIds?.length ?? 0) - (left.cueIds?.length ?? 0)
      || (primaryTypePriority[right.type] ?? 0) - (primaryTypePriority[left.type] ?? 0)
    ))[0];
    const cueIds = [...new Set(group.flatMap((task) => task.cueIds ?? task.scope?.cueIds ?? []))];
    const mergedCues = cueIds.flatMap((cueId) => { const cue = cues.find((item) => item.id === cueId); return cue ? [cue] : []; });
    const sameUnit = mergedCues.length > 0 && mergedCues.every((cue) => cue.unit === mergedCues[0].unit);
    const sameSubsection = sameUnit && mergedCues.every((cue) => cue.subsection === mergedCues[0].subsection);
    const review = taskAction(primary.type) === 'review';
    const subjectName = primary.subjectName ?? group.find((task) => task.subjectName)?.subjectName;
    const mergedTasks = group.flatMap((task) => task.mergedTasks ?? [{ key: task.key, type: task.type, title: task.title, detail: task.detail }]);
    const detail = mergedCues.length
      ? `复习：${mergedCues.map((cue) => cue.prompt).join('；')}`
      : [...new Set(group.map((task) => task.detail).filter(Boolean))].join('\n');
    return {
      ...primary,
      title: review ? `联合复习 · ${subjectName ?? primary.title}${cueIds.length ? ` · ${cueIds.length} 条 Cue` : ''}` : primary.title,
      detail,
      type: review && cueIds.length ? 'cue-review' : primary.type,
      durationMinutes: cueIds.length ? Math.min(60, Math.max(15, cueIds.length * 5)) : Math.min(120, Math.max(...group.map((task) => task.durationMinutes))),
      ...(cueIds.length ? { cueIds, scope: { ...(sameUnit ? { unit: mergedCues[0].unit } : {}), ...(sameSubsection && mergedCues[0].subsection ? { subsection: mergedCues[0].subsection } : {}), cueIds } } : {}),
      mergedTaskKeys: [...new Set(group.flatMap((task) => task.mergedTaskKeys ?? [task.key]))],
      mergedTasks,
      manual: group.every((task) => task.manual),
      overdue: group.some((task) => task.overdue),
    };
  });
}

export function tasksForDate(state: ScheduleControlState, date: Date): LearningTask[] {
  const key = dateKey(date);
  const daily = courseReviewTasks(state, date);
  const automatic = [
    ...cueReviewTasks(state, date),
    ...intervalReviewTasks(state, date),
    ...daily,
    ...weeklyReviewTasks(state, date),
    ...previewTasks(state, date),
  ];
  const manual = state.manualTasks
    .filter((task) => task.date <= key && !state.completions[task.id] && !state.cancellations[task.id])
    .map((task): LearningTask => ({
      key: task.id,
      title: task.title,
      detail: task.note || (task.type === 'exam' ? '按当前考试日期安排 Diagnose、Repair、Verify 与 Simulate。' : '自定义学习任务。'),
      type: task.type,
      date: task.date,
      start: task.start,
      durationMinutes: task.durationMinutes,
      subjectId: task.subjectId,
      subjectName: task.subject,
      note: task.note,
      scope: task.scope,
      materials: task.materials,
      guide: task.guide,
      cueIds: task.scope?.cueIds,
      manual: true,
      overdue: Boolean(task.overdueSince || task.date < key),
    }));
  const available = [...manual, ...automatic].filter((task) => !state.completions[task.key] && !state.cancellations[task.key]);
  return mergeSameSubjectActions(available, state.cues)
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

export function deriveLearningStatus(cueIds: string[], assessments: CueAssessment[]): LearningStatus {
  const assessed = new Map(assessments.map((assessment) => [assessment.cueId, assessment.status]));
  if (cueIds.some((cueId) => assessed.get(cueId) === 'unclear')) return 'unclear';
  if (cueIds.length > 0 && cueIds.every((cueId) => assessed.get(cueId) === 'stable')) return 'stable';
  return 'partial';
}

/** Resolves the Cue deck for a scheduled task, preferring explicit Cue ids over its subject/unit scope. */
export function cuesForLearningTask(cues: StudyCue[], task: LearningTask): StudyCue[] {
  const explicitIds = task.cueIds?.length ? task.cueIds : task.scope?.cueIds;
  if (explicitIds?.length) {
    const order = new Map(explicitIds.map((id, index) => [id, index]));
    return cues
      .filter((cue) => order.has(cue.id))
      .toSorted((left, right) => order.get(left.id)! - order.get(right.id)!);
  }
  return cues.filter((cue) => {
    const sameSubject = task.subjectId ? cue.subjectId === task.subjectId : !task.subjectName || cue.subjectName === task.subjectName;
    return sameSubject && (!task.scope?.unit || cue.unit === task.scope.unit);
  });
}

function createSystemReport(cues: LearningRecordCue[], status: LearningStatus): LearningSystemReport {
  const stableCount = cues.filter((cue) => cue.status === 'stable').length;
  const partialCount = cues.filter((cue) => cue.status === 'partial').length;
  const unclearCount = cues.filter((cue) => cue.status === 'unclear').length;
  const linkedCount = cues.filter((cue) => cue.status === 'linked').length;
  const passRate = cues.length ? Math.round((stableCount / cues.length) * 100) : 0;
  const nextActions = status === 'unclear'
    ? ['按 StudyGuide 重开 Notes / Textbook，只修复红色 Cue 的最小缺口。', '关闭资料重新检索；需要应用时补一道代表题。']
    : status === 'partial'
      ? ['定位黄色或未验证 Cue 缺失的关键词、限定条件或中间因果。', '完成 minimal repair，并在次日闭卷重测。']
      : ['保持间隔复习，不机械重做已经稳定的 Cue。', '到期时先闭卷检索，再用证据核对。'];
  const summary = cues.length
    ? `本次关联 ${cues.length} 条 Cue：√ ${stableCount}、△ ${partialCount}、○ ${unclearCount}、未验证 ${linkedCount}；完全通过率 ${passRate}%。`
    : '本次没有关联 Cue，因此缺少可验证的主动检索证据，状态记为部分通过。';
  return { cueTotal: cues.length, stableCount, partialCount, unclearCount, linkedCount, passRate, summary, nextActions };
}

/** Records what actually happened when any learning task is finished. */
export function completeLearningSession(
  state: ScheduleControlState,
  task: LearningTask,
  details: ReviewDetails,
  evidence: LearningSessionEvidence,
  completedAt: Date,
): ScheduleControlState {
  const status = deriveLearningStatus(evidence.cueIds, evidence.assessments);
  const suppliedContent = details.studiedContent.trim().slice(0, 1000);
  const note = details.note.trim().slice(0, 1000);

  const reviewedDate = dateKey(completedAt);
  const scheduledNewCues = evidence.newCues.map((cue) => ({
    ...cue,
    nextReviewDate: cue.nextReviewDate ?? addCalendarDays(reviewedDate, 1),
  }));
  const existingCueIds = new Set(state.cues.map((cue) => cue.id));
  for (const cue of scheduledNewCues) {
    if (existingCueIds.has(cue.id)) throw new Error('新建 Cue 的 id 不能重复。');
    existingCueIds.add(cue.id);
  }
  const cueIds = [...new Set(evidence.cueIds)];
  if (cueIds.some((cueId) => !existingCueIds.has(cueId))) throw new Error('学习记录包含不存在的 Cue。');
  const assessmentIds = new Set(evidence.assessments.map((assessment) => assessment.cueId));
  if ([...assessmentIds].some((cueId) => !cueIds.includes(cueId))) throw new Error('只有本次关联的 Cue 才能评分。');
  const assessmentByCueId = new Map(evidence.assessments.map((assessment) => [assessment.cueId, assessment.status]));
  const allCues = [...state.cues, ...scheduledNewCues];
  const recordCues = cueIds.map((cueId): LearningRecordCue => {
    const cue = allCues.find((item) => item.id === cueId)!;
    return {
      cueId,
      subjectName: cue.subjectName,
      unit: cue.unit,
      subsection: cue.subsection,
      prompt: cue.prompt,
      ...(cue.subtitle ? { subtitle: cue.subtitle } : {}),
      type: cue.type,
      ...(cue.display ? { display: cue.display } : {}),
      ...(cue.choices ? { choices: [...cue.choices], correctChoice: cue.correctChoice } : {}),
      markingPoints: [...cue.markingPoints],
      status: assessmentByCueId.get(cueId) ?? 'linked',
    };
  });
  const scopeLabel = [evidence.subjectName?.trim() || task.subjectName, evidence.scope?.unit || task.scope?.unit, evidence.scope?.subsection || task.scope?.subsection].filter(Boolean).join(' → ');
  const materialLabel = evidence.materials.filter((material) => material.progress?.trim()).map((material) => `${material.code} 到 ${material.progress?.trim()}`).join('、');
  const cueLabel = recordCues.slice(0, 6).map((cue) => cue.prompt).join('；');
  const studiedContent = suppliedContent || [scopeLabel || task.title, materialLabel ? `资料：${materialLabel}` : '', cueLabel ? `完成 Cue：${cueLabel}` : ''].filter(Boolean).join('；').slice(0, 1000);
  const weakCueLabels = recordCues.filter((cue) => cue.status !== 'stable').map((cue) => `${[cue.unit, cue.subsection].filter(Boolean).join(' / ')}：${cue.prompt}`);
  const issue = status === 'stable'
    ? ''
    : (details.issue.trim().slice(0, 1000) || (weakCueLabels.length ? `需要继续处理：${weakCueLabels.join('；')}`.slice(0, 1000) : '本次没有提供全部通过的 Cue 证据。'));

  const withCues = { ...state, cues: [...state.cues, ...scheduledNewCues] };
  const subjectReviewTypes = new Set<LearningTaskType>(['course-review', 'interval-review', 'weekly-review']);
  const isSubjectReview = Boolean(task.subjectId && task.subjectName && (
    subjectReviewTypes.has(task.type) || task.mergedTasks?.some((item) => subjectReviewTypes.has(item.type))
  ));
  let updated = isSubjectReview
    ? completeReview(withCues, task, status, { studiedContent, issue, note }, completedAt)
    : {
        ...withCues,
        completions: status === 'unclear' ? withCues.completions : {
          ...withCues.completions,
          [task.key]: { completedAt: completedAt.toISOString(), status, studiedContent, issue, note },
        },
      };

  const completion = updated.completions[task.key];
  if (completion) {
    const detailedCompletion = {
      ...completion,
      ...(evidence.subjectName?.trim() ? { subjectName: evidence.subjectName.trim().slice(0, 80) } : {}),
      ...(evidence.scope ? { scope: evidence.scope } : {}),
      materials: evidence.materials,
      cueIds,
    };
    updated = {
      ...updated,
      completions: {
        ...updated.completions,
        ...Object.fromEntries((task.mergedTaskKeys ?? [task.key]).map((key) => [key, detailedCompletion])),
      },
    };
  }
  updated = evidence.assessments.length
    ? completeCueReviews(updated, evidence.assessments, completedAt, task.key)
    : updated;
  const completedAtIso = completedAt.toISOString();
  const record: LearningRecord = {
    id: `${task.key}:${completedAtIso}`,
    taskKey: task.key,
    taskTitle: task.title,
    taskType: task.type,
    completedAt: completedAtIso,
    status,
    studiedContent,
    issue,
    note,
    ...(evidence.subjectName?.trim() || task.subjectName ? { subjectName: evidence.subjectName?.trim().slice(0, 80) || task.subjectName } : {}),
    ...(evidence.scope ? { scope: evidence.scope } : task.scope ? { scope: task.scope } : {}),
    materials: evidence.materials,
    cues: recordCues,
    ...(task.guide ? { guide: task.guide } : {}),
    systemReport: createSystemReport(recordCues, status),
  };
  return { ...updated, learningRecords: [record, ...updated.learningRecords] };
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
