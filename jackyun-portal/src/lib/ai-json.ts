function jsonCandidate(raw: string): string {
  const text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/gu, '');

  const start = text.search(/[\[{]/u);
  if (start < 0) throw new Error('AI 没有返回可读取的 JSON。');

  const opening = text[start];
  const closing = opening === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === opening) depth += 1;
    else if (character === closing) {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }

  throw new Error('AI 返回的 JSON 不完整，请重试。');
}

function repairJson(candidate: string): string {
  let repaired = '';
  let inString = false;
  let escaped = false;

  for (let index = 0; index < candidate.length; index += 1) {
    const character = candidate[index];
    if (!inString) {
      if (character === '"') inString = true;
      repaired += character;
      continue;
    }

    if (escaped) {
      if ('"\\/bfnrtu'.includes(character)) repaired += `\\${character}`;
      else repaired += character;
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
    } else if (character === '"') {
      repaired += character;
      inString = false;
    } else if (character === '\n') repaired += '\\n';
    else if (character === '\r') repaired += '\\r';
    else if (character === '\t') repaired += '\\t';
    else if (character.charCodeAt(0) < 0x20) repaired += `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`;
    else repaired += character;
  }

  if (escaped) repaired += '\\';

  return repaired.replace(/,\s*([}\]])/gu, '$1');
}

/** Parse the small, structured objects requested from an LLM.
 *
 * The first pass remains strict. The fallback only repairs defects that do not
 * change meaning: raw control characters, invalid escaped punctuation, and
 * trailing commas. It deliberately refuses truncated or structurally ambiguous
 * output instead of guessing missing content.
 */
export function parseAiJson(raw: string): unknown {
  const candidate = jsonCandidate(raw);
  try {
    return JSON.parse(candidate) as unknown;
  } catch (firstError) {
    try {
      return JSON.parse(repairJson(candidate)) as unknown;
    } catch {
      throw new Error(firstError instanceof SyntaxError ? 'AI 返回的 JSON 格式有误，请重试。' : 'AI 返回内容无法读取，请重试。');
    }
  }
}

export function extractAssistantContent(payload: unknown): string {
  if (!payload || typeof payload !== 'object') throw new Error('AI 返回内容为空，请重试。');
  const value = payload as Record<string, unknown>;
  if (typeof value.output_text === 'string' && value.output_text.trim()) return value.output_text;
  const choices = Array.isArray(value.choices) ? value.choices : [];
  const first = choices[0] as { text?: unknown; message?: { content?: unknown } } | undefined;
  const content = first?.message?.content;
  if (typeof content === 'string' && content.trim()) return content;
  if (Array.isArray(content)) {
    const text = content
      .map((part) => part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string' ? (part as { text: string }).text : '')
      .join('');
    if (text.trim()) return text;
  }
  if (typeof first?.text === 'string' && first.text.trim()) return first.text;
  throw new Error('AI 没有返回可读取的正文，请重试。');
}

export async function readAiResponseContent(response: Response): Promise<string> {
  const raw = await response.text();
  let payload: unknown;
  try { payload = JSON.parse(raw) as unknown; }
  catch { throw new Error(response.ok ? 'AI 服务返回了无效响应，请重试。' : raw || 'AI 请求失败。'); }

  if (!response.ok) {
    const error = (payload as { error?: unknown })?.error;
    const message = typeof error === 'string' ? error : error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string' ? (error as { message: string }).message : '';
    throw new Error(message || 'AI 请求失败。');
  }
  return extractAssistantContent(payload);
}
