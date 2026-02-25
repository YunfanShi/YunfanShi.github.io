'use client';

import { useState } from 'react';
import { saveAiConfig } from '@/actions/settings';

interface AiConfigPanelProps {
  initialBaseUrl: string;
  initialApiKey: string;
}

export default function AiConfigPanel({ initialBaseUrl, initialApiKey }: AiConfigPanelProps) {
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl);
  const [apiKey, setApiKey] = useState(initialApiKey);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const result = await saveAiConfig(baseUrl.trim(), apiKey.trim());
    if (result.error) {
      setError(result.error);
    } else {
      setMessage('AI 配置已保存');
    }
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
          API Base URL
        </label>
        <input
          type="url"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.openai.com/v1"
          className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4] transition-colors"
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
          className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4] transition-colors"
        />
      </div>

      {error && (
        <p className="text-sm text-[#EA4335] bg-[#EA4335]/10 rounded-lg px-3 py-2">{error}</p>
      )}
      {message && (
        <p className="text-sm text-[#34A853] bg-[#34A853]/10 rounded-lg px-3 py-2">{message}</p>
      )}

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
    </form>
  );
}
