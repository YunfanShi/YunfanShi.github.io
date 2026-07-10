'use client';

import { useState, useRef, useEffect } from 'react';
import { callAiApi, getAiConfig } from '@/lib/ai-config';
import { getToolsDescription, parseToolCall, executeToolCall, ToolScope } from '@/lib/ai-tools';
import MarkdownRenderer from './markdown-renderer';
import 'katex/dist/katex.min.css';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface AiChatFabProps {
  /** 权限范围：global | quiz | plan | control，默认 global */
  scope?: ToolScope;
  /** 自定义 system prompt 后缀 */
  systemPromptSuffix?: string;
  /** 是否在页面内嵌入（不显示浮动按钮，直接在页面内渲染） */
  embedded?: boolean;
  /** 页面内模式的标题 */
  embeddedTitle?: string;
}

export default function AiChatFab({
  scope = 'global',
  systemPromptSuffix = '',
  embedded = false,
  embeddedTitle = 'AI 助手',
}: AiChatFabProps) {
  const [open, setOpen] = useState(embedded);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string>('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, streaming]);

  // Auto-resize textarea
  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  };

  useEffect(() => {
    autoResize();
  }, [input]);

  // 添加 scope 相关的 system 消息
  function getSystemMessage(): Message {
    const toolsDesc = getToolsDescription(scope);
    const scopeName = {
      global: '你是主页智能助手，可以调用所有工具。',
      quiz: '你是 QuizWise 题目的智能辅导老师，可以帮助分析题目、批改答案。',
      plan: '你是学习计划助手，可以帮助管理学习进度、安排计划。',
      control: '你是 Control 控制中心助手，可以查询和控制计时、音乐等功能。',
    };
    return {
      role: 'system',
      content: `${scopeName[scope] || scopeName.global}\n${toolsDesc}\n${systemPromptSuffix}`.trim(),
    };
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    const newMessages: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    setInput('');
    setLoading(true);
    setStreaming(true);
    setError(null);
    setStatusText('AI 正在思考...');

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      const config = getAiConfig();
      if (!config.baseUrl || !config.apiKey) {
        throw new Error('请先在设置页面配置 AI API Key');
      }

      // 构建带 system prompt 的消息列表
      const apiMessages = [getSystemMessage(), ...newMessages];

      const res = await callAiApi(apiMessages, { stream: true });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let errMsg: string;
        try {
          const err = JSON.parse(text);
          errMsg = err.error?.message ?? err.message ?? `HTTP ${res.status}`;
        } catch {
          errMsg = text || `HTTP ${res.status}`;
        }
        throw new Error(errMsg);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('无法读取 AI 响应流');

      const decoder = new TextDecoder();
      let assistantContent = '';
      let messageAdded = false;

      setStatusText('AI 正在回复...');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') break;
            try {
              const parsed = JSON.parse(data) as {
                choices?: { delta?: { content?: string } }[];
              };
              const delta = parsed.choices?.[0]?.delta?.content ?? '';
              assistantContent += delta;
              if (!messageAdded) {
                messageAdded = true;
                setMessages((prev) => [...prev, { role: 'assistant', content: assistantContent }]);
                setStatusText('AI 正在回复...');
              } else {
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: 'assistant', content: assistantContent };
                  return updated;
                });
              }
            } catch {
              // ignore parse errors on streaming chunks
            }
          }
        }
      }
      if (!messageAdded && assistantContent === '') {
        setMessages((prev) => [...prev, { role: 'assistant', content: '（AI 没有返回内容，请检查 API 配置）' }]);
      }
      setStatusText('');
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : '请求失败，请检查网络连接和 API 配置';
      setError(errMsg);
    } finally {
      setLoading(false);
      setStreaming(false);
    }
  }

  // 统一 ENTER = 发送，Shift+Enter = 换行
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // 在流式响应完成后检查工具调用
  const lastAssistantContent = messages.length > 0 ? messages[messages.length - 1] : null;
  useEffect(() => {
    if (!streaming && lastAssistantContent?.role === 'assistant' && lastAssistantContent.content) {
      const toolCall = parseToolCall(lastAssistantContent.content);
      if (toolCall) {
        (async () => {
          setStatusText('正在执行操作...');
          const result = await executeToolCall(toolCall);
          setStatusText('');
          // 将工具调用结果添加到对话中
          setMessages((prev) => [...prev, { role: 'system', content: `🔧 工具执行结果：${result}` }]);
        })();
      }
    }
  }, [streaming, lastAssistantContent]);

  // 嵌入式样式：不固定定位
  const containerClass = embedded
    ? 'w-full rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-lg flex flex-col overflow-hidden'
    : 'fixed bottom-20 right-4 z-50 w-80 sm:w-96 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-2xl flex flex-col overflow-hidden';

  return (
    <>
      {/* Chat window */}
      {open && (
        <div className={containerClass} style={{ height: embedded ? '400px' : '480px' }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--card-border)] bg-[var(--card)]">
            <div className="flex items-center gap-2">
              <span className="material-icons-round text-[#4285F4] text-lg">smart_toy</span>
              <span className="text-sm font-semibold text-[var(--foreground)]">{embeddedTitle}</span>
              {statusText && (
                <span className="text-xs text-[var(--muted-foreground)] animate-pulse">{statusText}</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {!embedded && (
                <button
                  onClick={() => setOpen(false)}
                  className="p-1 rounded hover:bg-[var(--background)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                >
                  <span className="material-icons-round text-base">close</span>
                </button>
              )}
              <button
                onClick={() => setMessages([])}
                title="清空对话"
                className="p-1 rounded hover:bg-[var(--background)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
              >
                <span className="material-icons-round text-base">delete_sweep</span>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <p className="text-center text-sm text-[var(--muted-foreground)] mt-8">
                👋 有什么可以帮助你的？<br />
                <span className="text-xs opacity-70">Enter 发送，Shift+Enter 换行</span>
              </p>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm break-words ${
                    msg.role === 'user'
                      ? 'bg-[#4285F4] text-white rounded-br-sm'
                      : 'bg-[var(--background)] text-[var(--foreground)] border border-[var(--card-border)] rounded-bl-sm'
                  }`}
                >
                  {msg.role === 'assistant' ? (
                    msg.content ? (
                      <MarkdownRenderer content={msg.content} />
                    ) : streaming ? (
                      <span className="flex items-center gap-2">
                        <span className="inline-flex gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#4285F4] animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-[#4285F4] animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-[#4285F4] animate-bounce" style={{ animationDelay: '300ms' }} />
                        </span>
                      </span>
                    ) : null
                  ) : (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  )}
                </div>
              </div>
            ))}
            {/* Loading indicator - shows dots when waiting for first response */}
            {loading && !streaming && messages[messages.length - 1]?.role !== 'assistant' && (
              <div className="flex justify-start">
                <div className="bg-[var(--background)] border border-[var(--card-border)] rounded-2xl rounded-bl-sm px-4 py-2">
                  <span className="inline-flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--muted-foreground)] animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--muted-foreground)] animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--muted-foreground)] animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                </div>
              </div>
            )}
            {error && (
              <p className="text-xs text-[#EA4335] bg-[#EA4335]/10 rounded-lg px-3 py-2">{error}</p>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="flex items-end gap-2 p-3 border-t border-[var(--card-border)]">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter 发送，Shift+Enter 换行"
              disabled={loading}
              rows={1}
              className="flex-1 resize-none rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4] disabled:opacity-60 transition-colors"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className="p-2 rounded-xl bg-[#4285F4] text-white hover:bg-[#3367d6] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
            >
              <span className="material-icons-round text-base">send</span>
            </button>
          </div>
        </div>
      )}

      {/* FAB - 仅当非嵌入式时显示 */}
      {!embedded && (
        <button
          onClick={() => setOpen((v) => !v)}
          className="fixed bottom-4 right-4 z-50 w-12 h-12 rounded-full bg-[#4285F4] text-white shadow-lg hover:bg-[#3367d6] hover:shadow-xl active:scale-95 transition-all flex items-center justify-center"
          title="AI 助手"
        >
          <span className="material-icons-round text-xl">
            {open ? 'close' : 'smart_toy'}
          </span>
        </button>
      )}
    </>
  );
}
