'use client';

/** Severity levels for logging */
type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  tag: string;
  level: LogLevel;
  message: string;
  data?: unknown;
  timestamp: string;
  stack?: string;
}

/** In-memory log store (last 200 entries) for admin diagnostics */
const MAX_STORED = 200;
const _logs: LogEntry[] = [];

function getTimestamp(): string {
  return new Date().toISOString();
}

function store(entry: LogEntry) {
  _logs.push(entry);
  if (_logs.length > MAX_STORED) {
    _logs.splice(0, _logs.length - MAX_STORED);
  }
}

function format(entry: LogEntry): string {
  const prefix = `[${entry.timestamp}] [${entry.tag}] [${entry.level.toUpperCase()}]`;
  let msg = `${prefix} ${entry.message}`;
  if (entry.data !== undefined) {
    try {
      const extra = typeof entry.data === 'string' ? entry.data : JSON.stringify(entry.data, null, 2);
      msg += `\n  Data: ${extra}`;
    } catch {
      msg += `\n  Data: [unserializable]`;
    }
  }
  if (entry.stack) {
    msg += `\n  Stack: ${entry.stack}`;
  }
  return msg;
}

function log(level: LogLevel, tag: string, message: string, data?: unknown) {
  const entry: LogEntry = {
    tag,
    level,
    message,
    data,
    timestamp: getTimestamp(),
    stack: level === 'error' ? new Error().stack?.split('\n').slice(2).join('\n') : undefined,
  };

  store(entry);
  const formatted = format(entry);

  switch (level) {
    case 'error':
      console.error(formatted);
      break;
    case 'warn':
      console.warn(formatted);
      break;
    case 'debug':
      console.debug(formatted);
      break;
    default:
      console.log(formatted);
  }
}

const logger = {
  info: (tag: string, message: string, data?: unknown) => log('info', tag, message, data),
  warn: (tag: string, message: string, data?: unknown) => log('warn', tag, message, data),
  error: (tag: string, message: string, data?: unknown) => log('error', tag, message, data),
  debug: (tag: string, message: string, data?: unknown) => log('debug', tag, message, data),

  /** Get all stored logs (for admin diagnostics) */
  getLogs: (): LogEntry[] => [..._logs],

  /** Clear stored logs */
  clearLogs: () => { _logs.length = 0; },

  /** Get logs filtered by tag */
  getLogsByTag: (tag: string): LogEntry[] => _logs.filter(e => e.tag === tag),

  /** Get recent error logs */
  getErrors: (): LogEntry[] => _logs.filter(e => e.level === 'error'),
};

export default logger;
export type { LogEntry, LogLevel };