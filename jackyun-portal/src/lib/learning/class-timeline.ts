import { dateKey, type CourseSession, type ScheduleCourse } from './schedule-control.ts';

export type TimelineSession = CourseSession & { course: ScheduleCourse; source?: 'seiue' | 'merged'; adjustment?: string };
/**
 * A successful SEIUE week snapshot is authoritative for that week's lessons.
 * The local timetable remains stored in JackYun and is used until a snapshot
 * succeeds or when the SEIUE account is disconnected.
 */
export function mergeSeiueTimelineSessions(local: TimelineSession[], external: TimelineSession[], seiueIsAuthoritative = false): TimelineSession[] {
  const key = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
  const sameCourse = (left: TimelineSession, right: TimelineSession) => [key(left.course.name), key(left.course.shortName ?? '')].some(name => name && [key(right.course.name), key(right.course.shortName ?? '')].includes(name));
  const result = seiueIsAuthoritative ? [] : [...local];
  for (const session of external) {
    const exactIndex = local.findIndex(item => item.start === session.start && item.end === session.end && sameCourse(item, session));
    const exactMatch = exactIndex >= 0 ? local[exactIndex] : undefined;
    const mergedSession = exactMatch ? { ...session, source: 'merged' as const, location: session.location || exactMatch.location, teacher: session.teacher || exactMatch.teacher } : session;
    if (exactMatch && !seiueIsAuthoritative) {
      const resultIndex = result.findIndex(item => item === exactMatch);
      if (resultIndex >= 0) result[resultIndex] = mergedSession;
    } else result.push(mergedSession);
  }
  return result.sort((left, right) => left.start.localeCompare(right.start));
}
function at(date: string, time: string): number {
  if (!/^\d{2}:\d{2}$/.test(time)) return NaN;
  const [hour, minute] = time.split(':').map(Number);
  if (hour > 23 || minute > 59) return NaN;
  return new Date(`${date}T${time}:00`).getTime();
}

/** Local calendar and clock match the existing timetable's date selection. */
export function classTimeline(sessions: TimelineSession[], selectedDate: string, now: Date) {
  const lessons = sessions.map(session => ({ session, start: at(selectedDate, session.start), end: at(selectedDate, session.end) }))
    .filter(lesson => Number.isFinite(lesson.start) && lesson.end > lesson.start).sort((a, b) => a.start - b.start);
  const today = selectedDate === dateKey(now);
  const instant = now.getTime();
  const active = today ? lessons.find(lesson => lesson.start <= instant && instant < lesson.end) : undefined;
  const next = today ? lessons.find(lesson => lesson.start > instant) : undefined;
  const status = !today ? 'date' : active ? 'class' : next ? lessons.some(lesson => lesson.end <= instant) ? 'break' : 'before' : lessons.length ? 'finished' : 'empty';
  return { lessons, active, next, status,
    remaining: active ? Math.max(0, Math.ceil((active.end - instant) / 1000)) : next ? Math.max(0, Math.ceil((next.start - instant) / 1000)) : 0,
    elapsedMinutes: active ? Math.floor((instant - active.start) / 60_000) : 0,
    progress: active ? Math.min(100, Math.max(0, (instant - active.start) / (active.end - active.start) * 100)) : 0,
  };
}

export function classCountdown(seconds: number): string {
  const value = Math.max(0, Math.ceil(seconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor(value / 60) % 60;
  return `${hours ? `${hours}:` : ''}${String(hours ? minutes : Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}
