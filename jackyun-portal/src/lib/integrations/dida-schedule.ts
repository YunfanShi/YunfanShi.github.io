export type DidaChecklistItem = { id: string; title: string; completed: boolean; sortOrder?: number };
export type DidaScheduleTask = {
  id: string; projectId: string; title: string; content: string;
  parentId?: string; childIds?: string[]; items?: DidaChecklistItem[]; sortOrder?: number;
  kind?: string; priority?: number; tags?: string[];
  date?: string; start?: string; completed: boolean; completedDate?: string; version?: string;
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
    return [{ id: row.id, projectId, title: row.title.slice(0, 1000), content: typeof row.content === 'string' && row.content ? row.content.slice(0, 5000) : typeof row.desc === 'string' ? row.desc.slice(0, 5000) : '',
      parentId: typeof row.parentId === 'string' && row.parentId !== row.id ? row.parentId : undefined,
      childIds: Array.isArray(row.childIds) ? row.childIds.filter((id): id is string => typeof id === 'string' && id !== row.id).slice(0, 1000) : [],
      items: Array.isArray(row.items) ? row.items.flatMap((item: unknown) => {
        if (!item || typeof item !== 'object') return [];
        const check = item as Record<string, unknown>;
        return typeof check.id === 'string' && typeof check.title === 'string' && check.status !== -1 ? [{ id: check.id, title: check.title.slice(0, 1000), completed: check.status === 1 || check.status === 2, sortOrder: typeof check.sortOrder === 'number' ? check.sortOrder : undefined }] : [];
      }).toSorted((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)) : [],
      kind: typeof row.kind === 'string' ? row.kind : undefined, priority: typeof row.priority === 'number' ? row.priority : 0,
      tags: Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 30) : [],
      sortOrder: typeof row.sortOrder === 'number' ? row.sortOrder : undefined, date, start, completed: row.status === 2, completedDate }];
  });
}

export const didaTaskKey = (task: Pick<DidaScheduleTask, 'projectId' | 'id'>) => task.projectId + ':' + task.id;

/** Resolve only within the same list. Cycles and missing parents cannot hide tasks. */
export function didaTaskContexts(tasks: DidaScheduleTask[]) {
  const byKey = new Map(tasks.map(task => [didaTaskKey(task), task]));
  const parentKeys = new Map<string, string>();
  for (const task of tasks) for (const id of task.childIds ?? []) {
    const child = byKey.get(task.projectId + ':' + id);
    if (child && !child.parentId && !parentKeys.has(didaTaskKey(child))) parentKeys.set(didaTaskKey(child), didaTaskKey(task));
  }
  for (const task of tasks) if (task.parentId && byKey.has(task.projectId + ':' + task.parentId)) parentKeys.set(didaTaskKey(task), task.projectId + ':' + task.parentId);
  return tasks.map(task => {
    const ancestors: DidaScheduleTask[] = []; const seen = new Set([didaTaskKey(task)]);
    let parent = parentKeys.get(didaTaskKey(task));
    while (parent && !seen.has(parent)) {
      seen.add(parent); const found = byKey.get(parent); if (!found) break;
      ancestors.push(found); parent = parentKeys.get(parent);
    }
    const dated = [task, ...ancestors].find(item => item.date);
    return { task: { ...task, date: dated?.date, start: task.date ? task.start : dated?.start }, ancestors: ancestors.reverse() };
  });
}

export function didaTasksForDate(tasks: DidaScheduleTask[], date: string) {
  return didaTaskContexts(tasks).map(item => item.task)
    .filter(task => !task.completed && task.kind !== 'NOTE' && (!task.date || task.date <= date))
    .toSorted((a, b) => (a.date ?? date).localeCompare(b.date ?? date) || (a.start ?? '99:99').localeCompare(b.start ?? '99:99') || (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.title.localeCompare(b.title));
}

/** Include unfinished ancestors as context, even when only a child is due today. */
export function didaTaskTreeForDate(tasks: DidaScheduleTask[], date: string) {
  const eligible = didaTasksForDate(tasks, date);
  const actionable = new Set(eligible.map(didaTaskKey));
  const contexts = didaTaskContexts(tasks); const contextByKey = new Map(contexts.map(item => [didaTaskKey(item.task), item]));
  const visible = new Map<string, DidaScheduleTask>();
  for (const task of eligible) {
    for (const parent of contextByKey.get(didaTaskKey(task))?.ancestors ?? []) if (!parent.completed) visible.set(didaTaskKey(parent), parent);
    visible.set(didaTaskKey(task), task);
  }
  const children = new Map<string, DidaScheduleTask[]>(); const roots: DidaScheduleTask[] = [];
  for (const task of visible.values()) {
    const parent = contextByKey.get(didaTaskKey(task))?.ancestors.filter(item => visible.has(didaTaskKey(item))).at(-1);
    if (!parent) roots.push(task); else { const key = didaTaskKey(parent); children.set(key, [...(children.get(key) ?? []), task]); }
  }
  const result: { task: DidaScheduleTask; depth: number; contextOnly: boolean }[] = []; const seen = new Set<string>();
  const visit = (task: DidaScheduleTask, depth: number) => {
    const key = didaTaskKey(task); if (seen.has(key)) return; seen.add(key);
    result.push({ task, depth, contextOnly: !actionable.has(key) });
    for (const child of (children.get(key) ?? []).toSorted((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))) visit(child, depth + 1);
  };
  for (const task of roots) visit(task, 0);
  for (const task of visible.values()) visit(task, 0);
  return result;
}
