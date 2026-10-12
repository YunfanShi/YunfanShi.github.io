'use client';

import { useState } from 'react';
import styles from './schedule-control.module.css';

export type ScheduleView = 'today' | 'week' | 'cue' | 'questions' | 'records' | 'memos' | 'settings';
const primary = [['today', 'today', '今日'], ['week', 'calendar_view_week', '周课表'], ['cue', 'psychology_alt', '学习']] as const;
const secondary = [['questions', '题库'], ['records', '学习记录'], ['memos', '备忘录'], ['settings', '设置']] as const;

/** Keep the three everyday destinations visible; administration stays one tap away. */
export default function ScheduleTouchNav({ view, onChange }: { view: ScheduleView; onChange: (view: ScheduleView) => void }) {
  const [open, setOpen] = useState(false);
  const secondaryActive = secondary.find(([key]) => key === view);
  const select = (next: ScheduleView) => { onChange(next); setOpen(false); };
  return <div className={styles.touchViewNav}>
    <nav aria-label="日程触控视图" className={styles.touchViewPrimary}>
      {primary.map(([key, icon, label]) => <button key={key} type="button" onClick={() => select(key)} aria-current={view === key ? 'page' : undefined}><span aria-hidden="true" className="material-icons-round">{icon}</span>{label}</button>)}
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="schedule-more-views" aria-current={secondaryActive ? 'page' : undefined}><span aria-hidden="true" className="material-icons-round">more_horiz</span>{secondaryActive?.[1] ?? '更多'}</button>
    </nav>
    {open && <nav id="schedule-more-views" className={styles.touchViewSecondary} aria-label="更多日程视图">{secondary.map(([key, label]) => <button key={key} type="button" onClick={() => select(key)} aria-current={view === key ? 'page' : undefined}>{label}</button>)}</nav>}
  </div>;
}
