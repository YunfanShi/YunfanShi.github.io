/**
 * 统一 AI 配置管理 —— 纯本地存储，不上传云端
 *
 * 存储位置：localStorage key "jackyun-ai-config"
 * 存储格式：{ baseUrl: string; apiKey: string; model: string }
 */

export interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

const STORAGE_KEY = 'jackyun-ai-config';

/** 从 localStorage 读取 AI 配置 */
export function getAiConfig(): AiConfig {
  if (typeof window === 'undefined') {
    return { baseUrl: '', apiKey: '', model: '' };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { baseUrl: '', apiKey: '', model: '' };
    const parsed = JSON.parse(raw) as Partial<AiConfig>;
    return {
      baseUrl: parsed.baseUrl ?? '',
      apiKey: parsed.apiKey ?? '',
      model: parsed.model ?? '',
    };
  } catch {
    return { baseUrl: '', apiKey: '', model: '' };
  }
}

/** 保存 AI 配置到 localStorage */
export function saveAiConfig(config: AiConfig): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

/** 删除 AI 配置 */
export function clearAiConfig(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

/** 检查是否有有效的 AI 配置（baseUrl 和 apiKey 都不为空） */
export function hasValidAiConfig(): boolean {
  const config = getAiConfig();
  return config.baseUrl.trim().length > 0 && config.apiKey.trim().length > 0;
}

/**
 * 直接从客户端调用 OpenAI 兼容的 /chat/completions API
 * 这是所有 AI 功能的统一网络入口
 */
export async function callAiApi(
  messages: Array<{ role: string; content: string }>,
  options: {
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
  } = {},
): Promise<Response> {
  const config = getAiConfig();
  const baseUrl = config.baseUrl.replace(/\/+$/, '');
  const apiKey = config.apiKey;
  const model = config.model;

  if (!baseUrl || !apiKey) {
    throw new Error('请先在设置页面配置 AI API Key');
  }

  return fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || 'gpt-3.5-turbo',
      messages,
      temperature: options.temperature ?? 0.1,
      max_tokens: options.max_tokens ?? 2000,
      stream: options.stream ?? false,
    }),
  });
}