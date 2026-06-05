'use client';

import { useState } from 'react';

export default function TestAiPage() {
  const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com/v1');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('deepseek-v4-flash');
  const [systemPrompt, setSystemPrompt] = useState('You are a helpful assistant.');
  const [userPrompt, setUserPrompt] = useState('Say "Hello! API connection is working!" and introduce yourself briefly.');
  const [testMode, setTestMode] = useState<'direct' | 'proxy'>('direct');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    mode: string; success: boolean; duration: string; statusCode: number; statusText: string;
    responseBody: string; aiContent: string; error: string;
  } | null>(null);

  async function runTest() {
    setLoading(true);
    setResult(null);
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
      setResult({ mode: testMode === 'direct' ? 'Direct API Call' : 'Proxy (/api/llm-proxy)', success: res.ok, duration: `${duration}s`, statusCode: res.status, statusText: res.statusText, responseBody: raw, aiContent, error });
    } catch (err) {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      setResult({ mode: testMode === 'direct' ? 'Direct API Call' : 'Proxy (/api/llm-proxy)', success: false, duration: `${duration}s`, statusCode: 0, statusText: 'Network Error', responseBody: '', aiContent: '', error: err instanceof Error ? err.message : String(err) });
    }
    setLoading(false);
  }

  const loadFromLocalStorage = () => {
    setApiKey(localStorage.getItem('ds_key') || '');
    setBaseUrl(localStorage.getItem('ai_custom_endpoint') || 'https://api.deepseek.com/v1');
    setModel(localStorage.getItem('ai_model') || 'deepseek-v4-flash');
  };

  const inputClass = 'w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4]';
  const sectionTitle = 'text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]';

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">🧪 AI API Test</h1>
        <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">全方位测试 LLM API 连接 — 查看完整请求和响应内容</p>
      </div>

      <section className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className={sectionTitle}>API 配置</h2>
          <button onClick={loadFromLocalStorage} className="text-xs text-[#4285F4] hover:text-[#3367d6] underline">从 localStorage 加载</button>
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--foreground)] mb-1">Base URL</label>
          <input type="url" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://api.deepseek.com/v1" className={inputClass} />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--foreground)] mb-1">API Key</label>
          <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-..." className={`${inputClass} font-mono`} />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--foreground)] mb-1">Model</label>
          <input type="text" value={model} onChange={e => setModel(e.target.value)} placeholder="deepseek-v4-flash" className={inputClass} />
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
          <label className="block text-sm font-medium text-[var(--foreground)] mb-2">Test Mode</label>
          <div className="flex gap-2">
            <button onClick={() => setTestMode('direct')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${testMode === 'direct' ? 'bg-[#4285F4] text-white' : 'border border-[var(--card-border)] text-[var(--foreground)] hover:bg-[#4285F4]/5'}`}>🔴 Direct API Call</button>
            <button onClick={() => setTestMode('proxy')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${testMode === 'proxy' ? 'bg-[#34A853] text-white' : 'border border-[var(--card-border)] text-[var(--foreground)] hover:bg-[#34A853]/5'}`}>🔵 Proxy (via /api/llm-proxy)</button>
          </div>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">{testMode === 'direct' ? '直接调用 API — 测试网络/密钥是否正常' : '通过代理调用 — 测试后端 proxy 是否工作'}</p>
        </div>
        <button onClick={runTest} disabled={loading} className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-[#4285F4] text-sm font-medium text-white hover:bg-[#3367d6] disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
          {loading ? <><span className="material-icons-round text-sm animate-spin">autorenew</span>Testing...</> : '🚀 Run Test'}
        </button>
      </section>

      {result && (
        <section className={`rounded-[12px] border p-5 space-y-4 ${result.success ? 'border-[#34A853]/30 bg-[#34A853]/5' : 'border-[#EA4335]/30 bg-[#EA4335]/5'}`}>
          <h2 className={sectionTitle}>Test Results</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg border border-[var(--card-border)] bg-[var(--background)] p-3 text-center">
              <p className="text-xs text-[var(--muted-foreground)] mb-1">Status</p>
              <p className={`text-lg font-bold ${result.success ? 'text-[#34A853]' : 'text-[#EA4335]'}`}>{result.success ? '✅ OK' : '❌ FAIL'}</p>
            </div>
            <div className="rounded-lg border border-[var(--card-border)] bg-[var(--background)] p-3 text-center">
              <p className="text-xs text-[var(--muted-foreground)] mb-1">Mode</p>
              <p className="text-sm font-semibold text-[var(--foreground)]">{result.mode}</p>
            </div>
            <div className="rounded-lg border border-[var(--card-border)] bg-[var(--background)] p-3 text-center">
              <p className="text-xs text-[var(--muted-foreground)] mb-1">Duration</p>
              <p className="text-sm font-semibold text-[var(--foreground)]">⏱ {result.duration}</p>
            </div>
            <div className="rounded-lg border border-[var(--card-border)] bg-[var(--background)] p-3 text-center">
              <p className="text-xs text-[var(--muted-foreground)] mb-1">HTTP Code</p>
              <p className={`text-sm font-semibold font-mono ${result.success ? 'text-[#34A853]' : 'text-[#EA4335]'}`}>{result.statusCode} {result.statusText}</p>
            </div>
          </div>
          {result.aiContent && (
            <div>
              <p className="text-xs font-medium text-[var(--muted-foreground)] mb-2 flex items-center gap-1">
                <span className="material-icons-round text-sm">smart_toy</span>AI Response Content:
              </p>
              <pre className="p-4 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-sm text-[var(--foreground)] overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">{result.aiContent}</pre>
            </div>
          )}
          {result.error && (
            <div>
              <p className="text-xs font-medium text-[#EA4335] mb-2 flex items-center gap-1">
                <span className="material-icons-round text-sm">error</span>Error:
              </p>
              <pre className="p-4 rounded-lg bg-[#EA4335]/5 border border-[#EA4335]/20 text-sm text-[#EA4335] overflow-x-auto whitespace-pre-wrap break-all leading-relaxed max-h-[200px] overflow-y-auto">{result.error}</pre>
            </div>
          )}
          {result.responseBody && (
            <details className="text-sm">
              <summary className="cursor-pointer text-[var(--muted-foreground)] hover:text-[var(--foreground)] font-medium">
                🔍 Full Raw JSON Response ({result.responseBody.length} chars)
              </summary>
              <pre className="mt-2 p-4 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-xs text-[var(--foreground)] overflow-x-auto whitespace-pre-wrap break-all font-mono leading-relaxed max-h-[500px] overflow-y-auto">
                {result.responseBody.length > 10000 ? result.responseBody.slice(0, 10000) + '\n\n... (truncated)' : result.responseBody}
              </pre>
            </details>
          )}
        </section>
      )}
    </div>
  );
}