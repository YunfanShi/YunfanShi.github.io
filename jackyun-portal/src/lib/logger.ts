'use client';

/**
 * ========================================
 *  JackYun Portal — 全量客户端日志系统
 * ========================================
 *
 * 捕获范围：
 *  - 所有 console.log / warn / error / info / debug
 *  - 所有 fetch / XMLHttpRequest 网络请求
 *  - 所有未捕获异常 (window.onerror)
 *  - 所有未处理的 Promise 拒绝 (unhandledrejection)
 *
 * 存储策略：
 *  - 内存队列 (最多 2000 条，供实时查看)
 *  - localStorage (最多 500 条，持久化)
 *
 * 使用方式：
 *   import logger from '@/lib/logger'
 *   logger.info('Tag', 'message', { data })
 *   logger.getLogs() → LogEntry[]
 *   logger.getLogsByLevel('error') → LogEntry[]
 *   logger.clearLogs()
 */

// ──────────────────────────────────────────────
//  Types
// ──────────────────────────────────────────────

type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug' | 'fetch' | 'xhr' | 'unhandled';

interface LogEntry {
  id: number;
  tag: string;
  level: LogLevel;
  message: string;
  data?: unknown;
  timestamp: string;
  stack?: string;
  /** 网络请求专用字段 */
  url?: string;
  method?: string;
  status?: number;
  duration?: number;
}

// ──────────────────────────────────────────────
//  Storage
// ──────────────────────────────────────────────

const MAX_MEMORY = 2000;
const MAX_LOCAL = 500;
const LOCAL_KEY = 'jackyun_client_logs';

let _idCounter = 0;
const _logs: LogEntry[] = [];

function getTimestamp(): string {
  return new Date().toISOString();
}

function storeEntry(entry: LogEntry) {
  _logs.push(entry);
  if (_logs.length > MAX_MEMORY) {
    _logs.splice(0, _logs.length - MAX_MEMORY);
  }
  // 异步持久化到 localStorage
  try {
    const existing = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]') as LogEntry[];
    existing.push(entry);
    if (existing.length > MAX_LOCAL) {
      existing.splice(0, existing.length - MAX_LOCAL);
    }
    localStorage.setItem(LOCAL_KEY, JSON.stringify(existing));
  } catch { /* localStorage 不可用 */ }
}

// 可变引用，支持后续包装订阅
let pushEntry = storeEntry;

function makeEntry(
  level: LogLevel,
  tag: string,
  message: string,
  data?: unknown,
  extra?: Partial<LogEntry>,
): LogEntry {
  const entry: LogEntry = {
    id: ++_idCounter,
    tag,
    level,
    message,
    data,
    timestamp: getTimestamp(),
    stack: level === 'error' ? new Error().stack?.split('\n').slice(2).join('\n') : undefined,
    ...extra,
  };
  return entry;
}

// ──────────────────────────────────────────────
//  Public API
// ──────────────────────────────────────────────

const logger = {
  info: (tag: string, message: string, data?: unknown) => {
    const entry = makeEntry('info', tag, message, data);
    pushEntry(entry);
    // 同步输出到控制台（使用原始引用，避免死循环）
    _origConsole?.log(`[${tag}] ${message}`, data ?? '');
  },
  warn: (tag: string, message: string, data?: unknown) => {
    const entry = makeEntry('warn', tag, message, data);
    pushEntry(entry);
    _origConsole?.warn(`[${tag}] ${message}`, data ?? '');
  },
  error: (tag: string, message: string, data?: unknown) => {
    const entry = makeEntry('error', tag, message, data);
    pushEntry(entry);
    _origConsole?.error(`[${tag}] ${message}`, data ?? '');
  },
  debug: (tag: string, message: string, data?: unknown) => {
    const entry = makeEntry('debug', tag, message, data);
    pushEntry(entry);
    _origConsole?.log(`[${tag}] ${message}`, data ?? '');
  },

  /** 获取所有日志 */
  getLogs: (): LogEntry[] => [..._logs],

  /** 按级别过滤 */
  getLogsByLevel: (level: LogLevel): LogEntry[] => _logs.filter(e => e.level === level),

  /** 按标签过滤 */
  getLogsByTag: (tag: string): LogEntry[] => _logs.filter(e => e.tag === tag),

  /** 仅错误日志 */
  getErrors: (): LogEntry[] => _logs.filter(e => e.level === 'error' || e.level === 'unhandled'),

  /** 清空日志 */
  clearLogs: () => {
    _logs.length = 0;
    try { localStorage.removeItem(LOCAL_KEY); } catch { }
  },

  /** 导出日志为 JSON */
  exportLogs: (): string => JSON.stringify(_logs, null, 2),

  /** 订阅日志变化 */
  subscribe: (cb: (entry: LogEntry) => void): (() => void) => {
    const id = ++_idCounter;
    (_subscribeMap as Map<number, (entry: LogEntry) => void>).set(id, cb);
    return () => { (_subscribeMap as Map<number, (entry: LogEntry) => void>).delete(id); };
  },
};

// 订阅者映射 (在 logger 外定义避免循环引用)
const _subscribeMap = new Map<number, (entry: LogEntry) => void>();

// 重载 pushEntry 以支持订阅
const _originalPushEntry = pushEntry;
pushEntry = (entry: LogEntry) => {
  _originalPushEntry(entry);
  _subscribeMap.forEach(cb => {
    try { cb(entry); } catch { /* 避免订阅者崩溃影响日志系统 */ }
  });
};

// ──────────────────────────────────────────────
//  初始化拦截器 (仅在浏览器端执行一次)
// ──────────────────────────────────────────────

// 保存原始 console 引用（在拦截前，供 logger 方法使用，避免死循环）
let _origConsole: {
  log: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
} | null = null;

if (typeof window !== 'undefined' && !(window as unknown as Record<string, unknown>)['__jackyun_logger_booted__']) {
  (window as unknown as Record<string, unknown>)['__jackyun_logger_booted__'] = true;

  // ── 1. 拦截 console ──
  _origConsole = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
  };

  const consoleOverride = (level: LogLevel, origFn: (...args: unknown[]) => void) => {
    return (...args: unknown[]) => {
      // 先调用原始 console 确保浏览器控制台有输出
      origFn(...args);

      // 解析参数
      let tag = 'Console';
      const parts: string[] = [];
      let data: unknown = undefined;

      // 智能解析：如果第一个参数是字符串且匹配 [Tag] 格式，作为 tag
      if (args.length > 0 && typeof args[0] === 'string') {
        const match = (args[0] as string).match(/^\[([^\]]+)\]/);
        if (match) {
          tag = match[1];
          parts.push((args[0] as string).slice(match[0].length).trim());
        } else {
          parts.push(args[0] as string);
        }
      }

      // 其余参数
      for (let i = 1; i < args.length; i++) {
        const arg = args[i];
        if (arg instanceof Error) {
          parts.push(arg.message);
          data = { name: arg.name, stack: arg.stack };
        } else if (typeof arg === 'object') {
          data = arg;
        } else {
          parts.push(String(arg));
        }
      }

      const message = parts.filter(Boolean).join(' ') || '(empty log)';
      const entry = makeEntry(level, tag, message, data);
      pushEntry(entry);
    };
  };

  console.log = consoleOverride('log', _origConsole.log);
  console.info = consoleOverride('info', _origConsole.info);
  console.warn = consoleOverride('warn', _origConsole.warn);
  console.error = consoleOverride('error', _origConsole.error);
  console.debug = consoleOverride('debug', _origConsole.debug);

  // ── 2. 拦截 fetch ──
  const _origFetch = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const startTime = performance.now();
    const url = typeof args[0] === 'string' ? args[0] : args[0] instanceof URL ? args[0].href : String(args[0]);
    const method = (args[1]?.method || 'GET').toUpperCase();

    // 请求日志
    const reqEntry = makeEntry('fetch', 'Network', `${method} ${url}`, {
      headers: args[1]?.headers ? Object.fromEntries(
        args[1].headers instanceof Headers ? args[1].headers.entries() : Object.entries(args[1].headers)
      ) : undefined,
      body: args[1]?.body ? (typeof args[1].body === 'string' ? args[1].body.slice(0, 500) : '[ReadableStream]') : undefined,
    }, { url, method });
    pushEntry(reqEntry);

    try {
      const response = await _origFetch(...args);
      const duration = Math.round(performance.now() - startTime);

      const resEntry = makeEntry(
        response.ok ? 'info' : 'warn',
        'Network',
        `${method} ${url} → ${response.status} ${response.statusText} (${duration}ms)`,
        { status: response.status, ok: response.ok, duration },
        { url, method, status: response.status, duration },
      );
      pushEntry(resEntry);

      return response;
    } catch (err) {
      const duration = Math.round(performance.now() - startTime);
      const errMsg = err instanceof Error ? err.message : String(err);
      const errEntry = makeEntry('error', 'Network', `${method} ${url} → FAILED: ${errMsg} (${duration}ms)`,
        { error: errMsg, duration },
        { url, method, duration },
      );
      pushEntry(errEntry);
      throw err;
    }
  };

  // ── 3. 拦截 XMLHttpRequest ──
  const _origXHROpen = XMLHttpRequest.prototype.open;
  const _origXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null,
  ) {
    (this as XMLHttpRequest & { __url?: string; __method?: string; __startTime?: number }).__url = String(url);
    (this as XMLHttpRequest & { __method?: string }).__method = method.toUpperCase();
    return _origXHROpen.call(this, method, url, async ?? true, username, password);
  };

  XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
    const _this = this as XMLHttpRequest & { __url?: string; __method?: string; __startTime?: number };
    const url = _this.__url || 'unknown';
    const method = _this.__method || 'GET';
    _this.__startTime = performance.now();

    this.addEventListener('loadend', () => {
      const duration = Math.round(performance.now() - (_this.__startTime || 0));
      const level: LogLevel = _this.status >= 400 ? 'warn' : 'info';

      const entry = makeEntry(
        _this.status >= 400 ? 'error' : 'info',
        'XHR',
        `${method} ${url} → ${_this.status} ${_this.statusText} (${duration}ms)`,
        {
          status: _this.status,
          statusText: _this.statusText,
          responseType: _this.responseType,
          duration,
        },
        { url, method, status: _this.status, duration },
      );
      pushEntry(entry);
    });

    this.addEventListener('error', () => {
      const duration = Math.round(performance.now() - (_this.__startTime || 0));
      const entry = makeEntry('error', 'XHR', `${method} ${url} → NETWORK ERROR (${duration}ms)`,
        undefined, { url, method, duration },
      );
      pushEntry(entry);
    });

    return _origXHRSend.call(this, body);
  };

  // ── 4. 全局未捕获异常 ──
  window.addEventListener('error', (e) => {
    const message = e.error?.message || e.message || 'Unknown error';
    const entry = makeEntry('unhandled', 'GlobalError', message, {
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
      stack: e.error?.stack,
    });
    pushEntry(entry);
    // 不阻止默认行为
  });

  // ── 5. 未处理的 Promise 拒绝 ──
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    const entry = makeEntry('unhandled', 'UnhandledRejection', message, {
      stack: reason instanceof Error ? reason.stack : undefined,
    });
    pushEntry(entry);
  });

  // ── 6. 启动日志 ──
  const bootEntry = makeEntry('info', 'Logger', '🔍 全量客户端日志系统已启动', {
    url: window.location.href,
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
  });
  pushEntry(bootEntry);
}

export default logger;
export type { LogEntry, LogLevel };