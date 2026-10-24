import 'server-only';
import { SEIUE_API_BASE, type SeiueCalendarEvent, type SeiueLesson, type SeiueTodo, normalizeSeiueCalendar, normalizeSeiueLessons, normalizeSeiueTodos, parseSeiueDateTime } from './seiue';

export type SeiueCredentials = { token: string; reflectionId: string; schoolId: string; role: 'student'; schoolSite: string; expiresAt: string };
export class SeiueApiError extends Error {
  readonly status: number;
  constructor(message: string, status = 502) { super(message); this.status = status; }
}
function safeId(value: string) { return /^[A-Za-z0-9_-]{1,200}$/.test(value); }
function record(value: unknown): Record<string, unknown> | null { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function monday(date: Date) { const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())); day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7)); return day; }
function plusDays(date: Date, days: number) { const value = new Date(date); value.setUTCDate(value.getUTCDate() + days); return value; }
function ymd(date: Date) { return date.toISOString().slice(0, 10); }
function queryDate(date: Date) { return `${ymd(date)} ${date.toISOString().slice(11, 19)}`; }

async function getJson(credentials: SeiueCredentials, path: string): Promise<{ body: unknown; headers: Headers }> {
  if (!path.startsWith('/') || path.startsWith('//')) throw new SeiueApiError('无效的 SEIUE 接口路径。', 400);
  const resource = path.includes('/todos?') ? '待办' : path.startsWith('/scms/schcal/') || path.startsWith('/chalk/system/semesters?') ? '校历' : '课程';
  let response: Response;
  try {
    response = await fetch(`${SEIUE_API_BASE}${path}`, { method: 'GET', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12_000), headers: { Authorization: `Bearer ${credentials.token}`, 'X-Reflection-Id': credentials.reflectionId, 'X-Role': credentials.role, 'X-School-Id': credentials.schoolId, Accept: 'application/json' } });
  } catch { throw new SeiueApiError(`SEIUE ${resource} 请求超时或暂时不可用，请保留现有数据后重试。`, 502); }
  if (!response.ok) {
    if (response.status === 401) throw new SeiueApiError('SEIUE Token 已失效，请重新粘贴 Token。', 401);
    if (response.status === 403) throw new SeiueApiError(`SEIUE ${resource}接口拒绝访问，请检查学生角色、学校和账号权限。`, 403);
    throw new SeiueApiError(`SEIUE ${resource}接口暂时无法读取（${response.status}）。`, 502);
  }
  try { return { body: await response.json(), headers: response.headers }; }
  catch { throw new SeiueApiError(`SEIUE ${resource}接口返回了无法识别的数据格式。`, 502); }
}
function arr(body: unknown, resource: string): unknown[] {
  if (Array.isArray(body)) return body;
  if (body && typeof body === 'object') {
    const value = body as Record<string, unknown>;
    if (Array.isArray(value.data)) return value.data;
    if (value.data && typeof value.data === 'object' && Array.isArray((value.data as Record<string, unknown>).data)) return (value.data as Record<string, unknown>).data as unknown[];
  }
  throw new SeiueApiError(`SEIUE ${resource}列表格式无法识别。`);
}
export function pageCount(headers: Headers, body: unknown): number {
  const meta = body && typeof body === 'object' ? (body as Record<string, unknown>).meta as Record<string, unknown> | undefined : undefined;
  const raw = headers.get('X-Pagination-Last-Page') ?? headers.get('X-Pagination-Page-Count') ?? (meta?.last_page === undefined ? null : String(meta.last_page));
  if (raw === null) return 1;
  const count = Number(raw);
  if (!Number.isInteger(count) || count < 1 || count > 100) throw new SeiueApiError('SEIUE 分页信息无效，保留上次成功的数据。');
  return count;
}

export function weekRange(dateValue: string): { start: string; end: string } {
  const parsed = parseSeiueDateTime(`${dateValue} 12:00:00`);
  if (!parsed) throw new SeiueApiError('所选周日期无效。', 400);
  const startDate = monday(new Date(parsed.epoch));
  return { start: queryDate(startDate), end: `${ymd(plusDays(startDate, 6))} 23:59:59` };
}

export async function verifySeiueToken(credentials: SeiueCredentials, now = new Date()): Promise<void> {
  if (credentials.role !== 'student' || !safeId(credentials.reflectionId) || !safeId(credentials.schoolId) || credentials.token.length < 16 || credentials.token.length > 4000) throw new SeiueApiError('请提供学生角色、有效的 Reflection ID、School ID 和 Token。', 400);
  const range = weekRange(ymd(now));
  const path = `/chalk/calendar/personals/${encodeURIComponent(credentials.reflectionId)}/events?start_time=${encodeURIComponent(range.start)}&end_time=${encodeURIComponent(range.end)}&expand=address,initiators`;
  await getJson(credentials, path);
}

export async function fetchSeiueSnapshot(credentials: SeiueCredentials, weekDate: string): Promise<{ lessons: SeiueLesson[]; todos: SeiueTodo[]; calendar: SeiueCalendarEvent[] }> {
  if (Date.parse(credentials.expiresAt) <= Date.now()) throw new SeiueApiError('SEIUE Token 已过期，请重新粘贴 Token。', 401);
  const range = weekRange(weekDate);
  const personalPath = `/chalk/calendar/personals/${encodeURIComponent(credentials.reflectionId)}/events?start_time=${encodeURIComponent(range.start)}&end_time=${encodeURIComponent(range.end)}&expand=address,initiators`;
  const [events, firstTodos, semesters] = await Promise.all([
    getJson(credentials, personalPath),
    getJson(credentials, `/chalk/todo/executors/${encodeURIComponent(credentials.reflectionId)}/todos?expand=related&paginated=1&per_page=100&page=1&sort=-created_at&status_in=pending,completed,ignored,invalid`),
    getJson(credentials, '/chalk/system/semesters?expand=is_current&paginated=0&sort=-start_at'),
  ]);
  const currentSemester = arr(semesters.body, '校历').map(record).find((semester) => semester?.is_current === true);
  const semesterId = currentSemester && (typeof currentSemester.id === 'string' || typeof currentSemester.id === 'number') ? String(currentSemester.id) : '';
  if (!semesterId || !safeId(semesterId)) throw new SeiueApiError('SEIUE 未返回当前学期信息，无法读取校历；请保留现有数据后重试。');
  const calendar = await getJson(credentials, `/scms/schcal/events?semester_id=${encodeURIComponent(semesterId)}`);
  const todoPages = [arr(firstTodos.body, '待办')];
  const count = pageCount(firstTodos.headers, firstTodos.body);
  for (let page = 2; page <= count; page++) {
    const result = await getJson(credentials, `/chalk/todo/executors/${encodeURIComponent(credentials.reflectionId)}/todos?expand=related&paginated=1&per_page=100&page=${page}&sort=-created_at&status_in=pending,completed,ignored,invalid`);
    todoPages.push(arr(result.body, '待办'));
  }
  return { lessons: normalizeSeiueLessons(arr(events.body, '课程')), todos: normalizeSeiueTodos(todoPages), calendar: normalizeSeiueCalendar(arr(calendar.body, '校历')) };
}
