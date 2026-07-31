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

/** 思考深度等级 — 影响 temperature 和 system prompt */
export type ThinkingLevel = 'low' | 'medium' | 'high';

/** 操作模式 — YOLO 全部通过 / safe 低风险自动通过高风险确认 */
export type SafetyMode = 'yolo' | 'safe';

const THINKING_LEVEL_KEY = 'jackyun-ai-thinking-level';
const SAFETY_MODE_KEY = 'jackyun-ai-safety-mode';
const TOKEN_PRICE_KEY = 'jackyun-ai-token-price';

/** 获取操作模式（默认 safe） */
export function getSafetyMode(): SafetyMode {
  if (typeof window === 'undefined') return 'safe';
  try {
    const val = localStorage.getItem(SAFETY_MODE_KEY);
    return val === 'yolo' ? 'yolo' : 'safe';
  } catch { return 'safe'; }
}

/** 保存操作模式 */
export function saveSafetyMode(mode: SafetyMode): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SAFETY_MODE_KEY, mode);
}

/** 获取模型价格（元 / 1M tokens，默认 2 元） */
export function getTokenPrice(): number {
  if (typeof window === 'undefined') return 2;
  try {
    const val = localStorage.getItem(TOKEN_PRICE_KEY);
    const num = Number(val);
    return isFinite(num) && num > 0 ? num : 2;
  } catch { return 2; }
}

/** 保存模型价格 */
export function saveTokenPrice(price: number): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_PRICE_KEY, String(price));
}

/** 获取用户设置的思考深度（默认 medium） */
export function getThinkingLevel(): ThinkingLevel {
  if (typeof window === 'undefined') return 'medium';
  try {
    const val = localStorage.getItem(THINKING_LEVEL_KEY);
    if (val === 'low' || val === 'high') return val;
    return 'medium';
  } catch {
    return 'medium';
  }
}

/** 保存用户设置的思考深度 */
export function saveThinkingLevel(level: ThinkingLevel): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(THINKING_LEVEL_KEY, level);
}

/** 根据思考深度获取对应的 temperature 值 */
export function getThinkingTemperature(level: ThinkingLevel): number {
  switch (level) {
    case 'low': return 0.6;   // 快速响应，少思考
    case 'high': return 0.05; // 深度推理，认真分析
    default: return 0.2;      // 平衡默认
  }
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

/**
 * 将 AI 配置同步到 Supabase 服务器（跨设备持久化）
 * 调用 Server Action saveAiConfig 保存到 user_settings 表
 */
export async function syncAiConfigToServer(): Promise<{ error: string | null }> {
  if (typeof window === 'undefined') return { error: 'Server-side only' };
  const config = getAiConfig();
  try {
    const res = await fetch('/api/llm-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        _save_ai_config: true,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
      }),
    });
    const data = await res.json();
    return { error: data.error || null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : '同步失败' };
  }
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

  const body: Record<string, unknown> = {
    model: model || 'gpt-3.5-turbo',
    messages,
    temperature: options.temperature ?? getThinkingTemperature(getThinkingLevel()),
    stream: options.stream ?? false,
  };

  // 无 max_tokens：不限制回复长度，让 AI 完整回答
  return fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
}
