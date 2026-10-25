'use client';

import { useEffect, useState } from 'react';
import { classCountdown, classTimeline, type TimelineSession } from '@/lib/learning/class-timeline';
import { dateKey, type ScheduleMode } from '@/lib/learning/schedule-control';
import { useWorkspaceLayout } from '@/hooks/use-workspace-layout';
import type { SeiueCalendarEvent } from '@/lib/integrations/seiue';

export default function ClassTimeline({ sessions, selectedDate, mode, name, initialNow, calendarEvents = [] }: {
  sessions: TimelineSession[]; selectedDate: string; mode: ScheduleMode; name?: string; initialNow: Date; calendarEvents?: SeiueCalendarEvent[];
}) {
  const [now, setNow] = useState(initialNow);
  const layout = useWorkspaceLayout();
  useEffect(() => {
    const refresh = () => { if (!document.hidden) setNow(new Date()); };
    const timer = window.setInterval(refresh, 1000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  const visibleSessions = mode === 'holiday' ? sessions.filter(session => session.source === 'seiue' || session.source === 'merged') : sessions;
  const timeline = classTimeline(visibleSessions, selectedDate, now);
  const lesson = timeline.active ?? timeline.next;
  const today = selectedDate === dateKey(now);
  const lessonList = <ol className="mt-2 divide-y divide-[var(--card-border)]">{timeline.lessons.map((item, index) => {
    const active = timeline.active === item;
    return <li key={`${item.session.course.id}-${item.start}-${index}`} className={`flex items-start gap-3 py-3 ${active ? 'font-semibold' : ''}`}>
      <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.session.course.color }} />
      <div className="min-w-0 flex-1"><p className="break-words text-sm">{item.session.course.shortName || item.session.course.name}<span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] ${item.session.source === 'seiue' ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-200' : 'bg-black/5 text-[var(--muted-foreground)] dark:bg-white/10'}`}>{item.session.source === 'seiue' ? 'SEIUE' : item.session.source === 'merged' ? 'JackYun + SEIUE' : 'JackYun'}</span>{item.session.adjustment && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">{item.session.adjustment}</span>}{active && <span className="ml-2 text-xs text-[var(--brand)]">正在上课</span>}</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">{item.session.start} — {item.session.end} · {(item.end - item.start) / 60_000} 分钟</p>{(item.session.location || item.session.teacher) && <p className="mt-1 break-words text-xs text-[var(--muted-foreground)]">{[item.session.location, item.session.teacher].filter(Boolean).join(' · ')}</p>}</div>
    </li>;
  })}</ol>;
  return <section aria-label="课程时间线" className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm">
    <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--muted-foreground)]">Timeline</p><h2 className="mt-1 text-xl font-semibold">{today ? '今日课表' : '当日课表'}</h2></div>{name && <span className="max-w-40 truncate rounded-full bg-black/5 px-3 py-1.5 text-xs text-[var(--muted-foreground)] dark:bg-white/10">{name}</span>}</div>
    {mode === 'holiday' && <p className="mt-3 text-xs leading-5 text-[var(--muted-foreground)]">本地课程表处于假日模式；已连接的 SEIUE 课程仍按只读来源显示。</p>}
    {mode !== 'holiday' && <>
      <div className="mt-5 border-b border-[var(--card-border)] pb-5">
        <p role="status" className="text-xs font-medium text-[var(--muted-foreground)]">{{ class: '正在上课', break: '课间休息', before: '等待上课', finished: '今日课程已结束', empty: '今天没有课程', date: `${selectedDate} 课表` }[timeline.status]}</p>
        {lesson ? <>
          <h3 className="mt-2 break-words text-lg font-semibold">{lesson.session.course.name}</h3>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">{lesson.session.start} — {lesson.session.end} · 共 {(lesson.end - lesson.start) / 60_000} 分钟</p>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs text-[var(--muted-foreground)]">{timeline.active ? '距离下课' : '距离上课'}</p><span role="timer" aria-live="off" className="mt-1 block font-mono text-3xl font-semibold tabular-nums">{classCountdown(timeline.remaining)}</span></div>{timeline.active && <p className="text-xs text-[var(--muted-foreground)]">已上 {timeline.elapsedMinutes} 分钟</p>}</div>
          {timeline.active && <div role="progressbar" aria-label="当前课程进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(timeline.progress)} className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--background)]"><div className="h-full rounded-full bg-[var(--brand)]" style={{ width: `${timeline.progress}%` }} /></div>}
          {timeline.active && timeline.next && <p className="mt-3 text-xs text-[var(--muted-foreground)]">下一节 {timeline.next.session.start} · {timeline.next.session.course.shortName || timeline.next.session.course.name}</p>}
        </> : timeline.status === 'date' ? <p className="mt-2 text-xs text-[var(--muted-foreground)]">查看其他日期时不显示实时倒计时。</p> : null}
      </div>
      {timeline.lessons.length ? layout === 'phone' ? <details className="mt-2"><summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 text-sm font-medium">查看当天全部 {timeline.lessons.length} 节课<span aria-hidden="true" className="material-icons-round">expand_more</span></summary>{lessonList}</details> : lessonList : <p className="mt-4 text-sm text-[var(--muted-foreground)]">这一天没有课程。</p>}
    </>}
    {mode === 'holiday' && timeline.lessons.length > 0 && lessonList}
    {calendarEvents.length > 0 && <div className="mt-4 border-t border-[var(--card-border)] pt-4"><h3 className="text-sm font-semibold">校历</h3><ul className="mt-2 space-y-2">{calendarEvents.map(event => <li key={event.id} className="rounded-xl bg-[var(--background)] p-3"><p className="text-sm font-medium"><span className="mr-2 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-950/50 dark:text-violet-200">SEIUE</span>{event.title}</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">{event.date}{event.endDate && event.endDate !== event.date ? ` 至 ${event.endDate}` : ''}</p>{event.description && <p className="mt-1 whitespace-pre-wrap text-xs text-[var(--muted-foreground)]">{event.description}</p>}</li>)}</ul></div>}
  </section>;
}
