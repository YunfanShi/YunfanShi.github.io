export type DidaScheduleTask = {
  id: string; projectId: string; title: string; content: string;
  date?: string; start?: string; completed: boolean; completedDate?: string;
};

/** Calendar fields follow the task's own time zone; overdue tasks remain actionable. */
export function normalizeDidaTasks(value: unknown, projectId: string): DidaScheduleTask[] {
  if (!Array.isArray(value)) throw new Error('无法识别滴答任务数据。');
  return value.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    if (typeof row.id !== 'string' || !row.id || typeof row.title !== 'string' || row.projectId !== projectId) return [];
    if (row.status === -1) return [];
    let zone = typeof row.timeZone === 'string' ? row.timeZone : 'Asia/Shanghai';
    try { new Intl.DateTimeFormat('en', { timeZone: zone }); } catch { zone = 'Asia/Shanghai'; }
    const raw = typeof row.startDate === 'string' ? row.startDate : typeof row.dueDate === 'string' ? row.dueDate : '';
    let date: string | undefined; let start: string | undefined;
    if (raw && Number.isFinite(Date.parse(raw))) {
      const instant = new Date(raw);
      const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(instant);
      const field = (type: string) => parts.find(part => part.type === type)?.value;
      date = `${field('year')}-${field('month')}-${field('day')}`;
      if (row.isAllDay !== true) start = `${field('hour')}:${field('minute')}`;
    }
    let completedDate: string | undefined;
    if (row.status === 2 && typeof row.completedTime === 'string' && Number.isFinite(Date.parse(row.completedTime))) {
      const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(row.completedTime));
      const field = (type: string) => parts.find(part => part.type === type)?.value;
      completedDate = `${field('year')}-${field('month')}-${field('day')}`;
    }
    return [{ id: row.id, projectId, title: row.title.slice(0, 1000), content: typeof row.content === 'string' ? row.content.slice(0, 5000) : '', date, start, completed: row.status === 2, completedDate }];
  });
}

export function didaTasksForDate(tasks: DidaScheduleTask[], date: string) {
  return tasks.filter(task => !task.date || task.date === date || task.completedDate === date || (!task.completed && task.date < date))
    .toSorted((a, b) => Number(a.completed) - Number(b.completed) || (a.date ?? date).localeCompare(b.date ?? date) || (a.start ?? '99:99').localeCompare(b.start ?? '99:99') || a.title.localeCompare(b.title));
}
