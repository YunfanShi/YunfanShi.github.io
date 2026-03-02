'use client';

import { useState } from 'react';
import { saveAiConfig } from '@/actions/settings';

interface AiConfigPanelProps {
  initialBaseUrl: string;
  initialApiKey: string;
  initialModel: string;
}

const PROVIDERS = [
  { label: 'OpenAI', url: 'https://api.openai.com/v1', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo', 'o1', 'o1-mini', 'o3-mini'] },
  { label: 'DeepSeek', url: 'https://api.deepseek.com/v1', models: ['deepseek-chat', 'deepseek-reasoner'] },
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

export default function AiConfigPanel({ initialBaseUrl, initialApiKey, initialModel }: AiConfigPanelProps) {
  const [provider, setProvider] = useState(() => detectProvider(initialBaseUrl));
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl);
  const [apiKey, setApiKey] = useState(initialApiKey);
  const [model, setModel] = useState(initialModel);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testLoading, setTestLoading] = useState(false);

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
    setTestResult(null);
    try {
      const res = await fetch(`${baseUrl.trim()}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: model.trim(),
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1,
          stream: false,
        }),
      });
      if (res.ok) {
        setTestResult('✅ 连接成功，模型响应正常');
      } else if (res.status === 401 || res.status === 403) {
        setTestResult('❌ API Key 无效或无权限');
      } else if (res.status === 404) {
        setTestResult('❌ Base URL 或模型名称有误');
      } else {
        setTestResult(`❌ 连接失败：HTTP ${res.status}`);
      }
    } catch (err) {
      setTestResult(`❌ 连接失败：${err instanceof Error ? err.message : String(err)}`);
    }
    setTestLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const result = await saveAiConfig(baseUrl.trim(), apiKey.trim(), model.trim());
    if (result.error) {
      setError(result.error);
    } else {
      setMessage('AI 配置已保存');
    }
    setLoading(false);
  }

  const selectClass = 'w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4] transition-colors';
  const inputClass = 'w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4] transition-colors';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-..."
          className={inputClass}
        />
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

      {error && (
        <p className="text-sm text-[#EA4335] bg-[#EA4335]/10 rounded-lg px-3 py-2">{error}</p>
      )}
      {message && (
        <p className="text-sm text-[#34A853] bg-[#34A853]/10 rounded-lg px-3 py-2">{message}</p>
      )}
      {testResult && (
        <p className={`text-sm rounded-lg px-3 py-2 ${testResult.startsWith('✅') ? 'text-[#34A853] bg-[#34A853]/10' : 'text-[#EA4335] bg-[#EA4335]/10'}`}>
          {testResult}
        </p>
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
