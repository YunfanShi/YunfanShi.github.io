export const DIAGNOSTIC_EVENT = 'jackyun:diagnostic';
export type DiagnosticContext = { requestId?: string; feature?: string };
export type DiagnosticEvent = { level: 'info' | 'warn' | 'error'; tag: string; message: string; data?: unknown };
/** Browser-local diagnostics; never sends content to a server. */
export function emitDiagnostic(level: DiagnosticEvent['level'], tag: string, message: string, data?: unknown): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<DiagnosticEvent>(DIAGNOSTIC_EVENT, { detail: { level, tag, message, data } }));
}
export function errorDetails(error: unknown): Record<string, unknown> {
  return error instanceof Error ? { name: error.name, message: error.message, stack: error.stack, ...(error.cause ? { cause: errorDetails(error.cause) } : {}) } : { message: String(error) };
}
/** Exclude credentials and private reasoning while retaining the visible reply. */
export function redactDiagnostic(value: unknown, depth = 0): unknown {
  if (depth > 10) return '[depth limit]';
  if (value instanceof Error) return redactDiagnostic(errorDetails(value), depth + 1);
  if (Array.isArray(value)) return value.map((item) => redactDiagnostic(item, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /authorization|cookie|token|secret|password|api[-_]?key|reasoning|analysis/i.test(key) && !/^(total|prompt|completion|input|output)_tokens$/.test(key) ? '[redacted]' : redactDiagnostic(item, depth + 1)]));
  if (typeof value === 'string') return value.replace(/<think>[\s\S]*?<\/think>/gi, '[private reasoning omitted]').replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [redacted]');
  return value;
}
export function logAiReply(section: string, value: unknown, context: DiagnosticContext = {}): void {
  const text = typeof value === 'string' ? String(redactDiagnostic(value)) : JSON.stringify(redactDiagnostic(value));
  const limited = text.slice(0, 100_000);
  const parts = Math.max(1, Math.ceil(limited.length / 6000));
  for (let index = 0; index < parts; index += 1) emitDiagnostic('info', 'AIReply', `${section} · ${index + 1}/${parts}`, { ...context, section, part: index + 1, parts, characters: text.length, truncated: text.length > limited.length, content: limited.slice(index * 6000, (index + 1) * 6000) });
}

export function formatDiagnosticLog(entry: { timestamp: string; tag: string; level: string; message: string; data?: unknown; stack?: string; url?: string; method?: string; status?: number; duration?: number }): string {
  let text = `[${entry.timestamp}] [${entry.tag}] [${entry.level.toUpperCase()}] ${entry.message}`;
  if (entry.url) text += ` | ${entry.method ?? ''} ${entry.url}`;
  if (entry.status !== undefined) text += ` | status=${entry.status}`;
  if (entry.duration !== undefined) text += ` | ${entry.duration}ms`;
  if (entry.data !== undefined) text += `\nData: ${JSON.stringify(entry.data, null, 2)}`;
  if (entry.stack) text += `\nStack: ${entry.stack}`;
  return text;
}
