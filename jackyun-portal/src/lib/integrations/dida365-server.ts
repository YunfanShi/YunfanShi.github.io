import 'server-only';
import { DIDA365_API_BASE, type DidaProject } from './dida365';

export class DidaApiError extends Error {
  constructor(message: string, readonly status = 502) { super(message); }
}

export async function didaRequest<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${DIDA365_API_BASE}${path}`, {
    ...init,
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new DidaApiError('滴答清单令牌无效或权限不足。', 400);
    throw new DidaApiError(`滴答清单暂时无法完成请求（${response.status}）。`);
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export async function getDidaProjects(token: string): Promise<DidaProject[]> {
  const projects = await didaRequest<unknown>(token, '/project');
  if (!Array.isArray(projects)) throw new DidaApiError('滴答清单返回了无法识别的清单数据。');
  return projects.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as { id?: unknown; name?: unknown };
    return typeof row.id === 'string' && typeof row.name === 'string' ? [{ id: row.id, name: row.name }] : [];
  });
}
