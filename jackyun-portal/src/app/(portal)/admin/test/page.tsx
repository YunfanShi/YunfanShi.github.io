'use client';

import { useState, useEffect, useCallback } from 'react';
import MarkdownRenderer from '@/components/modules/markdown-renderer';
import logger, { LogEntry } from '@/lib/logger';

/* ────────── Utility ────────── */
function SectionHeader({ icon, title, badge }: { icon: string; title: string; badge?: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="material-icons-round text-[var(--muted-foreground)] text-lg">{icon}</span>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
        {title}
      </h2>
      {badge && (
        <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-[var(--background)] border border-[var(--card-border)] text-[var(--muted-foreground)]">
          {badge}
        </span>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: 'idle' | 'running' | 'pass' | 'fail' | 'warn' }) {
  const map = {
    idle: { bg: '', text: '未测试', icon: 'radio_button_unchecked', c: 'var(--muted-foreground)' },
    running: { bg: '#4285F420', text: '测试中...', icon: 'autorenew', c: '#4285F4' },
    pass: { bg: '#34A85320', text: '通过', icon: 'check_circle', c: '#34A853' },
    fail: { bg: '#EA433520', text: '失败', icon: 'cancel', c: '#EA4335' },
    warn: { bg: '#FBBC0520', text: '警告', icon: 'warning', c: '#FBBC05' },
  }[status];
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: map.bg, color: map.c }}
    >
      <span className={`material-icons-round text-xs ${status === 'running' ? 'animate-spin' : ''}`}>
        {map.icon}
      </span>
      {map.text}
    </span>
  );
}

type TestResult = { ok: boolean; duration: string; detail: string; warn?: boolean };

/* ────────── Markdown Sample ────────── */
const markdownSample = `# Markdown 全方位测试

## 📝 文本格式
这是**粗体**，这是*斜体*，这是~~删除线~~，这是\`行内代码\`。

## 🔢 LaTeX 数学公式
行内公式：$E = mc^2$，分数 $\\frac{1}{2}$，平方根 $\\sqrt{x^2 + y^2}$

块级公式：
$$
\\int_{0}^{\\infty} e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}
$$

## 📊 表格
| 特性 | 状态 | 说明 |
|------|------|------|
| Tables | ✅ | 表格支持 |
| Code | ✅ | 代码高亮 |
| Math | ✅ | LaTeX 支持 |

## 💻 代码块（语法高亮）
\`\`\`typescript
interface User {
  id: string;
  name: string;
  email: string;
}

async function fetchUser(id: string): Promise<User> {
  const res = await fetch(\`/api/users/\${id}\`);
  return res.json();
}
\`\`\`

\`\`\`python
def fibonacci(n: int) -> list[int]:
    a, b = 0, 1
    result = []
    for _ in range(n):
        result.append(a)
        a, b = b, a + b
    return result
\`\`\`

## 📋 列表
### 无序列表
- 项目 1
  - 嵌套项目 1.1
  - 嵌套项目 1.2
- 项目 2
- 项目 3

### 有序列表
1. 第一步骤
2. 第二步骤
   1. 子步骤 A
   2. 子步骤 B
3. 第三步骤

## ✅ 任务列表
- [x] 已完成的任务
- [x] 修复 Markdown 渲染
- [ ] 未完成的任务
- [ ] 构建管理测试页面

## 💬 引用
> 这是一段引用文本
> > 这是嵌套引用
> > 可以多层嵌套

## 🔗 链接
[Google](https://www.google.com) · [GitHub](https://github.com)

## 😀 Emoji 短码
:smile: :rocket: :star: :fire: :heart: :tada: :100: :+1:

---

## 📐 更多 LaTeX 示例
矩阵：
$$
\\begin{pmatrix}
a & b \\\\
c & d
\\end{pmatrix}
$$

求和与积分：$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$ · $\\alpha + \\beta = \\gamma$
`;

/* ────────── System Health Checks ────────── */
async function runCheck(fn: () => Promise<TestResult>): Promise<TestResult> {
  const start = Date.now();
  try {
    const r = await fn();
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    return { ...r, duration: `${duration}s` };
  } catch (err) {
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    return { ok: false, duration: `${duration}s`, detail: err instanceof Error ? err.message : String(err) };
  }
}

async function checkApiHealth(): Promise<TestResult> {
  const res = await fetch('/api/health', { cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, duration: '', detail: `${res.status}: ${JSON.stringify(data)}` };
  return { ok: true, duration: '', detail: `Node ${data.nodeVersion || '?'}, Build ${data.buildTime || '?'}` };
}

async function checkSupabaseConnection(): Promise<TestResult> {
  const res = await fetch('/api/health', { cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (data.supabase) return { ok: true, duration: '', detail: 'Connected' };
  return { ok: false, duration: '', detail: 'No supabase info in health response' };
}

async function checkEnvVariables(): Promise<TestResult> {
  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    const missing: string[] = [];
    const keys = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
    if (data.env) {
      keys.forEach(k => { if (!data.env[k]) missing.push(k); });
    }
    if (missing.length > 0) return { ok: false, duration: '', detail: `Missing: ${missing.join(', ')}` };
    return { ok: true, duration: '', detail: `${keys.length} env vars configured` };
  } catch {
    return { ok: false, duration: '', detail: 'Health endpoint returned no env info' };
  }
}

async function checkLegacySyncAPI(): Promise<TestResult> {
  const res = await fetch('/api/legacy-sync', { cache: 'no-store' });
  if (res.status === 401) return { ok: true, duration: '', detail: 'API reachable (requires auth)' };
  if (res.ok) return { ok: true, duration: '', detail: 'API working' };
  return { ok: false, duration: '', detail: `${res.status} ${res.statusText}` };
}

async function checkLlmProxyAPI(): Promise<TestResult> {
  try {
    const res = await fetch('/api/llm-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        stream: false,
      }),
    });
    // 400/401 means endpoint is reachable (need auth)
    if (res.status === 400 || res.status === 401) return { ok: true, duration: '', detail: 'API reachable (needs auth/config)' };
    if (res.ok) return { ok: true, duration: '', detail: 'API working' };
    return { ok: false, duration: '', detail: `${res.status} ${res.statusText}` };
  } catch {
    return { ok: false, duration: '', detail: 'Network error' };
  }
}

async function checkStaticAssets(): Promise<TestResult> {
  try {
    const res = await fetch('/Webicon.png', { cache: 'no-store' });
    if (res.ok) return { ok: true, duration: '', detail: `Webicon.png (${res.headers.get('content-type') || '?'})` };
    return { warn: true, ok: false, duration: '', detail: `${res.status}: Webicon.png not found` };
  } catch {
    return { ok: false, duration: '', detail: 'Network error' };
  }
}

async function checkBrowserInfo(): Promise<TestResult> {
  const info = {
    userAgent: navigator.userAgent,
    language: navigator.language,
    cookiesEnabled: navigator.cookieEnabled,
    onLine: navigator.onLine,
    screenSize: `${screen.width}x${screen.height}`,
  };
  return { ok: true, duration: '', detail: `${info.language}, ${navigator.onLine ? 'Online' : 'Offline'}` };
}

async function checkDOMLoad(): Promise<TestResult> {
  const readyState = document.readyState;
  const scripts = document.querySelectorAll('script').length;
  const styles = document.querySelectorAll('link[rel="stylesheet"]').length;
  return {
    ok: readyState === 'complete',
    duration: '',
    detail: `DOM: ${readyState}, ${scripts} scripts, ${styles} stylesheets`,
  };
}

/* ────────── Main Page ────────── */
export default function AdminTestPage() {
  const inputClass = 'w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4]';

  // ── AI Test State ──
  const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com/v1');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('deepseek-v4-flash');
  const [systemPrompt, setSystemPrompt] = useState('You are a helpful assistant.');
  const [userPrompt, setUserPrompt] = useState('Say "Hello! API connection is working!" and introduce yourself briefly.');
  const [testMode, setTestMode] = useState<'direct' | 'proxy'>('proxy');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{
    mode: string; success: boolean; duration: string; statusCode: number; statusText: string;
    responseBody: string; aiContent: string; error: string;
  } | null>(null);

  // ── System Test State ──
  const [sysRunning, setSysRunning] = useState(false);
  const [sysResults, setSysResults] = useState<Record<string, TestResult>>({});
  const [sysStartTime, setSysStartTime] = useState(0);

  // ── Logger State ──
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLogs, setShowLogs] = useState(false);

  // ── Run All ──
  const [allRunning, setAllRunning] = useState(false);

  const refreshLogs = () => {
    setLogs(logger.getLogs());
  };

  // ── AI Test ──
  async function runAiTest() {
    setAiLoading(true);
    setAiResult(null);
    const startTime = Date.now();
    logger.info('TestPage/AI', 'Starting AI test', { mode: testMode, model: model.trim() });

    const reqBody = {
      model: model.trim(),
      messages: [
        { role: 'system', content: systemPrompt.trim() || 'You are a helpful assistant.' },
        { role: 'user', content: userPrompt.trim() || 'Say "Hello!"' },
      ],
      max_tokens: 500,
      stream: false,
    };
    try {
      let res: Response;
      if (testMode === 'direct') {
        res = await fetch(`${baseUrl.trim().replace(/\/+$/, '')}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey.trim()}` },
          body: JSON.stringify(reqBody),
        });
      } else {
        const { model: _, ...restBody } = reqBody;
        res = await fetch('/api/llm-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), model: model.trim(), ...restBody }),
        });
      }
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      const raw = await res.text();
      let aiContent = '';
      let error = '';
      if (res.ok) {
        try { const data = JSON.parse(raw); aiContent = data.choices?.[0]?.message?.content || '(empty response)'; } catch { aiContent = raw; }
      } else { error = raw; }
      logger.info('TestPage/AI', 'AI test completed', { success: res.ok, duration, statusCode: res.status });
      setAiResult({ mode: testMode === 'direct' ? 'Direct API Call' : 'Proxy (/api/llm-proxy)', success: res.ok, duration: `${duration}s`, statusCode: res.status, statusText: res.statusText, responseBody: raw, aiContent, error });
    } catch (err) {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      logger.error('TestPage/AI', 'AI test network error', { error: err instanceof Error ? err.message : String(err) });
      setAiResult({ mode: testMode === 'direct' ? 'Direct API Call' : 'Proxy (/api/llm-proxy)', success: false, duration: `${duration}s`, statusCode: 0, statusText: 'Network Error', responseBody: '', aiContent: '', error: err instanceof Error ? err.message : String(err) });
    }
    setAiLoading(false);
    refreshLogs();
  }

  // ── System Tests ──
  async function runSystemTests() {
    setSysRunning(true);
    setSysResults({});
    setSysStartTime(Date.now());
    logger.info('TestPage/System', 'Starting system health checks');

    const checks: [string, () => Promise<TestResult>][] = [
      ['🌐 API Health', checkApiHealth],
      ['🗄️ Supabase Connection', checkSupabaseConnection],
      ['🔑 Environment Variables', checkEnvVariables],
      ['💾 Legacy Sync API', checkLegacySyncAPI],
      ['🤖 LLM Proxy API', checkLlmProxyAPI],
      ['🖼️ Static Assets', checkStaticAssets],
      ['🌍 Browser Info', checkBrowserInfo],
      ['📄 DOM Load State', checkDOMLoad],
    ];

    const results: Record<string, TestResult> = {};
    for (const [name, fn] of checks) {
      const result = await runCheck(fn);
      results[name] = result;
      setSysResults({ ...results });
    }

    logger.info('TestPage/System', 'System checks completed', {
      total: checks.length,
      passed: Object.values(results).filter(r => r.ok).length,
      failed: Object.values(results).filter(r => !r.ok).length,
      totalDuration: `${((Date.now() - sysStartTime) / 1000).toFixed(2)}s`,
    });
    setSysRunning(false);
    refreshLogs();
  }

  // ── Run All Tests ──
  const runAllTests = useCallback(async () => {
    setAllRunning(true);
    logger.info('TestPage', 'Starting all tests');

    const aiTestPromise = (async () => {
      setAiLoading(true);
      setAiResult(null);
      const startTime = Date.now();
      const reqBody = {
        model: model.trim(),
        messages: [
          { role: 'system', content: systemPrompt.trim() || 'You are a helpful assistant.' },
          { role: 'user', content: userPrompt.trim() || 'Say "Hello!"' },
        ],
        max_tokens: 500,
        stream: false,
      };
      try {
        let res: Response;
        if (testMode === 'direct') {
          res = await fetch(`${baseUrl.trim().replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey.trim()}` },
            body: JSON.stringify(reqBody),
          });
        } else {
          const { model: _, ...restBody } = reqBody;
          res = await fetch('/api/llm-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), model: model.trim(), ...restBody }),
          });
        }
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        const raw = await res.text();
        let aiContent = '';
        let error = '';
        if (res.ok) {
          try { const data = JSON.parse(raw); aiContent = data.choices?.[0]?.message?.content || '(empty response)'; } catch { aiContent = raw; }
        } else { error = raw; }
        setAiResult({ mode: testMode === 'direct' ? 'Direct API Call' : 'Proxy (/api/llm-proxy)', success: res.ok, duration: `${duration}s`, statusCode: res.status, statusText: res.statusText, responseBody: raw, aiContent, error });
      } catch (err) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        setAiResult({ mode: testMode === 'direct' ? 'Direct API Call' : 'Proxy (/api/llm-proxy)', success: false, duration: `${duration}s`, statusCode: 0, statusText: 'Network Error', responseBody: '', aiContent: '', error: err instanceof Error ? err.message : String(err) });
      }
      setAiLoading(false);
    })();

    const sysTestPromise = (async () => {
      setSysRunning(true);
      setSysResults({});
      setSysStartTime(Date.now());
      const checks: [string, () => Promise<TestResult>][] = [
        ['🌐 API Health', checkApiHealth],
        ['🗄️ Supabase Connection', checkSupabaseConnection],
        ['🔑 Environment Variables', checkEnvVariables],
        ['💾 Legacy Sync API', checkLegacySyncAPI],
        ['🤖 LLM Proxy API', checkLlmProxyAPI],
        ['🖼️ Static Assets', checkStaticAssets],
        ['🌍 Browser Info', checkBrowserInfo],
        ['📄 DOM Load State', checkDOMLoad],
      ];
      const results: Record<string, TestResult> = {};
      for (const [name, fn] of checks) {
        const result = await runCheck(fn);
        results[name] = result;
        setSysResults({ ...results });
      }
      setSysRunning(false);
    })();

    await Promise.all([aiTestPromise, sysTestPromise]);
    logger.info('TestPage', 'All tests completed');
    setAllRunning(false);
    refreshLogs();
  }, [baseUrl, apiKey, model, systemPrompt, userPrompt, testMode]);

  // Overall status
  const sysOkCount = Object.values(sysResults).filter(r => r.ok).length;
  const sysTotal = Object.values(sysResults).length;
  const sysOverallStatus: 'idle' | 'running' | 'pass' | 'fail' | 'warn' =
    sysRunning ? 'running' :
    sysTotal === 0 ? 'idle' :
    sysOkCount === sysTotal ? 'pass' :
    sysOkCount > 0 ? 'warn' : 'fail';

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">🧪 全方位测试</h1>
          <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">
            AI 接口 · Markdown 渲染 · 系统健康 · 日志查看
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => { setShowLogs(!showLogs); refreshLogs(); }}
            className="flex items-center gap-1 px-3 py-2.5 rounded-lg border border-[var(--card-border)] text-sm font-medium text-[var(--foreground)] hover:bg-[var(--background)] transition-colors"
          >
            <span className="material-icons-round text-base">terminal</span>
            日志 ({logs.length})
          </button>
          <button
            onClick={runAllTests}
            disabled={allRunning}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#4285F4] text-sm font-medium text-white hover:bg-[#3367d6] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {allRunning ? (
              <><span className="material-icons-round text-base animate-spin">autorenew</span>全量测试中...</>
            ) : (
              <><span className="material-icons-round text-base">play_arrow</span>一键测试全部</>
            )}
          </button>
        </div>
      </div>

      {/* ── Logger Panel ── */}
      {showLogs && (
        <section className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <SectionHeader icon="terminal" title="客户端日志" badge={`${logs.length} entries`} />
            <button
              onClick={() => { logger.clearLogs(); refreshLogs(); }}
              className="text-xs text-[#EA4335] hover:underline"
            >
              清空日志
            </button>
          </div>
          {logs.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)] text-center py-4">暂无日志，运行测试后会自动记录。</p>
          ) : (
            <div className="max-h-[400px] overflow-y-auto space-y-1">
              {logs.map((entry, i) => (
                <div
                  key={i}
                  className={`text-xs font-mono p-2 rounded border ${
                    entry.level === 'error' ? 'bg-[#EA4335]/5 border-[#EA4335]/20 text-[#EA4335]' :
                    entry.level === 'warn' ? 'bg-[#FBBC05]/5 border-[#FBBC05]/20 text-[#FBBC05]' :
                    'bg-[var(--background)] border-[var(--card-border)] text-[var(--foreground)]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="opacity-50 text-[10px]">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                    <span className="font-semibold">[{entry.tag}]</span>
                    <span>{entry.message}</span>
                  </div>
                  {entry.data !== undefined && (
                    <div className="mt-1 opacity-70 whitespace-pre-wrap break-all">
                      {typeof entry.data === 'string' ? entry.data : JSON.stringify(entry.data, null, 2)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── AI API Test ── */}
      <section className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <SectionHeader icon="smart_toy" title="AI API 连接测试" />
          <StatusBadge status={aiLoading ? 'running' : aiResult ? (aiResult.success ? 'pass' : 'fail') : 'idle'} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1">Base URL</label>
            <input type="url" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://api.deepseek.com/v1" className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1">Model</label>
            <input type="text" value={model} onChange={e => setModel(e.target.value)} placeholder="deepseek-v4-flash" className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1">API Key</label>
            <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-..." className={`${inputClass} font-mono`} />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--foreground)] mb-1">System Prompt</label>
          <textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} rows={2} className={`${inputClass} resize-none`} />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--foreground)] mb-1">User Prompt</label>
          <textarea value={userPrompt} onChange={e => setUserPrompt(e.target.value)} rows={2} className={`${inputClass} resize-none`} />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--foreground)] mb-2">测试模式</label>
          <div className="flex gap-2">
            <button onClick={() => setTestMode('direct')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${testMode === 'direct' ? 'bg-[#4285F4] text-white' : 'border border-[var(--card-border)] text-[var(--foreground)] hover:bg-[#4285F4]/5'}`}>🔴 Direct API</button>
            <button onClick={() => setTestMode('proxy')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${testMode === 'proxy' ? 'bg-[#34A853] text-white' : 'border border-[var(--card-border)] text-[var(--foreground)] hover:bg-[#34A853]/5'}`}>🔵 Proxy</button>
          </div>
        </div>
        <button onClick={runAiTest} disabled={aiLoading} className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-[#4285F4] text-sm font-medium text-white hover:bg-[#3367d6] disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
          {aiLoading ? <><span className="material-icons-round text-sm animate-spin">autorenew</span>测试中...</> : '🚀 运行 AI 测试'}
        </button>

        {aiResult && (
          <div className={`rounded-[12px] border p-4 space-y-3 ${aiResult.success ? 'border-[#34A853]/30 bg-[#34A853]/5' : 'border-[#EA4335]/30 bg-[#EA4335]/5'}`}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg border border-[var(--card-border)] bg-[var(--background)] p-3 text-center">
                <p className="text-xs text-[var(--muted-foreground)] mb-1">Status</p>
                <p className={`text-lg font-bold ${aiResult.success ? 'text-[#34A853]' : 'text-[#EA4335]'}`}>{aiResult.success ? '✅ OK' : '❌ FAIL'}</p>
              </div>
              <div className="rounded-lg border border-[var(--card-border)] bg-[var(--background)] p-3 text-center">
                <p className="text-xs text-[var(--muted-foreground)] mb-1">Mode</p>
                <p className="text-sm font-semibold text-[var(--foreground)]">{aiResult.mode}</p>
              </div>
              <div className="rounded-lg border border-[var(--card-border)] bg-[var(--background)] p-3 text-center">
                <p className="text-xs text-[var(--muted-foreground)] mb-1">Duration</p>
                <p className="text-sm font-semibold text-[var(--foreground)]">⏱ {aiResult.duration}</p>
              </div>
              <div className="rounded-lg border border-[var(--card-border)] bg-[var(--background)] p-3 text-center">
                <p className="text-xs text-[var(--muted-foreground)] mb-1">HTTP</p>
                <p className={`text-sm font-semibold font-mono ${aiResult.success ? 'text-[#34A853]' : 'text-[#EA4335]'}`}>{aiResult.statusCode} {aiResult.statusText}</p>
              </div>
            </div>
            {aiResult.aiContent && (
              <div>
                <p className="text-xs font-medium text-[var(--muted-foreground)] mb-2">🤖 AI Response:</p>
                <pre className="p-4 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-sm text-[var(--foreground)] overflow-x-auto whitespace-pre-wrap break-all leading-relaxed max-h-[300px] overflow-y-auto">{aiResult.aiContent}</pre>
              </div>
            )}
            {aiResult.error && (
              <div>
                <p className="text-xs font-medium text-[#EA4335] mb-2">❌ Error:</p>
                <pre className="p-4 rounded-lg bg-[#EA4335]/5 border border-[#EA4335]/20 text-sm text-[#EA4335] overflow-x-auto whitespace-pre-wrap break-all leading-relaxed max-h-[200px] overflow-y-auto">{aiResult.error}</pre>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Markdown Rendering Test ── */}
      <section className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-5">
        <SectionHeader icon="article" title="Markdown 渲染测试" badge="实时渲染" />
        <p className="text-sm text-[var(--muted-foreground)] mb-4">
          测试所有 Markdown 格式：表格、代码语法高亮、LaTeX 数学公式、任务列表、Emoji 等
        </p>
        <div className="rounded-[12px] border border-[var(--card-border)] bg-[var(--background)] p-5 max-h-[600px] overflow-y-auto">
          <MarkdownRenderer content={markdownSample} />
        </div>
      </section>

      {/* ── System Health ── */}
      <section className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <SectionHeader icon="monitor_heart" title="系统健康检查" />
          <StatusBadge status={sysOverallStatus} />
        </div>
        <p className="text-sm text-[var(--muted-foreground)]">
          全面检查 API 端点、数据库连接、环境变量、静态资源等关键服务状态（共 8 项）
        </p>
        <div className="flex items-center gap-2">
          <button onClick={runSystemTests} disabled={sysRunning} className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-[#4285F4] text-sm font-medium text-white hover:bg-[#3367d6] disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
            {sysRunning ? <><span className="material-icons-round text-sm animate-spin">autorenew</span>检测中...</> : '🔍 运行系统检查'}
          </button>
          {sysTotal > 0 && (
            <span className="text-xs text-[var(--muted-foreground)]">
              {sysOkCount}/{sysTotal} 通过
              {sysStartTime > 0 && !sysRunning && ` (总耗时: ${((Date.now() - sysStartTime) / 1000).toFixed(2)}s)`}
            </span>
          )}
        </div>

        {Object.keys(sysResults).length > 0 && (
          <div className="space-y-2">
            {Object.entries(sysResults).map(([name, r]) => (
              <div key={name} className={`flex items-center justify-between gap-4 p-3 rounded-lg border ${
                r.ok ? 'border-[#34A853]/20 bg-[#34A853]/5' :
                r.warn ? 'border-[#FBBC05]/20 bg-[#FBBC05]/5' :
                'border-[#EA4335]/20 bg-[#EA4335]/5'
              }`}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`material-icons-round text-sm shrink-0 ${
                    r.ok ? 'text-[#34A853]' : r.warn ? 'text-[#FBBC05]' : 'text-[#EA4335]'
                  }`}>
                    {r.ok ? 'check_circle' : r.warn ? 'warning' : 'cancel'}
                  </span>
                  <span className="text-sm text-[var(--foreground)]">{name}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-[var(--muted-foreground)] shrink-0">
                  <span className="font-mono">{r.detail}</span>
                  {r.duration && <span>⏱ {r.duration}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}