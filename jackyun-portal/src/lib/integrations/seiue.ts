export const SEIUE_API_BASE = 'https://api.seiue.com';
export const SEIUE_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export type SeiueAccountView = {
  id: string; provider: 'seiue'; displayName: string; status: 'active' | 'error';
  schoolSite: string; tokenExpiresAt: string; lastVerifiedAt?: string;
};
export type SeiueLesson = {
  id: string; title: string; subject: string; date: string; start: string; end: string;
  location?: string; teacher?: string; adjustment?: string; description?: string;
};
export type SeiueTodo = {
  id: string; kind: 'assignment' | 'election'; title: string; description?: string;
  deadline?: string; status: string; createdAt?: string;
};
export type SeiueCalendarEvent = { id: string; title: string; date: string; endDate?: string; description?: string };
export type SeiueSnapshot = { lessons: SeiueLesson[]; todos: SeiueTodo[]; calendar: SeiueCalendarEvent[]; syncedAt: string };

export function safeSeiueSite(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 250) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !/(^|\.)seiue\.com$/i.test(url.hostname) || url.hostname.toLowerCase() === 'api.seiue.com' || url.username || url.password || url.port) return null;
    return `${url.origin}/`;
  } catch { return null; }
}

export type SeiueHelperBundle = { token: string; reflectionId: string; schoolId: string; role: 'student'; schoolSite: string };
/** Parse the one-time bundle copied by the official JackYun SEIUE userscript. */
export function parseSeiueHelperBundle(value: unknown): SeiueHelperBundle | null {
  if (typeof value !== 'string' || value.length > 6000) return null;
  let decoded: unknown;
  try { decoded = JSON.parse(value); } catch { return null; }
  const row = record(decoded);
  if (!row || row.version !== 1 || row.role !== 'student') return null;
  const token = typeof row.token === 'string' ? row.token.trim() : '';
  const reflectionId = typeof row.reflectionId === 'string' ? row.reflectionId.trim() : '';
  const schoolId = typeof row.schoolId === 'string' ? row.schoolId.trim() : '';
  const schoolSite = safeSeiueSite(row.schoolSite);
  if (token.length < 16 || token.length > 4000 || !/^[A-Za-z0-9_-]{1,200}$/.test(reflectionId) || !/^[A-Za-z0-9_-]{1,200}$/.test(schoolId) || !schoolSite) return null;
  return { token, reflectionId, schoolId, role: 'student', schoolSite };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function text(value: unknown, limit = 1000): string { return typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, limit) : ''; }
function stableId(value: unknown, limit = 200): string {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? String(value) : '';
  return text(value, limit);
}
function datePart(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() + 1 === Number(match[2]) && date.getUTCDate() === Number(match[3]) ? value : null;
}
/** Strictly parses API's naive wall-clock timestamps as Asia/Shanghai. */
export function parseSeiueDateTime(value: unknown): { date: string; time: string; epoch: number } | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match || !datePart(`${match[1]}-${match[2]}-${match[3]}`)) return null;
  const [, y, mo, d, h, mi, s] = match;
  const hour = Number(h), minute = Number(mi), second = Number(s);
  if (hour > 23 || minute > 59 || second > 59) return null;
  const epoch = Date.UTC(Number(y), Number(mo) - 1, Number(d), hour - 8, minute, second);
  return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}`, epoch };
}
function draftText(value: unknown): string | undefined {
  const decoded = typeof value === 'string' && value.length <= 20_000 ? (() => { try { return JSON.parse(value) as unknown; } catch { return value; } })() : value;
  if (typeof decoded === 'string') return text(decoded, 5000) || undefined;
  const outer = record(decoded);
  if (!outer) return undefined;
  const root = record(outer.blocks ? outer : outer.raw);
  const blocks = root?.blocks;
  if (!Array.isArray(blocks)) return undefined;
  return blocks.map(block => text(record(block)?.text, 1000)).filter(Boolean).join('\n').slice(0, 5000) || undefined;
}

export function normalizeSeiueLessons(value: unknown): SeiueLesson[] {
  if (!Array.isArray(value)) throw new Error('SEIUE 课程数据格式异常。');
  const lessons = value.flatMap(item => {
    const row = record(item), custom = record(row?.custom);
    if (!row || row.type !== 'lesson') return [];
    const id = text(custom?.id, 200);
    const start = parseSeiueDateTime(row.start_time), end = parseSeiueDateTime(row.end_time);
    if (!id || !start || !end || start.epoch >= end.epoch) return [];
    const initiators = Array.isArray(row.initiators) ? row.initiators.map(item => text(record(item)?.name, 100)).filter(Boolean) : [];
    const subject = text(record(row.subject)?.name, 100) || text(custom?.lesson_name, 100) || text(row.subject, 100);
    return [{ id, title: text(row.title, 200) || subject || '课程', subject: subject || text(row.title, 100) || '课程', date: start.date, start: start.time, end: end.time, ...(text(row.address, 200) ? { location: text(row.address, 200) } : {}), ...(initiators.length ? { teacher: initiators.join('、').slice(0, 300) } : {}), ...(text(custom?.adjustment_status, 100) ? { adjustment: text(custom?.adjustment_status, 100) } : {}), ...(draftText(row.remark) ? { description: draftText(row.remark) } : {}) }];
  }).slice(0, 1000);
  if (value.some(item => { const row = record(item); return row?.type === 'lesson'; }) && !lessons.length) throw new Error('SEIUE 课程列表结构异常，保留上次成功的数据。');
  return lessons;
}

function parseTodo(item: unknown): SeiueTodo | null {
  const row = record(item), related = record(row?.related) ?? {};
  if (!row) return null;
  const type = text(row.type, 120), domain = text(row.domain, 120) || text(related.domain, 120) || text(related.type, 120), id = stableId(row.id, 200);
  const kind = type === 'seiue.task_submit_todo' || domain === 'task' ? 'assignment' : type === 'seiue.scms.election.student' || domain === 'election' ? 'election' : null;
  if (!id || !kind) return null;
  const deadline = kind === 'assignment' ? text(related.expired_at, 80) : text(related.end_at, 80);
  return { id, kind, title: text(row.title, 300) || (kind === 'assignment' ? '作业/资料待办' : '选课截止'), ...(draftText(related.content) ? { description: draftText(related.content) } : {}), ...(deadline ? { deadline } : {}), status: text(row.status, 40) || 'unknown', ...(text(row.created_at, 80) ? { createdAt: text(row.created_at, 80) } : {}) };
}
export function normalizeSeiueTodos(pages: unknown[]): SeiueTodo[] {
  if (!pages.length || pages.some(page => !Array.isArray(page))) throw new Error('SEIUE 待办分页数据格式异常。');
  const byId = new Map<string, SeiueTodo>();
  for (const page of pages as unknown[][]) for (const item of page) {
    const todo = parseTodo(item);
    if (todo) {
      const prior = byId.get(todo.id);
      byId.set(todo.id, { ...prior, ...todo, ...(todo.description || !prior?.description ? {} : { description: prior.description }) });
    }
  }
  return [...byId.values()].slice(0, 3000);
}

export function normalizeSeiueCalendar(value: unknown): SeiueCalendarEvent[] {
  if (!Array.isArray(value)) throw new Error('SEIUE 校历数据格式异常。');
  const events = value.flatMap(item => {
    const row = record(item); if (!row) return [];
    const start = text(row.start_date ?? row.start_at ?? row.start_time ?? row.date, 100).slice(0, 10);
    const date = datePart(start); if (!date) return [];
    const id = text(row.id, 200) || `${date}:${text(row.title, 120)}`;
    const endRaw = text(row.end_date ?? row.end_at ?? row.end_time, 100).slice(0, 10), endDate = datePart(endRaw);
    return [{ id, title: text(row.title, 200) || '校历事件', date, ...(endDate && endDate !== date ? { endDate } : {}), ...(draftText(row.description ?? row.content) ? { description: draftText(row.description ?? row.content) } : {}) }];
  }).slice(0, 1000);
  if (value.length > 0 && !events.length) throw new Error('SEIUE 校历结构异常，保留上次成功的数据。');
  return events;
}

export function seiueCourseReviewKey(lesson: Pick<SeiueLesson, 'id'>): string { return `seiue-course-review:${lesson.id}`; }
