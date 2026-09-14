export interface AiProviderPreset {
  id: string;
  name: string;
  baseUrl: string;
  kind: '聚合平台' | '模型厂商';
}

/** Editable starting points only; the administrator can change every field. */
export const AI_PROVIDER_PRESETS: AiProviderPreset[] = [
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', kind: '聚合平台' },
  { id: 'together', name: 'Together AI', baseUrl: 'https://api.together.ai/v1', kind: '聚合平台' },
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', kind: '模型厂商' },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', kind: '模型厂商' },
  { id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', kind: '聚合平台' },
  { id: 'qwen', name: '阿里云百炼 / Qwen', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', kind: '模型厂商' },
  { id: 'zhipu', name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', kind: '模型厂商' },
  { id: 'moonshot', name: 'Moonshot / Kimi', baseUrl: 'https://api.moonshot.cn/v1', kind: '模型厂商' },
  { id: 'mistral', name: 'Mistral AI', baseUrl: 'https://api.mistral.ai/v1', kind: '模型厂商' },
  { id: 'minimax', name: 'MiniMax', baseUrl: 'https://api.minimax.chat/v1', kind: '模型厂商' },
];
