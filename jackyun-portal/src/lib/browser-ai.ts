'use client';

export const BROWSER_AI_REQUEST_EVENT = 'jackyun-browser-ai-request';
export const BROWSER_AI_CANCELLED = 'BROWSER_AI_CANCELLED';

export type BrowserAiProvider = 'chatgpt' | 'deepseek' | 'claude' | 'gemini' | 'qwen' | 'perplexity';
export type BrowserAiConversationMode = 'new' | 'recent' | 'selected';

export interface BrowserAiConversationTarget {
  mode: BrowserAiConversationMode;
  url: string;
}

export interface BrowserAiConversation {
  title: string;
  url: string;
  active: boolean;
}

export interface BrowserAiWebModel {
  id: string;
  label: string;
  selected: boolean;
}

const CONVERSATION_TARGET_KEY = 'jackyun-browser-ai-conversation-target';

export interface BrowserAiRequest {
  id: string;
  prompt: string;
  provider: BrowserAiProvider;
  conversationMode: BrowserAiConversationMode;
  conversationUrl: string;
  model: string;
  automation: boolean;
  stream: boolean;
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
}

export function getBrowserAiConversationTarget(): BrowserAiConversationTarget {
  if (typeof window === 'undefined') return { mode: 'new', url: '' };
  try {
    const parsed = JSON.parse(localStorage.getItem(CONVERSATION_TARGET_KEY) || '{}') as Partial<BrowserAiConversationTarget>;
    return { mode: parsed.mode === 'recent' || parsed.mode === 'selected' ? parsed.mode : 'new', url: typeof parsed.url === 'string' ? parsed.url : '' };
  } catch { return { mode: 'new', url: '' }; }
}

export function saveBrowserAiConversationTarget(target: BrowserAiConversationTarget): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CONVERSATION_TARGET_KEY, JSON.stringify({ mode: target.mode, url: target.mode === 'selected' ? target.url : '' }));
}

export function formatBrowserAiPrompt(messages: Array<{ role: string; content: string }>): string {
  const transcript = messages.map((message) => `[${message.role.toUpperCase()}]\n${message.content}`).join('\n\n');
  return `You are completing an AI request for JackYun Portal. Follow every SYSTEM instruction below.\n\n${transcript}\n\n[RESPONSE FORMAT]\nReturn only the assistant response requested above. Preserve JSON or NDJSON exactly when requested: no Markdown fences, preface, or commentary. Do not repeat this prompt.`;
}

function responseBody(content: string, stream: boolean): string {
  if (!stream) return JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] });
  const chunk = JSON.stringify({ choices: [{ delta: { content }, finish_reason: null }] });
  const done = JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] });
  return `data: ${chunk}\n\ndata: ${done}\n\ndata: [DONE]\n\n`;
}

export function browserAiResponse(content: string, stream: boolean): Response {
  return new Response(responseBody(content, stream), {
    status: 200,
    headers: { 'Content-Type': stream ? 'text/event-stream; charset=utf-8' : 'application/json; charset=utf-8' },
  });
}

export function requestBrowserAi(
  messages: Array<{ role: string; content: string }>,
  provider: BrowserAiProvider,
  automation: boolean,
  stream: boolean,
  model = '',
): Promise<Response> {
  const conversation = getBrowserAiConversationTarget();
  return new Promise((resolve, reject) => {
    window.dispatchEvent(new CustomEvent<BrowserAiRequest>(BROWSER_AI_REQUEST_EVENT, {
      detail: { id: crypto.randomUUID(), prompt: formatBrowserAiPrompt(messages), provider, conversationMode: conversation.mode, conversationUrl: conversation.url, model, automation, stream, resolve, reject },
    }));
  });
}
