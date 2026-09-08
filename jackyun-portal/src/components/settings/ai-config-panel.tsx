'use client';

import { useState } from 'react';
import { callAiApi, saveAiConfig, syncAiConfigToServer } from '@/lib/ai-config';
import { explainAiError } from '@/lib/ai-error';
import type { BrowserAiProvider } from '@/lib/browser-ai';

interface AiConfigPanelProps {
  initialBaseUrl: string;
  initialApiKey: string;
  initialModel: string;
  initialProviderMode: 'cloud' | 'personal' | 'browser';
  initialBrowserProvider: BrowserAiProvider;
  initialCompanionAutomation: boolean;
  betaActive: boolean;
}

const PROVIDERS = [
  { label: 'OpenAI', url: 'https://api.openai.com/v1', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo', 'o1', 'o1-mini', 'o3-mini'] },
  { label: 'DeepSeek', url: 'https://api.deepseek.com/v1', models: ['deepseek-v4-flash', 'deepseek-v4-pro'] },
  { label: 'Anthropic (Claude)', url: 'https://api.anthropic.com/v1', models: ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-3-5', 'claude-3-7-sonnet-20250219', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'] },
  { label: 'Google Gemini', url: 'https://generativelanguage.googleapis.com/v1beta/openai', models: ['gemini-2.5-pro-preview-06-05', 'gemini-2.5-flash-preview-05-20', 'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'] },
  { label: '通义千问 (Qwen)', url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', models: ['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen-long', 'qwq-32b', 'qwen3-235b-a22b'] },
  { label: '智谱 AI (GLM)', url: 'https://open.bigmodel.cn/api/paas/v4', models: ['glm-4-plus', 'glm-4-air', 'glm-4-flash', 'glm-z1-plus', 'glm-z1-air'] },
  { label: '月之暗面 (Moonshot)', url: 'https://api.moonshot.cn/v1', models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'] },
  { label: 'MiniMax', url: 'https://api.minimax.chat/v1', models: ['MiniMax-Text-01', 'abab6.5s-chat', 'abab5.5-chat'] },
  { label: 'Mistral', url: 'https://api.mistral.ai/v1', models: ['mistral-large-latest', 'mistral-small-latest', 'codestral-latest', 'open-mistral-nemo'] },
  { label: 'Groq', url: 'https://api.groq.com/openai/v1', models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'] },
  { label: 'together.ai', url: 'https://api.together.xyz/v1', models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'mistralai/Mixtral-8x7B-Instruct-v0.1'] },
  { label: '自定义', url: '', models: [] },
];

function detectProvider(url: string) {
  return PROVIDERS.find((p) => p.url && p.url === url) ?? PROVIDERS[PROVIDERS.length - 1];
}

const BROWSER_PROVIDERS: Array<{ value: BrowserAiProvider; label: string }> = [
  { value: 'chatgpt', label: 'ChatGPT' }, { value: 'deepseek', label: 'DeepSeek 网页版' },
  { value: 'claude', label: 'Claude' }, { value: 'gemini', label: 'Gemini' },
  { value: 'qwen', label: '通义千问' }, { value: 'perplexity', label: 'Perplexity' },
];

export default function AiConfigPanel({ initialBaseUrl, initialApiKey, initialModel, initialProviderMode, initialBrowserProvider, initialCompanionAutomation, betaActive }: AiConfigPanelProps) {
  const [providerMode, setProviderMode] = useState(initialProviderMode);
  const [browserProvider, setBrowserProvider] = useState(initialBrowserProvider);
  const [companionAutomation, setCompanionAutomation] = useState(initialCompanionAutomation);
  const [provider, setProvider] = useState(() => detectProvider(initialBaseUrl));
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl);
  const [apiKey, setApiKey] = useState(initialApiKey === '__stored__' ? '' : initialApiKey);
  const [hasStoredKey, setHasStoredKey] = useState(initialApiKey === '__stored__');
  const [model, setModel] = useState(initialModel || '');
  const [showApiKey, setShowApiKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [testLoading, setTestLoading] = useState(false);

  // Detailed test result state
  const [testSuccess, setTestSuccess] = useState<boolean | null>(null);
  const [testDuration, setTestDuration] = useState<string>('');
  const [testRequest, setTestRequest] = useState<string>('');
  const [testResponseContent, setTestResponseContent] = useState<string>('');
  const [testResponseRaw, setTestResponseRaw] = useState<string>('');

  const isCustom = provider.label === '自定义';

  function handleProviderChange(label: string) {
    const selected = PROVIDERS.find((p) => p.label === label) ?? PROVIDERS[PROVIDERS.length - 1];
    setProvider(selected);
    if (selected.label !== '自定义') {
      setBaseUrl(selected.url);
      if (selected.models.length > 0) {
        setModel(selected.models[0]);
      }
    } else {
      setBaseUrl('');
      setModel('');
    }
  }

  function handleBaseUrlChange(value: string) {
    setBaseUrl(value);
    const matched = PROVIDERS.find((p) => p.url === value);
    if (!matched) {
      setProvider(PROVIDERS[PROVIDERS.length - 1]);
    }
  }

  async function handleTest() {
    setTestLoading(true);
    setTestSuccess(null);
    setTestDuration('');
    setTestResponseContent('');
    setTestResponseRaw('');

    const startTime = Date.now();
    const reqBody = {
      model: model.trim(),
      messages: [
        { role: 'system', content: 'This is a connection probe. Return only OK.' },
        { role: 'user', content: 'Reply with exactly OK.' },
      ],
      temperature: 0,
      max_tokens: 64,
      stream: false,
      _connection_test: true,
    };

    setTestRequest(JSON.stringify(reqBody, null, 2));

    try {
      saveAiConfig({ baseUrl: baseUrl.trim(), apiKey: apiKey.trim() || (hasStoredKey ? '__stored__' : ''), model: model.trim(), providerMode, browserProvider, companionAutomation });
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 20_000);
      const res = await (async () => {
        try {
          return providerMode === 'browser' ? await callAiApi(reqBody.messages, { temperature: 0, maxTokens: 64, noThinking: true, signal: controller.signal }) : await fetch('/api/llm-proxy', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ...reqBody, providerMode, ...(providerMode === 'personal' ? { baseUrl: baseUrl.trim(), ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) } : {}) }),
            signal: controller.signal,
          });
        } finally {
          window.clearTimeout(timeout);
        }
      })();

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      setTestDuration(`${duration}s`);

      const raw = await res.text();
      setTestResponseRaw(raw);

      if (res.ok) {
        try {
          const data = JSON.parse(raw);
          const content = data.choices?.[0]?.message?.content || '(empty response)';
          setTestResponseContent(content);
          setTestSuccess(true);
        } catch {
          setTestResponseContent(raw);
          setTestSuccess(true);
        }
      } else {
        const explained = explainAiError(res.status, raw);
        setTestResponseContent(`${explained.reason}\n错误代码：${explained.code}\nHTTP：${res.status}\n详情：${explained.detail}`);
        setTestSuccess(false);
      }
    } catch (err) {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      setTestDuration(`${duration}s`);
      setTestResponseContent(err instanceof DOMException && err.name === 'AbortError'
        ? '连接测试超过 20 秒，已停止。请检查云端模型状态或网络。'
        : `Network error: ${err instanceof Error ? err.message : String(err)}`);
      setTestResponseRaw('');
      setTestSuccess(false);
    }
    setTestLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      saveAiConfig({ baseUrl: baseUrl.trim(), apiKey: apiKey.trim() || (hasStoredKey ? '__stored__' : ''), model: model.trim(), providerMode, browserProvider, companionAutomation });
      // 同步到服务器（跨设备持久化）
      const result = await syncAiConfigToServer();
      if (result.error) {
        setMessage('AI 配置已保存到本地浏览器（云端同步失败，登录后自动恢复）');
      } else {
        setMessage('AI 配置已保存（本地 + 云端）');
        if (providerMode === 'personal') {
          setHasStoredKey(true);
          setApiKey('');
        }
      }
    } catch {
      setError('保存失败');
    }
    setLoading(false);
  }

  const selectClass = 'w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4] transition-colors';
  const inputClass = 'w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4] transition-colors';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div><label className="block text-sm font-medium text-[var(--foreground)] mb-1">调用来源</label><select value={providerMode} onChange={(e) => setProviderMode(e.target.value as 'cloud' | 'personal' | 'browser')} className={selectClass}><option value="cloud">平台云端 API（消耗套餐额度）</option><option value="personal">我的本地 API 配置（不消耗平台额度）</option>{betaActive && <option value="browser">本地网页 AI（手动中转） · BETA</option>}</select><p className="mt-1 text-xs text-[var(--muted-foreground)]">云端模型由管理员配置；个人 API 密钥会加密保存。网页 AI 不需要 API Key，默认关闭。</p></div>
      {providerMode === 'browser' && betaActive && <div className="space-y-3 rounded-xl border border-[#7f56d9]/30 bg-[#7f56d9]/5 p-4">
        <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">本地网页 AI <span className="ml-1 rounded bg-[#7f56d9] px-1.5 py-0.5 text-[10px] text-white">BETA</span></p><p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">手动模式可复制粘贴；开启 Companion 后会自动完成打开、填写、发送、读取回复和返回。</p></div></div>
        <label className="block text-sm font-medium">首选 AI 网页<select value={browserProvider} onChange={(event) => setBrowserProvider(event.target.value as BrowserAiProvider)} className={`${selectClass} mt-1`}>{BROWSER_PROVIDERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <div className={`overflow-hidden rounded-2xl border-2 transition ${companionAutomation ? 'border-[#7f56d9] bg-[#7f56d9]/10 shadow-[0_10px_30px_rgba(127,86,217,.15)]' : 'border-[var(--card-border)] bg-[var(--card)]'}`}>
          <label className="flex cursor-pointer items-start gap-3 p-4"><input type="checkbox" checked={companionAutomation} onChange={(event) => setCompanionAutomation(event.target.checked)} className="mt-1 h-5 w-5 accent-[#7f56d9]" /><span className="min-w-0"><span className="flex flex-wrap items-center gap-2 text-sm font-bold"><span className="material-icons-round text-xl text-[#7f56d9]">auto_awesome</span>Companion 全自动处理<span className={`rounded-full px-2 py-0.5 text-[10px] ${companionAutomation ? 'bg-[#12b76a] text-white' : 'bg-[var(--background)] text-[var(--muted-foreground)]'}`}>{companionAutomation ? '已开启' : '未开启'}</span></span><span className="mt-1 block text-xs leading-5 text-[var(--muted-foreground)]">需要最新版扩展、同一账号登录和 BETA 资格。失败时会明确显示原因，并保留手动复制入口。</span></span></label>
          <ol className="grid grid-cols-4 border-t border-[#7f56d9]/20 bg-[var(--background)]/60 px-3 py-3 text-center text-[10px] font-semibold text-[var(--muted-foreground)]"><li>① 打开网页</li><li>② 填写发送</li><li>③ 等待回复</li><li>④ 自动返回</li></ol>
        </div>
      </div>}
      {providerMode === 'personal' && <>
      <div>
        <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
          AI 提供商
        </label>
        <select
          value={provider.label}
          onChange={(e) => handleProviderChange(e.target.value)}
          className={selectClass}
        >
          {PROVIDERS.map((p) => (
            <option key={p.label} value={p.label}>{p.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
          API Base URL
        </label>
        <input
          type="url"
          value={baseUrl}
          onChange={(e) => handleBaseUrlChange(e.target.value)}
          placeholder="https://api.openai.com/v1"
          className={inputClass}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
          API Key
        </label>
        <div className="relative">
          <input
            type={showApiKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={hasStoredKey ? '已安全保存；留空表示不更换' : 'sk-...'}
            className={`${inputClass} pr-10`}
          />
          {apiKey && (
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--background)] transition-colors"
              title={showApiKey ? '隐藏密钥' : '显示密钥'}
            >
              <span className="material-icons-round text-sm">
                {showApiKey ? 'visibility_off' : 'visibility'}
              </span>
            </button>
          )}
        </div>
        <p className="text-xs text-[var(--muted-foreground)] mt-1">
          API Key 使用 AES-256-GCM 加密后保存；页面只显示是否已配置，不回传明文。
        </p>
      </div>
      <div>
        <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
          模型名称
        </label>
        {isCustom ? (
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="gpt-3.5-turbo"
            className={inputClass}
          />
        ) : (
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className={selectClass}
          >
            {provider.models.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        )}
      </div>
      </>}

      {error && (
        <p className="text-sm text-[#EA4335] bg-[#EA4335]/10 rounded-lg px-3 py-2">{error}</p>
      )}
      {message && (
        <p className="text-sm text-[#34A853] bg-[#34A853]/10 rounded-lg px-3 py-2">{message}</p>
      )}

      {/* Test result — full output */}
      {testSuccess !== null && (
        <div className={`rounded-lg border p-4 space-y-3 ${
          testSuccess
            ? 'border-[#34A853]/30 bg-[#34A853]/5'
            : 'border-[#EA4335]/30 bg-[#EA4335]/5'
        }`}>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span>{testSuccess ? '✅' : '❌'}</span>
            <span>{testSuccess ? '连接成功' : '连接失败'}</span>
            {testDuration && (
              <span className="text-xs text-[var(--muted-foreground)]">⏱ {testDuration}</span>
            )}
          </div>

          {testRequest && (
            <details className="text-xs">
              <summary className="cursor-pointer text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
                📤 请求内容
              </summary>
              <pre className="mt-2 p-3 rounded-lg bg-black/10 text-[var(--foreground)] overflow-x-auto whitespace-pre-wrap break-all text-xs font-mono leading-relaxed">
                {testRequest}
              </pre>
            </details>
          )}

          {testResponseContent && (
            <div>
              <p className="text-xs font-medium text-[var(--muted-foreground)] mb-1">
                📥 AI 回复：
              </p>
              <pre className="p-3 rounded-lg bg-black/10 text-[var(--foreground)] overflow-x-auto whitespace-pre-wrap break-all text-xs font-mono leading-relaxed">
                {testResponseContent}
              </pre>
            </div>
          )}

          {testResponseRaw && (
            <details className="text-xs">
              <summary className="cursor-pointer text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
                🔍 原始 JSON 响应
              </summary>
              <pre className="mt-2 p-3 rounded-lg bg-black/10 text-[var(--foreground)] overflow-x-auto whitespace-pre-wrap break-all text-xs font-mono leading-relaxed max-h-[400px] overflow-y-auto">
                {testResponseRaw.length > 5000 ? testResponseRaw.slice(0, 5000) + '\n\n... (truncated)' : testResponseRaw}
              </pre>
            </details>
          )}
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#4285F4] text-sm font-medium text-white hover:bg-[#3367d6] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <>
              <span className="material-icons-round text-sm animate-spin">autorenew</span>
              保存中...
            </>
          ) : (
            '保存配置'
          )}
        </button>
        <button
          type="button"
          onClick={handleTest}
          disabled={testLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#34A853] text-sm font-medium text-white hover:bg-[#2d9147] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {testLoading ? (
            <>
              <span className="material-icons-round text-sm animate-spin">autorenew</span>
              测试中...
            </>
          ) : (
            '🔗 测试连接'
          )}
        </button>
      </div>
    </form>
  );
}
