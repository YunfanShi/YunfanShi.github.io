export interface AiStreamResult {
  content: string;
  reasoning: string;
  usage?: { input?: number; output?: number };
}

interface OpenAiChunk {
  choices?: Array<{
    delta?: { content?: string; reasoning_content?: string };
    message?: { content?: string; reasoning_content?: string };
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; input_tokens?: number; output_tokens?: number };
}

function applyChunk(chunk: OpenAiChunk, result: AiStreamResult): boolean {
  const choice = chunk.choices?.[0];
  const content = choice?.delta?.content ?? choice?.message?.content ?? '';
  const reasoning = choice?.delta?.reasoning_content ?? choice?.message?.reasoning_content ?? '';
  if (content) result.content += content;
  if (reasoning) result.reasoning += reasoning;
  if (chunk.usage) {
    result.usage = {
      input: chunk.usage.prompt_tokens ?? chunk.usage.input_tokens,
      output: chunk.usage.completion_tokens ?? chunk.usage.output_tokens,
    };
  }
  return Boolean(content || reasoning || chunk.usage);
}

/** Parse OpenAI-compatible SSE without losing JSON split across network chunks. */
export async function readAiStream(
  response: Response,
  onUpdate: (value: AiStreamResult) => void,
  onActivity?: () => void,
): Promise<AiStreamResult> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('AI 返回了空响应流。');

  const decoder = new TextDecoder();
  const result: AiStreamResult = { content: '', reasoning: '' };
  let lineBuffer = '';
  let rawBody = '';
  let parsedEvent = false;

  const processLine = (line: string) => {
    const normalized = line.endsWith('\r') ? line.slice(0, -1) : line;
    if (!normalized.startsWith('data:')) return;
    const payload = normalized.slice(5).trim();
    if (!payload || payload === '[DONE]') return;
    try {
      if (applyChunk(JSON.parse(payload) as OpenAiChunk, result)) {
        parsedEvent = true;
        onUpdate({ ...result, usage: result.usage ? { ...result.usage } : undefined });
      }
    } catch {
      // A complete SSE line can still contain provider metadata we do not understand.
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    onActivity?.();
    const text = decoder.decode(value, { stream: true });
    rawBody += text;
    lineBuffer += text;
    const lines = lineBuffer.split('\n');
    lineBuffer = lines.pop() ?? '';
    lines.forEach(processLine);
  }

  lineBuffer += decoder.decode();
  if (lineBuffer) processLine(lineBuffer);

  if (!parsedEvent && rawBody.trim()) {
    try {
      applyChunk(JSON.parse(rawBody) as OpenAiChunk, result);
      onUpdate({ ...result, usage: result.usage ? { ...result.usage } : undefined });
    } catch {
      // The caller turns an empty parsed result into a visible retryable error.
    }
  }

  if (!result.content.trim() && !result.reasoning.trim()) {
    throw new Error('模型已结束请求，但没有返回可显示的内容。请重试或切换模型。');
  }
  return result;
}
