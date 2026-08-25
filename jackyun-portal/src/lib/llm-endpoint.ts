const DEFAULT_LLM_HOSTS = new Set([
  'api.openai.com',
  'api.deepseek.com',
  'api.anthropic.com',
  'generativelanguage.googleapis.com',
  'dashscope.aliyuncs.com',
  'open.bigmodel.cn',
  'api.moonshot.cn',
  'api.minimax.chat',
  'api.mistral.ai',
  'api.groq.com',
  'api.together.xyz',
]);

function configuredHosts(value: string | undefined): Set<string> {
  return new Set((value ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean));
}

/**
 * Validates a user-controlled OpenAI-compatible endpoint before the server
 * connects to it. Custom providers must be explicitly allowed by the server
 * operator through ALLOWED_LLM_HOSTS (comma-separated hostnames).
 */
export function normalizeLlmBaseUrl(value: string, extraHosts = process.env.ALLOWED_LLM_HOSTS): string | undefined {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return undefined;
  }

  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return undefined;
  if (url.search || url.hash) return undefined;

  const hostname = url.hostname.toLowerCase();
  const allowed = DEFAULT_LLM_HOSTS.has(hostname) || configuredHosts(extraHosts).has(hostname);
  if (!allowed) return undefined;

  const path = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${path}`;
}
