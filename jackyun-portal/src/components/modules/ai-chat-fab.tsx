'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { callAiApi, getAiConfig } from '@/lib/ai-config';
import { getToolsDescription, parseToolCall, parseToolCalls, executeToolCall, ToolScope } from '@/lib/ai-tools';
import { speakWithConfig, stopSpeaking, isAutoSpeakAiEnabled, extractTtsText, extractDualLangText, getTtsConfig, isSpeaking } from '@/lib/tts-config';
import MarkdownRenderer from './markdown-renderer';
import 'katex/dist/katex.min.css';

// ── Conversation types ──────────────────────────────────────────────────────

type ConversationSource = 'dashboard' | 'control' | 'study-guide' | 'study' | 'quiz' | 'vocab' | 'music' | 'poem' | 'settings' | 'goal' | 'relax' | 'countdown' | 'tools' | 'other';

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  source: ConversationSource;
  createdAt: string;
  updatedAt: string;
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// ── Constants ───────────────────────────────────────────────────────────────

const STORAGE_KEY = 'jackyun-ai-conversations';
const ACTIVE_ID_KEY = 'jackyun-ai-active-conversation';
const MAX_CONTEXT_ROUNDS = 30; // 保留最近 30 轮（60 条消息）
const MAX_CONVERSATIONS = 50; // 最多保留 50 个对话

interface AiChatFabProps {
  scope?: ToolScope;
  systemPromptSuffix?: string;
  embedded?: boolean;
  embeddedTitle?: string;
  /** 当前页面路径（用于 source 标记） */
  currentPath?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function getSourceFromPath(path: string): ConversationSource {
  if (!path || path === '/' || path === '/dashboard') return 'dashboard';
  const p = path.replace(/^\//, '').split('/')[0];
  const map: Record<string, ConversationSource> = {
    control: 'control',
    'study-guide': 'study-guide',
    study: 'study',
    quiz: 'quiz',
    vocab: 'vocab',
    music: 'music',
    poem: 'poem',
    settings: 'settings',
    goal: 'goal',
    relax: 'relax',
    countdown: 'countdown',
    tools: 'tools',
  };
  return map[p] || 'other';
}

function getSourceLabel(source: ConversationSource): string {
  const labels: Record<ConversationSource, string> = {
    dashboard: '🏠 主页',
    control: '📋 日程中心',
    'study-guide': '📖 学习指导',
    study: '📚 学习计划',
    quiz: '🧠 QuizWise',
    vocab: '📝 词汇',
    music: '🎵 音乐',
    poem: '📜 诗词',
    settings: '⚙️ 设置',
    goal: '🎯 目标',
    relax: '🎮 放松',
    countdown: '⏱ 倒计时',
    tools: '🔧 工具',
    other: '💬 通用',
  };
  return labels[source] || '💬 通用';
}

function truncateConversation(conv: Conversation): Conversation {
  const msgs = conv.messages;
  if (msgs.length <= MAX_CONTEXT_ROUNDS * 2) return conv;
  const nonSystem = msgs.filter(m => m.role !== 'system');
  const kept = nonSystem.slice(-MAX_CONTEXT_ROUNDS * 2);
  const systemMsgs = msgs.filter(m => m.role === 'system').slice(-2);
  return { ...conv, messages: [...kept, ...systemMsgs] };
}

// ── Storage ─────────────────────────────────────────────────────────────────

function loadConversations(): Conversation[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Conversation[];
  } catch { return []; }
}

function saveConversations(convs: Conversation[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(convs));
  } catch { /* localStorage full */ }
}

function loadActiveId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACTIVE_ID_KEY);
}

function saveActiveId(id: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ACTIVE_ID_KEY, id);
}

// ── TTS Subtitle Portal Component ──────────────────────────────────────────

function TtsSubtitle({
  text,
  visible,
  onClose,
}: {
  text: string;
  visible: boolean;
  onClose: () => void;
}) {
  if (typeof window === 'undefined') return null;
  if (!visible || !text) return null;

  const ttsConfig = getTtsConfig();
  const lang = ttsConfig.ttsLanguage || 'zh-CN';
  const langLabel = lang === 'en-US' ? 'EN' : '中';

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        bottom: '60px',
        left: '50%',
        translate: '-50% 0',
        zIndex: 9999,
        maxWidth: '90vw',
        width: 'auto',
        padding: '10px 20px',
        borderRadius: '12px',
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,0.15)',
        color: '#fff',
        textAlign: 'center',
        cursor: 'pointer',
        transition: 'opacity 0.2s ease',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
        <span
          style={{
            fontSize: '10px',
            fontWeight: 700,
            padding: '2px 6px',
            borderRadius: '4px',
            background: lang === 'en-US' ? '#1565C0' : '#2E7D32',
            color: '#fff',
            flexShrink: 0,
          }}
        >
          {langLabel}
        </span>
        <span
          style={{
            fontSize: '15px',
            fontWeight: 500,
            lineHeight: 1.4,
            letterSpacing: '0.3px',
            textShadow: '0 1px 4px rgba(0,0,0,0.3)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {text}
        </span>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            color: '#FF5252',
            flexShrink: 0,
            marginLeft: '4px',
          }}
        >
          ✕
        </span>
      </div>
    </div>,
    document.body
  );
}

// ── Component ───────────────────────────────────────────────────────────────

export default function AiChatFab({
  scope = 'global',
  systemPromptSuffix = '',
  embedded = false,
  embeddedTitle = 'AI 助手',
  currentPath: propPath,
}: AiChatFabProps) {
  const pathname = usePathname();
  const currentPath = propPath || pathname || '';
  const [open, setOpen] = useState(embedded);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvIdState] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string>('');
  const [speakingMsgIndex, setSpeakingMsgIndex] = useState<number | null>(null);
  // TTS subtitle: 使用 extractTtsText 获取实际朗读文本，显示在屏幕中下方
  const [subtitleText, setSubtitleText] = useState('');
  const [subtitleVisible, setSubtitleVisible] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoSpeakDoneRef = useRef(false);
  const initializedRef = useRef(false);
  const isBusyRef = useRef(false);
  const requestIdRef = useRef(0);
  const messagesRef = useRef<Message[]>([]);
  // 同步的当前会话 ID ref（避免 state 异步更新导致的首次对话消息丢失问题）
  const activeConvIdRef = useRef<string | null>(null);

  // 同步 ref 和 state 的会话 ID 设置函数
  const setActiveConvId = useCallback((id: string | null) => {
    activeConvIdRef.current = id;
    setActiveConvIdState(id);
  }, []);

  const activeConv = conversations.find(c => c.id === activeConvId);
  const messages = activeConv?.messages ?? [];
  messagesRef.current = messages;

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const loaded = loadConversations();
    setConversations(loaded);
    const activeId = loadActiveId();
    if (activeId && loaded.some(c => c.id === activeId)) {
      setActiveConvId(activeId);
    } else if (loaded.length > 0) {
      setActiveConvId(loaded[0].id);
    } else {
      createNewConversation();
    }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, streaming]);

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  };
  useEffect(() => { autoResize(); }, [input]);

  useEffect(() => {
    if (open) setTimeout(() => textareaRef.current?.focus(), 100);
  }, [open]);

  const createNewConversation = useCallback(() => {
    const source = getSourceFromPath(currentPath);
    const newConv: Conversation = {
      id: generateId(),
      title: '新对话',
      messages: [],
      source,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setConversations(prev => {
      const updated = [newConv, ...prev].slice(0, MAX_CONVERSATIONS);
      saveConversations(updated);
      return updated;
    });
    setActiveConvId(newConv.id);
    setSidebarOpen(false);
    return newConv;
  }, [currentPath, setActiveConvId]);

  const switchConversation = (id: string) => {
    setActiveConvId(id);
    saveActiveId(id);
    setSidebarOpen(false);
    setError(null);
  };

  const deleteConversation = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConversations(prev => {
      const updated = prev.filter(c => c.id !== id);
      saveConversations(updated);
      return updated;
    });
    if (activeConvId === id) {
      const remaining = conversations.filter(c => c.id !== id);
      if (remaining.length > 0) {
        setActiveConvId(remaining[0].id);
        saveActiveId(remaining[0].id);
      } else {
        createNewConversation();
      }
    }
  };

  const updateConversation = useCallback((updater: (prev: Conversation) => Conversation, targetConvId?: string) => {
    const targetId = targetConvId || activeConvIdRef.current || activeConvId;
    setConversations(prev => {
      const updated = prev.map(c => {
        if (c.id !== targetId) return c;
        const newConv = updater(c);
        return truncateConversation(newConv);
      });
      saveConversations(updated);
      return updated;
    });
  }, [activeConvId]);

  function getSystemMessage(): Message {
    const toolsDesc = getToolsDescription(scope);
    const source = getSourceFromPath(currentPath);
    const pageContext = getPageContext(source);

    const scopeName = {
      global: `你是 JackYun Portal 的**全局智能管家**，掌管整个平台的所有功能。`,
      quiz: '你是 QuizWise 题目的智能辅导老师，可以帮助分析题目、批改答案。',
      plan: '你是学习计划助手，可以帮助管理学习进度、安排计划。',
      control: '你是日程中心助手，可以帮助管理时间表、控制计时和音乐。',
      study_guide: '你是 JackYun Portal 的**学习指导导师（StudyGuide）**，专注于帮助用户掌握高效学习方法。',
    };

    let content = `${scopeName[scope] || scopeName.global}\n\n`;
    content += `【当前页面】\n${pageContext}\n\n`;
    content += `${toolsDesc}\n${systemPromptSuffix}`.trim();
    return { role: 'system', content };
  }

  function getPageContext(source: ConversationSource): string {
    const contexts: Record<ConversationSource, string> = {
      dashboard: '你当前在「主页仪表盘 (Dashboard)」\n- 你可以看到学习统计概览（词汇数、任务完成率）\n- 这里有所有功能模块的入口卡片\n- 用户可以通过你说「打开xxx」来跳转到任何功能页面\n\n【全局管理权限说明】\n你可以管理以下所有模块的数据（但界面操作依然由各页面负责）：\n1. 📋 **日程中心 (TimetableHub)** — 读取和修改日程安排、事件\n2. 🎯 **目标管理 (Goal)** — 读取和创建/修改/删除目标数据（进度、截止日期、优先级等）\n3. 📚 **学习计划 (StudyPlan)** — 读取学习进度\n4. 🧠 **QuizWise 刷题** — 读取刷题记录\n5. ⏱ **考试倒计时 (IGCountdown)** — 读取和修改考试日期\n\n当用户提出与上述模块相关的需求时，使用对应的工具读取或修改数据。',
      control: '你当前在「日程中心 (Control/Timetable)」\n- 用户可以查看/管理日程安排\n- 可以查看当前任务、标记完成、跳过任务\n- 支持专注计时和音乐播放控制',
      'study-guide': '你当前在「学习指导 (StudyGuide)」\n- 提供「今日」「学习」「习题」「考试」四大板块\n- 帮助用户掌握高效学习方法',
      study: '你当前在「学习计划 (StudyPlan)」\n- 用户可以查看和管理学习进度\n- 支持学科进度追踪和考试倒计时',
      quiz: '你当前在「QuizWise 刷题」\n- 用户可以刷题、分析题目、批改答案',
      vocab: '你当前在「词汇宝库」\n- 用户可以管理英语词汇、复习单词',
      music: '你当前在「音乐播放器」\n- 用户可以浏览歌单、播放音乐',
      poem: '你当前在「诗词天地」\n- 用户可以浏览和背诵经典诗词',
      settings: '你当前在「设置页面」\n- 用户可以配置 AI、TTS、语言、账户等',
      goal: '你当前在「目标管理 (Goal)」\n- 用户可以查看和管理目标进度',
      relax: '你当前在「放松一下」\n- 提供游戏和娱乐功能',
      countdown: '你当前在「倒计时」\n- 用户可以查看重要日期倒计时',
      tools: '你当前在「工具箱」\n- 提供各种实用小工具',
      other: '你当前在 JackYun Portal 中',
    };
    return contexts[source] || contexts.other;
  }

  async function handleSend(retryMessage?: string) {
    const text = retryMessage || input.trim();
    if (!text || loading || isBusyRef.current) return;

    isBusyRef.current = true;
    const requestId = ++requestIdRef.current;

    let convId = activeConvIdRef.current || activeConvId;
    if (!convId) {
      const newConv = createNewConversation();
      convId = newConv.id;
    }
    activeConvIdRef.current = convId;

    updateConversation(conv => ({
      ...conv,
      messages: [...conv.messages, { role: 'user', content: text }],
      updatedAt: new Date().toISOString(),
    }), convId);

    setInput('');
    setLoading(true);
    setStreaming(true);
    setError(null);
    setStatusText('AI 正在思考...');
    autoSpeakDoneRef.current = false;

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      const config = getAiConfig();
      if (!config.baseUrl || !config.apiKey) {
        throw new Error('请先在设置页面配置 AI API Key');
      }

      const latestMsgs = messagesRef.current;
      const filteredMsgs = retryMessage
        ? latestMsgs.slice(0, -1)
        : latestMsgs;

      const apiMessages = [getSystemMessage(), ...filteredMsgs];

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
      let displayContent = '';
      let messageAdded = false;

      setStatusText('AI 正在回复...');

      // Use streaming buffer for controlled display speed
      streamBufferRef.current = [];

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
              if (!delta) continue;
              // Store full content (for tool_call parsing later)
              assistantContent += delta;
              // Push chars to display buffer
              streamBufferRef.current.push(...delta.split(''));
            } catch {
              // ignore
            }
          }
        }
      }

      // Start the display timer to flush buffer at controlled speed
      if (streamBufferRef.current.length > 0) {
        await new Promise<void>((resolve) => {
          startDisplayTimer(
            (char) => {
              displayContent += char;
              if (!messageAdded) {
                messageAdded = true;
                updateConversation(conv => ({
                  ...conv,
                  messages: [...conv.messages, { role: 'assistant', content: displayContent }],
                  updatedAt: new Date().toISOString(),
                }));
                setStatusText('AI 正在回复...');
              } else {
                updateConversation(conv => {
                  const updated = [...conv.messages];
                  updated[updated.length - 1] = { role: 'assistant', content: displayContent };
                  return { ...conv, messages: updated, updatedAt: new Date().toISOString() };
                });
              }
            },
            () => {
              resolve();
            }
          );
        });
      }

      // Ensure assistantContent (full, not display-limited) is in the conversation
      if (!messageAdded && assistantContent === '') {
        updateConversation(conv => ({
          ...conv,
          messages: [...conv.messages, { role: 'assistant', content: '（AI 没有返回内容，请检查 API 配置）' }],
          updatedAt: new Date().toISOString(),
        }));
      }
      setStatusText('');
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : '请求失败，请检查网络连接和 API 配置';
      setError(errMsg);
    } finally {
      setLoading(false);
      setStreaming(false);
      if (requestIdRef.current === requestId) {
        isBusyRef.current = false;
      }
    }
  }

  const prevStreamingRef = useRef(false);
  useEffect(() => {
    if (prevStreamingRef.current === true && streaming === false && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.role === 'assistant' && lastMsg.content && isAutoSpeakAiEnabled()) {
        const ttsText = extractTtsText(lastMsg.content);
        if (ttsText) {
          setSpeakingMsgIndex(messages.length - 1);
          // 自动朗读时更新字幕为 TTS 实际朗读的文本，显示在屏幕中下方
          setSubtitleText(ttsText);
          setSubtitleVisible(true);
          speakWithConfig(ttsText, undefined, () => {
            setSpeakingMsgIndex(null);
            setSubtitleVisible(false);
            setSubtitleText('');
          });
        }
      }
    }
    prevStreamingRef.current = streaming;
  }, [streaming, messages]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleSpeak(content: string, index: number) {
    if (speakingMsgIndex === index) {
      stopSpeaking();
      setSpeakingMsgIndex(null);
      setSubtitleVisible(false);
      setSubtitleText('');
      return;
    }
    stopSpeaking();
    const ttsText = extractTtsText(content);
    if (ttsText) {
      setSpeakingMsgIndex(index);
      // 使用 extractTtsText（TTS 实际朗读的文本）作为字幕内容
      setSubtitleText(ttsText);
      setSubtitleVisible(true);
      speakWithConfig(ttsText, undefined, () => {
        setSpeakingMsgIndex(null);
        setSubtitleVisible(false);
        setSubtitleText('');
      });
    }
  }

  function handleSubtitleClick() {
    stopSpeaking();
    setSpeakingMsgIndex(null);
    setSubtitleVisible(false);
    setSubtitleText('');
  }

  async function handleCopy(content: string, index: number) {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = content;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    }
  }

  function handleRetry() {
    if (loading || !activeConv) return;
    const lastUserMsg = [...activeConv.messages].reverse().find(m => m.role === 'user');
    if (lastUserMsg) {
      handleSend(lastUserMsg.content);
    }
  }

  // 过滤 tool_call 代码块，不让用户看见
  function stripToolCalls(content: string): string {
    return content.replace(/```tool_call[\s\S]*?```/g, '');
  }

  // 过滤所有 AI 内部标签（tool_call / TTS_LANG / TITLE）不显示给用户
  function stripTags(content: string): string {
    return content
      .replace(/```tool_call[\s\S]*?```/g, '')
      .replace(/\[TTS_LANG:[^\]]*\][\s\S]*?\[\/TTS_LANG\]/g, '')
      .replace(/\[TTS\][\s\S]*?\[\/TTS\]/g, '')
      .replace(/\[TITLE\][\s\S]*?\[\/TITLE\]/g, '')
      .trim();
  }

  // 从 AI 回复中提取 [TITLE] 标签（用于对话标题）
  function extractTitle(content: string): string | null {
    const match = content.match(/\[TITLE\]([\s\S]*?)\[\/TITLE\]/);
    return match ? match[1].trim() : null;
  }

  // 流式响应完成后检查工具调用 + 提取对话标题
  const lastAssistantContent = messages.length > 0 ? messages[messages.length - 1] : null;
  useEffect(() => {
    if (!streaming && lastAssistantContent?.role === 'assistant' && lastAssistantContent.content) {
      // 提取 [TITLE] 标签设置对话标题（仅第一次对话）
      const title = extractTitle(lastAssistantContent.content);
      if (title && activeConv) {
        const userMsgCount = activeConv.messages.filter(m => m.role === 'user').length;
        if (userMsgCount === 1 && activeConv.title === '新对话') {
          const convId = activeConv.id;
          setConversations(prev => {
            const updated = prev.map(c => {
              if (c.id !== convId) return c;
              return { ...c, title: title.slice(0, 30) };
            });
            saveConversations(updated);
            return updated;
          });
        }
      }

      // 检查工具调用（支持多个）
      const toolCalls = parseToolCalls(lastAssistantContent.content);
      if (toolCalls.length > 0) {
        (async () => {
          isBusyRef.current = true;
          setStatusText('正在执行操作...');
          for (let i = 0; i < toolCalls.length; i++) {
            const tc = toolCalls[i];
            setStatusText(toolCalls.length > 1 ? `正在执行操作 (${i + 1}/${toolCalls.length})...` : '正在执行操作...');
            const result = await executeToolCall(tc);
            updateConversation(conv => ({
              ...conv,
              messages: [...conv.messages, { role: 'system', content: `🔧 工具执行结果：${result}` }],
              updatedAt: new Date().toISOString(),
            }));
          }
          setStatusText('');
          isBusyRef.current = false;
        })();
      }
    }
  }, [streaming, lastAssistantContent]);

  const containerClass = embedded
    ? 'w-full rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-lg flex flex-col overflow-hidden'
    : 'fixed bottom-20 right-4 z-50 w-96 sm:w-[480px] rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-2xl flex flex-col overflow-hidden';

  // ════════════════════════════════════════════════════════
  // Streaming speed control
  // ════════════════════════════════════════════════════════
  // slow=🐢慢速逐字, normal=⚡中速逐字, instant=🐇不限速（直接显示全部）
  const SPEED_PRESETS = { slow: 60, normal: 35, instant: 0 }; // ms per character (0=不限速)
  type SpeedPresetType = 'slow' | 'normal' | 'instant';
  const [speedPreset, setSpeedPreset] = useState<SpeedPresetType>('normal');
  const streamBufferRef = useRef<string[]>([]);
  const streamTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Called to flush buffered characters to UI at controlled speed
  const startDisplayTimer = useCallback((onChar: (char: string) => void, onDone: () => void) => {
    if (streamTimerRef.current) clearInterval(streamTimerRef.current);

    // 不限速模式：直接显示全部内容
    if (SPEED_PRESETS[speedPreset] === 0) {
      let buffer = streamBufferRef.current;
      while (buffer.length > 0) {
        onChar(buffer.shift()!);
      }
      onDone();
      return;
    }

    const ms = SPEED_PRESETS[speedPreset];
    streamTimerRef.current = setInterval(() => {
      if (streamBufferRef.current.length > 0) {
        onChar(streamBufferRef.current.shift()!);
      }
    }, ms);
    // Also check periodically if buffer is drained
    const checkDone = setInterval(() => {
      if (streamBufferRef.current.length === 0) {
        if (streamTimerRef.current) clearInterval(streamTimerRef.current);
        streamTimerRef.current = null;
        clearInterval(checkDone);
        onDone();
      }
    }, 100);
  }, [speedPreset]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (streamTimerRef.current) clearInterval(streamTimerRef.current);
    };
  }, []);

  return (
    <>
      {open && (
        <div className={containerClass} style={{ height: embedded ? '100%' : '620px' }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--card-border)] bg-[var(--card)]">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <button
                onClick={() => setSidebarOpen(v => !v)}
                className="p-1 rounded hover:bg-[var(--background)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors flex-shrink-0"
                title="对话列表"
              >
                <span className="material-icons-round text-base">menu</span>
              </button>
              <span className="material-icons-round text-[#4285F4] text-lg flex-shrink-0">smart_toy</span>
              <span className="text-sm font-semibold text-[var(--foreground)] truncate">
                {activeConv?.title || embeddedTitle}
              </span>
              {activeConv && (
                <span className="text-[10px] text-[var(--muted-foreground)] bg-[var(--background)] rounded px-1.5 py-0.5 flex-shrink-0">
                  {getSourceLabel(activeConv.source)}
                </span>
              )}
              {statusText && (
                <span className="text-xs text-[var(--muted-foreground)] animate-pulse truncate">{statusText}</span>
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {/* Speed control: 🐢慢 → ⚡中 → 🐇不限速 */}
              <div className="flex items-center gap-0.5 mr-1">
                <button
                  onClick={() => setSpeedPreset('slow')}
                  className={`p-1 rounded text-xs transition-colors ${speedPreset === 'slow' ? 'text-[#4285F4] bg-[#4285F4]/10' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`}
                  title="慢速（逐字显示）"
                >🐢</button>
                <button
                  onClick={() => setSpeedPreset('normal')}
                  className={`p-1 rounded text-xs transition-colors ${speedPreset === 'normal' ? 'text-[#4285F4] bg-[#4285F4]/10' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`}
                  title="中速（逐字显示）"
                >⚡</button>
                <button
                  onClick={() => setSpeedPreset('instant')}
                  className={`p-1 rounded text-xs transition-colors ${speedPreset === 'instant' ? 'text-[#4285F4] bg-[#4285F4]/10' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`}
                  title="不限速（直接显示全部）"
                >🐇</button>
              </div>
              <button
                onClick={createNewConversation}
                title="新建对话"
                className="p-1 rounded hover:bg-[var(--background)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
              >
                <span className="material-icons-round text-base">add</span>
              </button>
              {!embedded && (
                <button
                  onClick={() => setOpen(false)}
                  className="p-1 rounded hover:bg-[var(--background)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                >
                  <span className="material-icons-round text-base">close</span>
                </button>
              )}
            </div>
          </div>

          {/* Conversation list sidebar */}
          {sidebarOpen && (
            <div className="border-b border-[var(--card-border)] max-h-48 overflow-y-auto bg-[var(--background)]">
              {conversations.length === 0 ? (
                <p className="text-center text-xs text-[var(--muted-foreground)] py-4">暂无对话记录</p>
              ) : (
                conversations.map(conv => (
                  <div
                    key={conv.id}
                    onClick={() => switchConversation(conv.id)}
                    className={`flex items-center gap-2 px-4 py-2 cursor-pointer text-sm transition-colors ${
                      conv.id === activeConvId
                        ? 'bg-[#4285F4]/10 text-[#4285F4]'
                        : 'text-[var(--foreground)] hover:bg-[var(--card)]'
                    }`}
                  >
                    <span className="material-icons-round text-sm flex-shrink-0">chat</span>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-xs">{conv.title}</p>
                      <p className="text-[10px] text-[var(--muted-foreground)]">
                        {getSourceLabel(conv.source)} · {new Date(conv.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={(e) => deleteConversation(conv.id, e)}
                      className="p-1 rounded hover:bg-[#EA4335]/10 text-[var(--muted-foreground)] hover:text-[#EA4335] transition-colors flex-shrink-0"
                      title="删除"
                    >
                      <span className="material-icons-round text-sm">delete</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <p className="text-center text-sm text-[var(--muted-foreground)] mt-8">
                👋 有什么可以帮助你的？<br />
                <span className="text-xs opacity-70">Enter 发送，Shift+Enter 换行</span>
              </p>
            )}
            {messages.map((msg, i) => (
              <div key={i}>
                <div
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm break-words ${
                      msg.role === 'user'
                        ? 'bg-[#4285F4] text-white rounded-br-sm'
                        : msg.role === 'system'
                        ? 'bg-[#FFF8E1] text-[#795548] border border-[#FFE082] rounded text-xs w-full text-center'
                        : 'bg-[var(--background)] text-[var(--foreground)] border border-[var(--card-border)] rounded-bl-sm'
                    }`}
                  >
                    {msg.role === 'assistant' ? (
                      msg.content ? (
                        <MarkdownRenderer content={stripTags(msg.content)} />
                      ) : streaming && i === messages.length - 1 ? (
                        <span className="flex items-center gap-2">
                          <span className="inline-flex gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#4285F4] animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-1.5 h-1.5 rounded-full bg-[#4285F4] animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-1.5 h-1.5 rounded-full bg-[#4285F4] animate-bounce" style={{ animationDelay: '300ms' }} />
                          </span>
                        </span>
                      ) : null
                    ) : msg.role === 'system' ? (
                      <span className="whitespace-pre-wrap text-xs">{msg.content}</span>
                    ) : (
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                    )}
                  </div>
                </div>

                {msg.role === 'assistant' && msg.content && !streaming && (
                  <div className="flex items-center gap-1 mt-1 ml-1">
                    <button
                      onClick={() => handleSpeak(msg.content, i)}
                      title={speakingMsgIndex === i ? '停止朗读' : '朗读'}
                      className={`p-1 rounded-full transition-colors ${
                        speakingMsgIndex === i
                          ? 'text-[#4285F4] bg-[#4285F4]/10 animate-pulse'
                          : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--background)]'
                      }`}
                    >
                      <span className="material-icons-round text-sm">volume_up</span>
                    </button>
                    <button
                      onClick={() => handleCopy(msg.content, i)}
                      title="复制"
                      className={`p-1 rounded-full transition-colors ${
                        copiedIndex === i
                          ? 'text-green-500'
                          : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--background)]'
                      }`}
                    >
                      <span className="material-icons-round text-sm">
                        {copiedIndex === i ? 'check' : 'content_copy'}
                      </span>
                    </button>
                    {i === messages.length - 1 && messages.filter(m => m.role === 'user').length > 0 && (
                      <button
                        onClick={handleRetry}
                        title="重新生成"
                        disabled={loading}
                        className="p-1 rounded-full text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--background)] transition-colors disabled:opacity-50"
                      >
                        <span className="material-icons-round text-sm">replay</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
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
              onClick={() => handleSend()}
              disabled={!input.trim() || loading}
              className="p-2 rounded-xl bg-[#4285F4] text-white hover:bg-[#3367d6] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
            >
              <span className="material-icons-round text-base">send</span>
            </button>
          </div>
        </div>
      )}

      {/* FAB */}
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

      {/* 全局 TTS 字幕 — 使用 Portal 渲染到屏幕中下方，显示 TTS 实际朗读文本 */}
      <TtsSubtitle
        text={subtitleText}
        visible={subtitleVisible}
        onClose={handleSubtitleClick}
      />
    </>
  );
}