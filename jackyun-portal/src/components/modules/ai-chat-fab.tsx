'use client';

import { useState, useRef, useEffect } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function AiChatFab() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    const newMessages: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let assistantContent = '';
      let messageAdded = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        // Parse SSE lines
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
              } else {
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: 'assistant', content: assistantContent };
                  return updated;
                });
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      }
      if (!messageAdded && assistantContent === '') {
        setMessages((prev) => [...prev, { role: 'assistant', content: '（无响应）' }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '请求失败');
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <>
      {/* Chat window */}
      {open && (
        <div
          className="fixed bottom-20 right-4 z-50 w-80 sm:w-96 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-2xl flex flex-col overflow-hidden"
          style={{ height: '480px' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--card-border)] bg-[var(--card)]">
            <div className="flex items-center gap-2">
              <span className="material-icons-round text-[#4285F4] text-lg">smart_toy</span>
              <span className="text-sm font-semibold text-[var(--foreground)]">AI 助手</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setMessages([])}
                title="清空对话"
                className="p-1 rounded hover:bg-[var(--background)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
              >
                <span className="material-icons-round text-base">delete_sweep</span>
              </button>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded hover:bg-[var(--background)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
              >
                <span className="material-icons-round text-base">close</span>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <p className="text-center text-sm text-[var(--muted-foreground)] mt-8">
                有什么可以帮助你的？
              </p>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                    msg.role === 'user'
                      ? 'bg-[#4285F4] text-white rounded-br-sm'
                      : 'bg-[var(--background)] text-[var(--foreground)] border border-[var(--card-border)] rounded-bl-sm'
                  }`}
                >
                  {msg.content || (msg.role === 'assistant' && loading ? '...' : '')}
                </div>
              </div>
            ))}
            {loading && messages[messages.length - 1]?.role !== 'assistant' && (
              <div className="flex justify-start">
                <div className="bg-[var(--background)] border border-[var(--card-border)] rounded-2xl rounded-bl-sm px-3 py-2 text-sm text-[var(--muted-foreground)]">
                  ...
                </div>
              </div>
            )}
            {error && (
              <p className="text-xs text-[#EA4335] bg-[#EA4335]/10 rounded-lg px-2 py-1">{error}</p>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="flex items-center gap-2 p-3 border-t border-[var(--card-border)]">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入消息…"
              disabled={loading}
              className="flex-1 rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4] disabled:opacity-60 transition-colors"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className="p-2 rounded-xl bg-[#4285F4] text-white hover:bg-[#3367d6] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <span className="material-icons-round text-base">send</span>
            </button>
          </div>
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-4 right-4 z-50 w-12 h-12 rounded-full bg-[#4285F4] text-white shadow-lg hover:bg-[#3367d6] hover:shadow-xl active:scale-95 transition-all flex items-center justify-center"
        title="AI 助手"
      >
        <span className="material-icons-round text-xl">
          {open ? 'close' : 'smart_toy'}
        </span>
      </button>
    </>
  );
}
