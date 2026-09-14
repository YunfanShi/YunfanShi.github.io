export const AI_MODEL_CAPABILITIES = ['agent', 'web_search', 'code', 'vision', 'reasoning', 'long_context', 'tools', 'files'] as const;
export type AiModelCapability = typeof AI_MODEL_CAPABILITIES[number];

export const AI_MODEL_CAPABILITY_LABELS: Record<AiModelCapability, string> = {
  agent: 'Agent',
  web_search: '联网搜索',
  code: '代码',
  vision: '视觉',
  reasoning: '深度推理',
  long_context: '长上下文',
  tools: '工具调用',
  files: '文件',
};

export function normalizeAiModelCapabilities(value: unknown): AiModelCapability[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(AI_MODEL_CAPABILITIES);
  return [...new Set(value.filter((item): item is AiModelCapability => typeof item === 'string' && allowed.has(item)))];
}

export function inferAiModelCapabilities(input: {
  modelId: string;
  description?: string;
  contextWindow?: number;
  supportsAgent?: boolean;
}): AiModelCapability[] {
  const text = `${input.modelId} ${input.description ?? ''}`.toLowerCase();
  const capabilities = new Set<AiModelCapability>();
  if (/groq\/compound(?:-mini)?/.test(text)) {
    capabilities.add('web_search');
    capabilities.add('code');
    capabilities.add('reasoning');
    capabilities.add('tools');
  }
  if (input.supportsAgent) { capabilities.add('agent'); capabilities.add('tools'); }
  if (/groq\/compound(?:-mini)?|web.?search|online.?search|联网|搜索/.test(text)) capabilities.add('web_search');
  if (/code|coder|codestral|devstral|codex|编程|代码/.test(text)) capabilities.add('code');
  if (/vision|multimodal|(?:^|[\W_])vl(?:[\W_]|$)|视觉|图像/.test(text)) capabilities.add('vision');
  if (/reason|thinking|deep.?think|(?:^|[\W_])r1(?:[\W_]|$)|推理|思考/.test(text)) capabilities.add('reasoning');
  if ((input.contextWindow ?? 0) >= 128_000) capabilities.add('long_context');
  if (/file|document|pdf|文件|文档/.test(text)) capabilities.add('files');
  return [...capabilities];
}

export function hasAiModelCapability(value: unknown, capability: AiModelCapability): boolean {
  return normalizeAiModelCapabilities(value).includes(capability);
}
