'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import logger, { type LogEntry, type LogLevel } from '@/lib/logger';

const LEVEL_COLORS: Record<LogLevel, string> = {
  log: '#9CA3AF',
  info: '#60A5FA',
  warn: '#FBBF24',
  error: '#EF4444',
  debug: '#A78BFA',
  fetch: '#34D399',
  xhr: '#34D399',
  unhandled: '#DC2626',
};

const LEVEL_LABELS: Record<LogLevel, string> = {
  log: 'LOG',
  info: 'INFO',
  warn: 'WARN',
  error: 'ERR',
  debug: 'DBG',
  fetch: 'FETCH',
  xhr: 'XHR',
  unhandled: 'PANIC',
};

export default function LoggerViewer() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<LogLevel | 'all'>('all');
  const [tagFilter, setTagFilter] = useState('');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [paused, setPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const allLevels: LogLevel[] = ['error', 'unhandled', 'warn', 'info', 'debug', 'log', 'fetch', 'xhr'];
  const counts = allLevels.reduce((acc, lvl) => {
    acc[lvl] = logs.filter(l => l.level === lvl).length;
    return acc;
  }, {} as Record<string, number>);

  // Subscribe to new log entries
  useEffect(() => {
    const unsub = logger.subscribe((entry) => {
      if (paused) return;
      setLogs(prev => [...prev, entry]);
    });

    // Load existing logs on mount
    setLogs(logger.getLogs());

    return unsub;
  }, [paused]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  // Filtered and sorted logs
  const filtered = logs
    .filter(l => {
      if (filter !== 'all' && l.level !== filter) return false;
      if (tagFilter && !l.tag.toLowerCase().includes(tagFilter.toLowerCase())) return false;
      return true;
    });

  const toggleExpand = useCallback((id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleClear = () => {
    logger.clearLogs();
    setLogs([]);
    setExpanded(new Set());
  };

  const handleExport = () => {
    const json = logger.exportLogs();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jackyun-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = (entry: LogEntry) => {
    const text = `[${entry.timestamp}] [${entry.tag}] [${entry.level.toUpperCase()}] ${entry.message}` +
      (entry.data ? `\nData: ${JSON.stringify(entry.data, null, 2)}` : '') +
      (entry.stack ? `\nStack: ${entry.stack}` : '') +
      (entry.url ? `\nURL: ${entry.url}` : '') +
      (entry.status ? `\nStatus: ${entry.status}` : '') +
      (entry.duration ? `\nDuration: ${entry.duration}ms` : '');
    navigator.clipboard.writeText(text).catch(() => {});
  };

  return (
    <div className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--card-border)]">
        <div className="flex items-center gap-2">
          <span className="material-icons-round text-lg text-[var(--muted-foreground)]">terminal</span>
          <span className="text-sm font-semibold text-[var(--foreground)]">客户端日志</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--background)] text-[var(--muted-foreground)]">
            {filtered.length}/{logs.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPaused(!paused)}
            className={`p-1.5 rounded text-xs ${paused ? 'bg-[#FBBF24]/20 text-[#FBBF24]' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`}
            title={paused ? '恢复' : '暂停'}
          >
            <span className="material-icons-round text-sm">{paused ? 'play_arrow' : 'pause'}</span>
          </button>
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`p-1.5 rounded text-xs ${autoScroll ? 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]' : 'bg-[#4285F4]/20 text-[#4285F4]'}`}
            title={autoScroll ? '取消自动滚动' : '自动滚动'}
          >
            <span className="material-icons-round text-sm">vertical_align_bottom</span>
          </button>
          <button
            onClick={handleExport}
            className="p-1.5 rounded text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            title="导出日志"
          >
            <span className="material-icons-round text-sm">download</span>
          </button>
          <button
            onClick={handleClear}
            className="p-1.5 rounded text-xs text-[var(--muted-foreground)] hover:text-[#EA4335]"
            title="清空日志"
          >
            <span className="material-icons-round text-sm">delete</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--card-border)] overflow-x-auto">
        <button
          onClick={() => setFilter('all')}
          className={`px-2 py-0.5 rounded text-xs whitespace-nowrap transition-colors ${
            filter === 'all' ? 'bg-[#4285F4] text-white' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--background)]'
          }`}
        >
          全部 ({logs.length})
        </button>
        {allLevels.map(lvl => (
          <button
            key={lvl}
            onClick={() => setFilter(lvl)}
            className={`px-2 py-0.5 rounded text-xs whitespace-nowrap transition-colors ${
              filter === lvl ? 'text-white' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--background)]'
            }`}
            style={filter === lvl ? { backgroundColor: LEVEL_COLORS[lvl] } : {}}
          >
            {LEVEL_LABELS[lvl]} ({counts[lvl] || 0})
          </button>
        ))}
        <div className="flex-1" />
        <input
          type="text"
          value={tagFilter}
          onChange={e => setTagFilter(e.target.value)}
          placeholder="过滤标签..."
          className="w-24 px-2 py-0.5 rounded text-xs bg-[var(--background)] border border-[var(--card-border)] text-[var(--foreground)] outline-none focus:border-[#4285F4]"
        />
      </div>

      {/* Log List */}
      <div
        ref={listRef}
        className="max-h-[500px] overflow-y-auto bg-[var(--background)]"
        style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace" }}
      >
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-[var(--muted-foreground)]">
            <span className="material-icons-round text-3xl mb-2">inbox</span>
            <p className="text-xs">暂无日志</p>
          </div>
        ) : (
          filtered.map(entry => {
            const isExpanded = expanded.has(entry.id);
            const isError = entry.level === 'error' || entry.level === 'unhandled';
            return (
              <div
                key={entry.id}
                className={`border-b border-[var(--card-border)] ${isError ? 'bg-[#EF4444]/5' : 'hover:bg-[#4285F4]/5'}`}
              >
                <div
                  className="flex items-start gap-2 px-3 py-1.5 cursor-pointer"
                  onClick={() => toggleExpand(entry.id)}
                >
                  {/* Level indicator */}
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                    style={{ backgroundColor: LEVEL_COLORS[entry.level] }}
                  />
                  {/* Timestamp */}
                  <span className="text-[10px] text-[var(--muted-foreground)] whitespace-nowrap mt-0.5 flex-shrink-0">
                    {entry.timestamp.slice(11, 23)}
                  </span>
                  {/* Tag */}
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--card-border)] text-[var(--muted-foreground)] whitespace-nowrap flex-shrink-0">
                    {entry.tag}
                  </span>
                  {/* Level badge */}
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded text-white whitespace-nowrap flex-shrink-0"
                    style={{ backgroundColor: LEVEL_COLORS[entry.level] }}
                  >
                    {LEVEL_LABELS[entry.level]}
                  </span>
                  {/* Duration for network */}
                  {entry.duration != null && (
                    <span className="text-[10px] text-[var(--muted-foreground)] whitespace-nowrap flex-shrink-0">
                      {entry.duration}ms
                    </span>
                  )}
                  {/* Message */}
                  <span className={`text-xs flex-1 truncate ${isError ? 'text-[#EF4444]' : 'text-[var(--foreground)]'}`}>
                    {entry.message}
                  </span>
                  {/* Copy button */}
                  <button
                    onClick={e => { e.stopPropagation(); handleCopy(entry); }}
                    className="p-0.5 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] flex-shrink-0"
                    title="复制"
                  >
                    <span className="material-icons-round text-xs">content_copy</span>
                  </button>
                  {/* Expand icon */}
                  <span className="material-icons-round text-xs text-[var(--muted-foreground)] flex-shrink-0 mt-0.5">
                    {isExpanded ? 'expand_less' : 'expand_more'}
                  </span>
                </div>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div className="px-3 pb-2 pl-12 space-y-2">
                    {/* URL for network requests */}
                    {entry.url && (
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-[var(--muted-foreground)]">URL:</span>
                        <code className="block text-[10px] text-[var(--foreground)] bg-[var(--card)] px-2 py-1 rounded break-all">
                          {entry.method} {entry.url}
                        </code>
                      </div>
                    )}

                    {/* Response status for network */}
                    {entry.status != null && (
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-[var(--muted-foreground)]">Status:</span>
                        <span className={`text-xs ${entry.status >= 400 ? 'text-[#EF4444]' : 'text-[#34A853]'}`}>
                          {entry.status} {entry.message}
                        </span>
                      </div>
                    )}

                    {/* Data payload */}
                    {entry.data != null && (
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-[var(--muted-foreground)]">Data:</span>
                        <pre className="text-[10px] text-[var(--foreground)] bg-[var(--card)] px-2 py-1 rounded overflow-x-auto max-h-[200px] overflow-y-auto whitespace-pre-wrap break-all">
                          {typeof entry.data === 'string' ? entry.data : JSON.stringify(entry.data, null, 2)}
                        </pre>
                      </div>
                    )}

                    {/* Stack trace */}
                    {entry.stack && (
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-[var(--muted-foreground)]">Stack:</span>
                        <pre className="text-[10px] text-[#EA4335] bg-[var(--card)] px-2 py-1 rounded overflow-x-auto max-h-[150px] overflow-y-auto whitespace-pre-wrap break-all">
                          {entry.stack}
                        </pre>
                      </div>
                    )}

                    {/* Full timestamp */}
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-[var(--muted-foreground)]">Timestamp:</span>
                      <span className="text-[10px] text-[var(--muted-foreground)]">{entry.timestamp}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Footer stats */}
      <div className="flex items-center gap-3 px-4 py-2 border-t border-[var(--card-border)] text-[10px] text-[var(--muted-foreground)]">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[#EF4444] inline-block" />
          错误 {counts['error'] || 0}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[#FBBF24] inline-block" />
          警告 {counts['warn'] || 0}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[#34D399] inline-block" />
          网络 {((counts['fetch'] || 0) + (counts['xhr'] || 0))}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[#DC2626] inline-block" />
          未捕获 {counts['unhandled'] || 0}
        </span>
        <div className="flex-1" />
        <span>共 {logs.length} 条</span>
      </div>
    </div>
  );
}