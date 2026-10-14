import type { ScheduleControlState } from './schedule-control.ts';
import { newPracticeExclusion, practiceWeek } from './timed-practice.ts';

type Evidence = { subjectKey: string; subject: string; unit: string; subsection: string; attempted: number; onTime: number; overtime: number; failed: number; blocked: number; minutes: number; bottleneck: string };
export interface PracticeBreakdown extends Omit<Evidence, 'bottleneck'> { key: string; onTimeRate: number; overtimeRate: number; bottlenecks: string[] }

/** Expand timer questions once, using the summary record only for manual evidence. */
export function practiceBreakdowns(state: ScheduleControlState, date: string, scope: 'all' | 'new' = 'all') {
  const { start, end } = practiceWeek(date);
  const sessions = new Map((state.practiceSessions ?? []).filter(session => session.finished).map(session => [session.id, session]));
  const rows: Evidence[] = [];
  for (const record of state.timedPracticeRecords ?? []) {
    if (record.date < start || record.date > end || (scope === 'new' && newPracticeExclusion(record))) continue;
    const course = state.timetable?.courses.find(course => record.courseId ? course.id === record.courseId : course.name === record.subject);
    const subject = course?.name ?? record.subject;
    const common = { subjectKey: course?.id || record.courseId ? `course:${course?.id ?? record.courseId}` : `subject:${record.subject}`, subject };
    const session = record.id.startsWith('timer-') ? sessions.get(record.id.slice(6)) : undefined;
    if (session) {
      for (const question of session.questions) {
        if (question.elapsedMs <= 0 || question.result === 'pending') continue;
        const slow = question.elapsedMs > question.limitSeconds * 1000;
        const failed = question.result !== 'correct';
        rows.push({ ...common, unit: question.unit?.trim() || session.unit?.trim() || '未填写单元', subsection: question.subsection?.trim() || session.subsection?.trim() || '未填写小节', attempted: 1, onTime: Number(!failed && !slow), overtime: Number(slow), failed: Number(failed), blocked: Number(failed && question.blocked), minutes: question.elapsedMs / 60000, bottleneck: question.cause.trim() });
      }
    } else rows.push({ ...common, unit: record.unit?.trim() || '未填写单元', subsection: record.subsection?.trim() || '未填写小节', attempted: record.onTime + record.overtime + record.failed, onTime: record.onTime, overtime: record.overtime + (record.failedOvertime ?? 0), failed: record.failed, blocked: record.blocked, minutes: record.minutes, bottleneck: record.bottleneck });
  }
  function aggregate(dimension: 'subject' | 'unit' | 'subsection'): PracticeBreakdown[] {
    const groups = new Map<string, { row: PracticeBreakdown; causes: Map<string, number> }>();
    for (const item of rows) {
      const key = JSON.stringify([item.subjectKey, ...(dimension !== 'subject' ? [item.unit] : []), ...(dimension === 'subsection' ? [item.subsection] : [])]);
      let group = groups.get(key);
      if (!group) {
        group = { row: { key, subjectKey: item.subjectKey, subject: item.subject, unit: dimension === 'subject' ? '' : item.unit, subsection: dimension === 'subsection' ? item.subsection : '', attempted: 0, onTime: 0, overtime: 0, failed: 0, blocked: 0, minutes: 0, onTimeRate: 0, overtimeRate: 0, bottlenecks: [] }, causes: new Map() };
        groups.set(key, group);
      }
      for (const field of ['attempted','onTime','overtime','failed','blocked','minutes'] as const) group.row[field] += item[field];
      if (item.bottleneck) group.causes.set(item.bottleneck, (group.causes.get(item.bottleneck) ?? 0) + 1);
    }
    return [...groups.values()].map(({ row, causes }) => ({ ...row, onTimeRate: Math.round(row.onTime / row.attempted * 100), overtimeRate: Math.round(row.overtime / row.attempted * 100), bottlenecks: [...causes].sort((a,b) => b[1] - a[1]).slice(0,2).map(([name]) => name) })).sort((a,b) => b.attempted - a.attempted || a.subject.localeCompare(b.subject));
  }
  return { subjects: aggregate('subject'), units: aggregate('unit'), subsections: aggregate('subsection') };
}
