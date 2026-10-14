import type { ScheduleControlState } from './schedule-control.ts';
import { inPracticeScope, practiceWeek, originalPracticeRecord, type PracticeMetricScope } from './timed-practice.ts';
import { firstPracticeOutcome } from './practice-timer.ts';

type Evidence = { subjectKey: string; subject: string; unit: string; subsection: string; attempted: number; onTime: number; overtime: number; failed: number; blocked: number; minutes: number; bottleneck: string };
export interface PracticeBreakdown extends Omit<Evidence, 'bottleneck'> { key: string; onTimeRate: number; overtimeRate: number; bottlenecks: string[] }

/** Expand timer questions once, using the summary record only for manual evidence. */
export function practiceBreakdowns(state: ScheduleControlState, date: string, scope: PracticeMetricScope = 'all') {
  const { start, end } = practiceWeek(date);
  const sessions = new Map((state.practiceSessions ?? []).filter(session => session.finished).map(session => [session.id, session]));
  const rows: Evidence[] = [];
  const seen = new Set<string>();
  for (const stored of state.timedPracticeRecords ?? []) {
    const record = originalPracticeRecord(stored);
    if (seen.has(record.id)) continue;
    seen.add(record.id);
    if (record.date < start || record.date > end || !inPracticeScope(record,scope)) continue;
    const course = state.timetable?.courses.find(course => record.courseId ? course.id === record.courseId : course.name === record.subject);
    const subject = course?.name ?? record.subject;
    const common = { subjectKey: course?.id || record.courseId ? `course:${course?.id ?? record.courseId}` : `subject:${record.subject}`, subject };
    const session = record.id.startsWith('timer-') ? sessions.get(record.id.slice(6)) : undefined;
    if (session) {
      for (const original of session.questions) {
        const question = {...original,...firstPracticeOutcome(original)};
        if (question.elapsedMs <= 0 || question.result === 'pending') continue;
        const slow = question.elapsedMs > question.limitSeconds * 1000;
        const failed = question.result !== 'correct' || question.blocked;
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

/** All-date chronological evidence, never counting a timer summary twice. */
export function practiceWeaknessTrends(state: ScheduleControlState) {
  const groups = new Map<string, { subject:string; node:string; cause:string; entries:Array<{id:string;date:string;status:'verified'|'speed'|'repair'}> }>();
  const seen = new Set<string>();
  for (const s of state.practiceSessions ?? []) {
    if (!s.finished || !s.independent || !['B','homework'].includes(s.source)) continue;
    for (const q of s.questions) {
      const first=firstPracticeOutcome(q), id=`${s.id}:${q.id}`;
      if (seen.has(id) || first.elapsedMs<=0 || first.result==='pending') continue;
      seen.add(id);
      const node=q.node || q.subsection || q.unit || s.subsection || s.unit;
      if (!node) continue;
      const key=JSON.stringify([s.courseId || s.subject,node]);
      const row=groups.get(key) ?? {subject:s.subject,node,cause:'',entries:[]};
      if(q.cause && first.result!=='correct') row.cause=q.cause;
      row.entries.push({id,date:s.date,status:first.result!=='correct'||first.blocked?'repair':first.elapsedMs>first.limitSeconds*1000?'speed':'verified'});
      groups.set(key,row);
    }
  }
  return [...groups.entries()].map(([key,row]) => ({key,...row,entries:row.entries.sort((a,b)=>a.date.localeCompare(b.date)),repeated:row.entries.filter(e=>e.status==='repair').length>=2}));
}
