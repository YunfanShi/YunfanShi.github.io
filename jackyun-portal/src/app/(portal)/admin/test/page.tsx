'use client';

import { useState, useEffect, useCallback } from 'react';
import MarkdownRenderer from '@/components/modules/markdown-renderer';

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

function StatusBadge({ status }: { status: 'idle' | 'running' | 'pass' | 'fail' }) {
  const map = {
    idle: { bg: '', text: '未测试', icon: 'radio_button_unchecked', c: 'var(--muted-foreground)' },
    running: { bg: '#4285F420', text: '测试中...', icon: 'autorenew', c: '#4285F4' },
    pass: { bg: '#34A85320', text: '通过', icon: 'check_circle', c: '#34A853' },
    fail: { bg: '#EA433520', text: '失败', icon: 'cancel', c: '#EA4335' },
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
>
> 回到第一层

## 🔗 链接
[Google](https://www.google.com) · [GitHub](https://github.com)

## 😀 Emoji 短码
:smile: :rocket: :star: :fire: :heart: :tada: :100: :+1:

## ─── 分割线 ───

---

## 📐 更多 LaTeX 示例
行内：$\\alpha + \\beta = \\gamma$ · $\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$

矩阵：
$$
\\begin{pmatrix}
a & b \\\\
c & d
\\end{pmatrix}
$$`;

/* ────────── System Health Test ────────── */
async function checkApiHealth(): Promise<{ ok: boolean; duration: string; detail: string }> {
  const start = Date.now();
  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    return { ok: res.ok, duration: `${duration}s`, detail: `${res.status} ${res.statusText}` };
  } catch (err) {
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    return { ok: false, duration: `${duration}s`, detail: err instanceof Error ? err.message : String(err) };
  }
}

async function checkSupabase(): Promise<{ ok: boolean; duration: string; detail: string }> {
  const start = Date.now();
  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, duration: `${duration}s`, detail: data?.supabase ? '✅ Connected' : res.statusText };
  } catch (err) {
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    return { ok: false, duration: `${duration}s`, detail: err instanceof Error ? err.message : String(err) };
  }
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
  const [sysResults, setSysResults] = useState<Record<string, { ok: boolean; duration: string; detail: string }>>({});

  // ── Run All ──
  const [allRunning, setAllRunning] = useState(false);

  // ── AI Test ──
  async function runAiTest() {
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
  }

  // ── System Tests ──
  async function runSystemTests() {
    setSysRunning(true);
    setSysResults({});

    const [apiHealth, supabase] = await Promise.all([
      checkApiHealth(),
      checkSupabase(),
    ]);

    setSysResults({
      'API Health (/api/health)': apiHealth,
      'Supabase Connection': supabase,
    });
    setSysRunning(false);
  }

  // ── Run All Tests ──
  const runAllTests = useCallback(async () => {
    setAllRunning(true);
    setAiLoading(true);
    setAiResult(null);
    setSysRunning(true);
    setSysResults({});

    // AI Test (inline to control loading state)
    const aiTestPromise = (async () => {
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

    // System Test
    const sysTestPromise = (async () => {
      const [apiHealth, supabase] = await Promise.all([checkApiHealth(), checkSupabase()]);
      setSysResults({
        'API Health (/api/health)': apiHealth,
        'Supabase Connection': supabase,
      });
      setSysRunning(false);
    })();

    await Promise.all([aiTestPromise, sysTestPromise]);
    setAllRunning(false);
  }, [baseUrl, apiKey, model, systemPrompt, userPrompt, testMode]);

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">🧪 全方位测试</h1>
          <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">
            AI 接口 · Markdown 渲染 · 系统健康 一键检测
          </p>
        </div>
        <button
          onClick={runAllTests}
          disabled={allRunning}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#4285F4] text-sm font-medium text-white hover:bg-[#3367d6] disabled:opacity-60 disabled:cursor-not-allowed transition-colors shrink-0"
        >
          {allRunning ? (
            <><span className="material-icons-round text-base animate-spin">autorenew</span>全量测试中...</>
          ) : (
            <><span className="material-icons-round text-base">play_arrow</span>一键测试全部</>
          )}
        </button>
      </div>

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
          <StatusBadge status={sysRunning ? 'running' : Object.keys(sysResults).length > 0 ? (Object.values(sysResults).every(r => r.ok) ? 'pass' : 'fail') : 'idle'} />
        </div>
        <p className="text-sm text-[var(--muted-foreground)]">
          检查 API 端点、Supabase 数据库连接等关键服务状态
        </p>
        <button onClick={runSystemTests} disabled={sysRunning} className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-[#4285F4] text-sm font-medium text-white hover:bg-[#3367d6] disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
          {sysRunning ? <><span className="material-icons-round text-sm animate-spin">autorenew</span>检测中...</> : '🔍 运行系统检查'}
        </button>

        {Object.keys(sysResults).length > 0 && (
          <div className="space-y-2">
            {Object.entries(sysResults).map(([name, r]) => (
              <div key={name} className={`flex items-center justify-between gap-4 p-3 rounded-lg border ${r.ok ? 'border-[#34A853]/20 bg-[#34A853]/5' : 'border-[#EA4335]/20 bg-[#EA4335]/5'}`}>
                <div className="flex items-center gap-2">
                  <span className={`material-icons-round text-sm ${r.ok ? 'text-[#34A853]' : 'text-[#EA4335]'}`}>
                    {r.ok ? 'check_circle' : 'cancel'}
                  </span>
                  <span className="text-sm text-[var(--foreground)]">{name}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-[var(--muted-foreground)]">
                  <span>⏱ {r.duration}</span>
                  <span className="font-mono">{r.detail}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}