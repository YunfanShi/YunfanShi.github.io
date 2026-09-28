import { emitDiagnostic, errorDetails, logAiReply, type DiagnosticContext } from './diagnostic-events.ts';
import { jsonrepair } from 'jsonrepair';

function isLikelyLatexEscape(raw: string, slashIndex: number): boolean {
  const rest = raw.slice(slashIndex + 1);
  const command = rest.match(/^[A-Za-z]+/u)?.[0] ?? '';
  return command.length > 1 || /^[()[\]{} ,;!:|<>]/u.test(rest);
}

function repairStringEscapes(raw: string): string {
  let cleaned = '';
  let inDoubleQuotedString = false;
  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];
    const next = raw[index + 1] ?? '';
    if (character === '"' && (index === 0 || raw[index - 1] !== '\\')) inDoubleQuotedString = !inDoubleQuotedString;
    if (character === '\\') {
      // A valid JSON \\ pair already represents one literal LaTeX slash.
      // Do not inspect its second slash as a new, unescaped command.
      if (inDoubleQuotedString && next === '\\') {
        cleaned += '\\\\';
        index += 1;
        continue;
      }
      if (!inDoubleQuotedString && ('{}[]\n\r'.includes(next))) continue;
      if (inDoubleQuotedString && isLikelyLatexEscape(raw, index)) {
        cleaned += '\\\\';
        continue;
      }
      if (inDoubleQuotedString && next && !'"\\/bfnrtu'.includes(next)) continue;
    }
    cleaned += character;
  }
  return cleaned;
}

function normalizeStructuralPunctuation(raw: string): string {
  let normalized = '';
  let quote: '"' | "'" | '“' | '‘' | null = null;
  let escaped = false;

  for (const character of raw) {
    if (quote) {
      normalized += character;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if ((quote === '“' && character === '”') || (quote === '‘' && character === '’') || character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'" || character === '“' || character === '‘') {
      quote = character;
      normalized += character;
    } else if (character === '：') normalized += ':';
    else if (character === '，' || character === '；' || character === ';') normalized += ',';
    else normalized += character;
  }
  return normalized;
}

function jsonCandidate(raw: string): string {
  const text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/gu, '');

  const start = text.search(/[\[{]/u);
  if (start < 0) throw new Error('AI 没有返回可读取的 JSON。');

  const stack: string[] = [];
  let quote: '"' | "'" | '“' | '‘' | null = null;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if ((quote === '“' && character === '”') || (quote === '‘' && character === '’') || character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'" || character === '“' || character === '‘') quote = character;
    else if (character === '{') stack.push('}');
    else if (character === '[') stack.push(']');
    else if (character === '}' || character === ']') {
      if (stack.at(-1) === character) stack.pop();
      if (stack.length === 0) return text.slice(start, index + 1);
    }
  }

  return text.slice(start);
}

/** Parse the small, structured objects requested from an LLM.
 *
 * The first pass remains strict. The fallback repairs common LLM formatting
 * defects such as smart/single quotes, missing or trailing commas, unquoted
 * keys, Python constants, code fences, and truncated closing brackets. Feature
 * parsers must still validate the returned shape before using it.
 */
function parseAiJsonInternal(raw: string): unknown {
  const candidate = jsonCandidate(raw);
  const repairable = normalizeStructuralPunctuation(repairStringEscapes(candidate));
  try {
    if (repairable !== candidate) throw new SyntaxError('AI JSON needs escape repair.');
    return JSON.parse(candidate) as unknown;
  } catch (firstError) {
    try {
      return JSON.parse(jsonrepair(repairable)) as unknown;
    } catch {
      throw new Error(firstError instanceof SyntaxError ? 'AI 返回的 JSON 格式有误，请重试。' : 'AI 返回内容无法读取，请重试。');
    }
  }
}

export function parseAiJson(raw: string, context: DiagnosticContext = {}): unknown {
  try { return parseAiJsonInternal(raw); }
  catch (error) { logAiReply('解析失败的可见正文', raw, context); emitDiagnostic('error', 'AIParse', 'AI JSON 解析失败', { ...context, error: errorDetails(error), characters: raw.length }); throw error; }
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

async function readAiResponseInternal(response: Response, context: DiagnosticContext): Promise<string> {
  const raw = await response.text();
  let payload: unknown;
  try { payload = JSON.parse(raw) as unknown; }
  catch { logAiReply('非 JSON HTTP 响应', raw, context); throw new Error(response.ok ? 'AI 服务返回了无效响应，请重试。' : raw || 'AI 请求失败。'); }
  logAiReply('HTTP 响应正文（已脱敏）', payload, context);

  if (!response.ok) {
    const error = (payload as { error?: unknown })?.error;
    const message = typeof error === 'string' ? error : error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string' ? (error as { message: string }).message : '';
    throw new Error(message || 'AI 请求失败。');
  }
  const content = extractAssistantContent(payload);
  logAiReply('AI 可见回复', content, context);
  return content;
}

export async function readAiResponseContent(response: Response, context: DiagnosticContext = {}): Promise<string> {
  context = { requestId: response.headers.get('x-request-id') || crypto.randomUUID(), ...context };
  const details = { ...context, status: response.status, contentType: response.headers.get('content-type'), serverRequestId: response.headers.get('x-request-id') };
  emitDiagnostic('info', 'AIResponse', '收到 AI HTTP 响应', details);
  try { return await readAiResponseInternal(response, context); }
  catch (error) { emitDiagnostic('error', 'AIResponse', '读取 AI 响应失败', { ...details, error: errorDetails(error) }); throw error; }
}

export type AiStreamProgress = {
  content: string;
  reasoningCharacters: number;
};

/** Read an OpenAI-compatible SSE response without exposing hidden reasoning.
 * Callers receive the visible answer accumulated so far and only the size of
 * any reasoning stream, which is enough to render trustworthy progress UI.
 */
async function readAiStreamingInternal(
  response: Response,
  onProgress?: (progress: AiStreamProgress) => void,
): Promise<string> {
  if (!response.ok || !response.headers.get('content-type')?.includes('text/event-stream')) {
    const content = await readAiResponseContent(response);
    onProgress?.({ content, reasoningCharacters: 0 });
    return content;
  }
  if (!response.body) throw new Error('无法读取 AI 响应流。');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let eventBuffer = '';
  let content = '';
  let reasoningCharacters = 0;

  const consumeLine = (line: string) => {
    if (!line.startsWith('data:')) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') return;
    try {
      const event = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: unknown; reasoning_content?: unknown } }> };
      const delta = event.choices?.[0]?.delta;
      const visible = typeof delta?.content === 'string' ? delta.content : '';
      const reasoning = typeof delta?.reasoning_content === 'string' ? delta.reasoning_content : '';
      if (!visible && !reasoning) return;
      content += visible;
      reasoningCharacters += reasoning.length;
      onProgress?.({ content, reasoningCharacters });
    } catch (error) { emitDiagnostic('warn', 'AIStream', '忽略无法解析的流事件', { error: errorDetails(error), eventCharacters: payload.length }); }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    eventBuffer += decoder.decode(value, { stream: true });
    const lines = eventBuffer.split('\n');
    eventBuffer = lines.pop() ?? '';
    lines.forEach(consumeLine);
  }
  eventBuffer += decoder.decode();
  eventBuffer.split('\n').forEach(consumeLine);
  if (!content.trim()) throw new Error('AI 没有返回可读取的正文，请重试。');
  return content;
}

export async function readAiStreamingResponseContent(response: Response, onProgress?: (progress: AiStreamProgress) => void): Promise<string> {
  try {
    const content = await readAiStreamingInternal(response, onProgress);
    if (response.headers.get('content-type')?.includes('text/event-stream')) logAiReply('AI 流式可见回复', content);
    return content;
  } catch (error) { emitDiagnostic('error', 'AIStream', 'AI 流式响应失败', { status: response.status, error: errorDetails(error) }); throw error; }
}
