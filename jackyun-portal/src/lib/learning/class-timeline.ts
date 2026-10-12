import { dateKey, type CourseSession, type ScheduleCourse } from './schedule-control.ts';

export type TimelineSession = CourseSession & { course: ScheduleCourse };
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
