'use client';

import { useState, useEffect, useRef } from 'react';
import type { ChatMessage } from '@/types/relax';
import { chatWithAI, getChatHistory, saveChatMessage, clearChatHistory } from '@/actions/relax';

interface Props {
  hasApiKey: boolean;
  theme: 'default' | 'dragon' | 'eri';
}

export default function AIChat({ hasApiKey, theme }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    getChatHistory().then((history) => {
      setMessages(history);
      setLoadingHistory(false);
    });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const speakText = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    window.speechSynthesis.speak(utterance);
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    await saveChatMessage('user', text);

    const aiResponse = await chatWithAI(newMessages);
    const aiMsg: ChatMessage = { role: 'assistant', content: aiResponse };
    setMessages((prev) => [...prev, aiMsg]);
    await saveChatMessage('assistant', aiResponse);
    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleClear = async () => {
    await clearChatHistory();
    setMessages([]);
  };

  const isDragon = theme === 'dragon';
  const isEri = theme === 'eri';

  const bubbleBg = {
    user: isDragon ? '#1d4ed8' : isEri ? '#f9a8d4' : 'var(--primary)',
    userText: isDragon ? '#e2e8f0' : isEri ? '#831843' : 'var(--primary-foreground)',
    ai: isDragon ? '#1e293b' : isEri ? '#fce7f3' : 'var(--muted)',
    aiText: isDragon ? '#94a3b8' : isEri ? '#9d174d' : 'var(--muted-foreground)',
  };

  return (
    <div
      className="flex flex-col h-full"
      style={{ color: isDragon ? '#e2e8f0' : isEri ? '#831843' : 'var(--foreground)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <span className="text-lg">🤖</span>
          <span className="font-semibold text-sm">Sanctuary AI</span>
          {!hasApiKey && (
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{ background: isDragon ? '#7f1d1d' : '#fee2e2', color: '#dc2626' }}
            >
              未配置
            </span>
          )}
        </div>
        <button
          onClick={handleClear}
          className="text-xs opacity-50 hover:opacity-100 transition-opacity"
          title="清除聊天记录"
        >
          清除
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">
        {loadingHistory ? (
          <div className="text-center text-xs opacity-50 mt-8">加载中...</div>
        ) : messages.length === 0 ? (
          <div className="text-center text-xs opacity-40 mt-8 leading-relaxed">
            👋 你好！我是Sanctuary AI
            <br />
            有什么我可以帮你的吗？
          </div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={msg.id ?? i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className="max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed cursor-pointer select-text"
                style={{
                  background: msg.role === 'user' ? bubbleBg.user : bubbleBg.ai,
                  color: msg.role === 'user' ? bubbleBg.userText : bubbleBg.aiText,
                  borderBottomRightRadius: msg.role === 'user' ? '4px' : undefined,
                  borderBottomLeftRadius: msg.role === 'assistant' ? '4px' : undefined,
                }}
                onClick={() => msg.role === 'assistant' && speakText(msg.content)}
                title={msg.role === 'assistant' ? '点击朗读' : undefined}
              >
                {msg.content}
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="flex justify-start">
            <div
              className="rounded-2xl rounded-bl-sm px-3 py-2 text-sm"
              style={{ background: bubbleBg.ai, color: bubbleBg.aiText }}
            >
              <span className="inline-flex gap-1">
                <span className="animate-bounce" style={{ animationDelay: '0ms' }}>·</span>
                <span className="animate-bounce" style={{ animationDelay: '150ms' }}>·</span>
                <span className="animate-bounce" style={{ animationDelay: '300ms' }}>·</span>
              </span>
              &nbsp;AI思考中...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="mt-3 flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={hasApiKey ? '发消息… (Enter发送, Shift+Enter换行)' : 'AI服务未配置'}
          disabled={!hasApiKey || loading}
          rows={2}
          className="flex-1 resize-none rounded-xl border px-3 py-2 text-sm outline-none transition-colors"
          style={{
            background: isDragon ? '#1e293b' : isEri ? '#fdf2f8' : 'var(--input)',
            borderColor: isDragon ? '#334155' : isEri ? '#fbcfe8' : 'var(--border)',
            color: isDragon ? '#e2e8f0' : isEri ? '#831843' : 'var(--foreground)',
          }}
        />
        <button
          onClick={sendMessage}
          disabled={!hasApiKey || loading || !input.trim()}
          className="rounded-xl px-3 py-2 text-sm font-medium transition-opacity disabled:opacity-40"
          style={{
            background: isDragon ? '#1d4ed8' : isEri ? '#f9a8d4' : 'var(--primary)',
            color: isDragon ? '#e2e8f0' : isEri ? '#831843' : 'var(--primary-foreground)',
          }}
        >
          发送
        </button>
      </div>
    </div>
  );
}
