'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { callAiApi, getAiConfig } from '@/lib/ai-config';
import type { BrowserAiWebModel } from '@/lib/browser-ai';
import { readAiStream } from '@/lib/ai-stream';
import MarkdownRenderer from '@/components/modules/markdown-renderer';

const AgentWorkspace = dynamic(() => import('@/components/modules/ai-chat-fab'), { ssr: false, loading: () => <WorkspaceLoading /> });
const STORAGE_KEY = 'jackyun-ai-workspace-chats-v1';

interface ModelOption {
  id: number;
  displayName: string;
  modelId: string;
  providerName: string;
  description: string;
  supportsChat: boolean;
  supportsAgent: boolean;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
  contextWindow: number;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string;
  failed?: boolean;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: string;
}

function id() { return crypto.randomUUID(); }
function newConversation(): Conversation { return { id: id(), title: '新对话', messages: [], updatedAt: new Date().toISOString() }; }

export default function AiWorkspace({ models, planCode, initialMode = 'chat', initialPrompt = '' }: { models: ModelOption[]; planCode: string; initialMode?: 'chat' | 'agent'; initialPrompt?: string }) {
  const [mode, setMode] = useState<'chat' | 'agent'>(initialMode);
  const [personalModel, setPersonalModel] = useState<ModelOption | null>(null);
  const [browserModels, setBrowserModels] = useState<ModelOption[]>([]);
  const [browserModelStatus, setBrowserModelStatus] = useState(() => getAiConfig().providerMode === 'browser' ? '正在读取当前账号可用模型…' : '');
  const [providerMode] = useState(() => getAiConfig().providerMode ?? 'cloud');
  const [browserProvider] = useState(() => getAiConfig().browserProvider ?? 'chatgpt');
  useEffect(() => {
    const config = getAiConfig();
    if (config.providerMode !== 'personal' && config.providerMode !== 'browser') return;
    const label = config.providerMode === 'browser' ? `${config.browserProvider ?? 'Browser'} 网页版` : config.model || '个人 API 模型';
    queueMicrotask(() => setPersonalModel({ id: -1, displayName: label, modelId: config.providerMode === 'browser' ? '' : config.model || label, providerName: config.providerMode === 'browser' ? '本地网页 AI' : '个人 API', description: '使用你的个人配置，不消耗平台套餐额度', supportsChat: true, supportsAgent: true, inputCostPerMillion: 0, outputCostPerMillion: 0, contextWindow: 0 }));
  }, []);
  useEffect(() => {
    if (providerMode !== 'browser') return;
    const requestId = crypto.randomUUID();
    const listener = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'JACKYUN_COMPANION_MODELS' || event.data.requestId !== requestId) return;
      const detected = (Array.isArray(event.data.models) ? event.data.models : []) as BrowserAiWebModel[];
      setBrowserModels(detected.map((item, index) => ({ id: -1000 - index, displayName: item.label, modelId: item.id, providerName: '本地网页 AI', description: `${browserProvider} 当前登录账号可用${item.selected ? ' · 当前已选择' : ''}`, supportsChat: true, supportsAgent: true, inputCostPerMillion: 0, outputCostPerMillion: 0, contextWindow: 0 })));
      setBrowserModelStatus(detected.length ? `已从 ${browserProvider} 读取 ${detected.length} 个模型` : event.data.error || '未读取到模型，将使用网站默认模型');
    };
    window.addEventListener('message', listener);
    window.postMessage({ type: 'JACKYUN_COMPANION_LIST_MODELS', requestId, provider: browserProvider }, window.location.origin);
    const timeout = window.setTimeout(() => setBrowserModelStatus((value) => value.startsWith('正在') ? '模型读取超时，将使用网站默认模型' : value), 10_000);
    return () => { window.clearTimeout(timeout); window.removeEventListener('message', listener); };
  }, [browserProvider, providerMode]);
  const allModels = useMemo(() => providerMode === 'browser' ? (browserModels.length ? browserModels : personalModel ? [personalModel] : []) : personalModel ? [personalModel, ...models] : models, [browserModels, models, personalModel, providerMode]);
  const availableModels = useMemo(() => allModels.filter((model) => mode === 'agent' ? model.supportsAgent : model.supportsChat), [mode, allModels]);
  const [modelId, setModelId] = useState<number>(() => (initialMode === 'agent' ? models.find((model) => model.supportsAgent) : models.find((model) => model.supportsChat))?.id ?? 0);
  const selectedModel = availableModels.find((model) => model.id === modelId) ?? availableModels[0];

  return <div className="mx-auto flex h-[calc(100dvh-8.5rem)] min-h-[620px] max-w-[1600px] flex-col overflow-hidden rounded-[28px] border border-[var(--card-border)] bg-[var(--card)] shadow-[0_24px_80px_rgba(15,23,42,0.10)]">
    <header className="flex min-h-[72px] flex-wrap items-center gap-3 border-b border-[var(--card-border)] px-4 py-3 sm:px-6">
      <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-[#155eef] to-[#7f56d9] text-white shadow-lg shadow-[#155eef]/20"><span className="material-icons-round">auto_awesome</span></div><div><h1 className="text-base font-semibold tracking-tight">JackYun AI</h1><p className="text-xs text-[var(--muted-foreground)]">{planCode.toUpperCase()} 套餐</p></div></div>
      <div className="order-3 grid w-full grid-cols-2 rounded-xl bg-[var(--background)] p-1 sm:order-none sm:ml-4 sm:w-[240px]">
        <ModeButton active={mode === 'chat'} icon="chat_bubble" label="聊天" onClick={() => setMode('chat')} />
        <ModeButton active={mode === 'agent'} icon="smart_toy" label="Agent" onClick={() => setMode('agent')} />
      </div>
      <div className="ml-auto flex min-w-0 items-center gap-2">
        {providerMode === 'browser' && <span className="hidden max-w-[220px] truncate text-xs text-[var(--muted-foreground)] lg:inline" title={browserModelStatus}>{browserModelStatus}</span>}
        <label className="relative min-w-0"><span className="sr-only">选择模型</span><select value={selectedModel?.id ?? 0} onChange={(event) => setModelId(Number(event.target.value))} disabled={!availableModels.length} className="h-10 max-w-[230px] appearance-none rounded-xl border border-[var(--card-border)] bg-[var(--background)] py-0 pl-3 pr-9 text-sm font-medium outline-none focus:border-[#155eef] disabled:opacity-60"><option value={0}>{availableModels.length ? '选择模型' : '当前套餐暂无模型'}</option>{availableModels.map((model) => <option key={model.id} value={model.id}>{model.displayName} · {model.providerName}</option>)}</select><span className="material-icons-round pointer-events-none absolute right-2.5 top-2.5 text-lg text-[var(--muted-foreground)]">expand_more</span></label>
        <Link href="/settings?section=ai" aria-label="AI 设置" className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--card-border)] text-[var(--muted-foreground)] transition hover:bg-[var(--background)] hover:text-[var(--foreground)]"><span className="material-icons-round text-xl">settings</span></Link>
      </div>
    </header>

    {selectedModel && <div className="flex min-h-10 items-center gap-2 border-b border-[var(--card-border)] bg-[var(--background)]/70 px-4 text-xs text-[var(--muted-foreground)] sm:px-6"><span className={`h-2 w-2 rounded-full ${selectedModel.supportsAgent ? 'bg-[#7f56d9]' : 'bg-[#17b26a]'}`} /><span className="truncate">{selectedModel.description || selectedModel.modelId}</span><span className="ml-auto hidden shrink-0 sm:inline">输入 ¥{selectedModel.inputCostPerMillion}/M · 输出 ¥{selectedModel.outputCostPerMillion}/M{selectedModel.contextWindow ? ` · ${Math.round(selectedModel.contextWindow / 1000)}K 上下文` : ''}</span></div>}

    <div className="min-h-0 flex-1">
      {!selectedModel ? <NoModels planCode={planCode} /> : mode === 'chat' ? <ChatWorkspace model={selectedModel} initialPrompt={initialPrompt} /> : <div className="h-full min-h-0 bg-[var(--background)]"><AgentWorkspace embedded embeddedTitle="Agent 工作台" currentPath="/ai" catalogModelId={selectedModel.id > 0 ? selectedModel.id : undefined} browserModel={selectedModel.id < 0 ? selectedModel.modelId : undefined} /></div>}
    </div>
  </div>;
}

function ModeButton({ active, icon, label, onClick }: { active: boolean; icon: string; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`flex h-10 min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition ${active ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`}><span className="material-icons-round shrink-0 text-lg">{icon}</span><span>{label}</span></button>;
}

function ChatWorkspace({ model, initialPrompt }: { model: ModelOption; initialPrompt: string }) {
  const initialConversation: Conversation = { id: 'initial', title: '新对话', messages: [], updatedAt: '' };
  const [conversations, setConversations] = useState<Conversation[]>([initialConversation]);
  const [activeId, setActiveId] = useState(initialConversation.id);
  const [input, setInput] = useState(initialPrompt);
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [status, setStatus] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const abortReasonRef = useRef<'user' | 'timeout' | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const active = conversations.find((conversation) => conversation.id === activeId) ?? conversations[0];

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as Conversation[];
      if (Array.isArray(saved) && saved.length) queueMicrotask(() => { setConversations(saved.slice(0, 30)); setActiveId(saved[0].id); });
    } catch { /* Keep the blank local conversation. */ }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations.slice(0, 30))); } catch {} }, 300);
    return () => window.clearTimeout(timer);
  }, [conversations]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [active?.messages, status]);
  useEffect(() => () => { abortRef.current?.abort(); if (watchdogRef.current) clearTimeout(watchdogRef.current); }, []);

  const updateConversation = (conversationId: string, updater: (conversation: Conversation) => Conversation) => setConversations((items) => items.map((conversation) => conversation.id === conversationId ? updater(conversation) : conversation));
  const resetWatchdog = () => {
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    watchdogRef.current = setTimeout(() => { abortReasonRef.current = 'timeout'; abortRef.current?.abort(); }, 45_000);
  };

  async function request(messages: Message[], conversationId: string, assistantId: string) {
    setLoading(true); setStatus('正在连接模型…'); abortReasonRef.current = null;
    const controller = new AbortController(); abortRef.current = controller; resetWatchdog();
    try {
      const response = await callAiApi([
        { role: 'system', content: '你是 JackYun AI 的聊天助手。直接、清晰地回答用户，不要声称执行了未实际执行的操作。' },
        ...messages.filter((message) => !message.failed).map(({ role, content }) => ({ role, content })),
      ], { stream: true, maxTokens: 4000, model: model.id < 0 ? model.modelId : undefined, feature: 'chat', catalogModelId: model.id > 0 ? model.id : undefined, workspaceMode: 'chat', signal: controller.signal });
      if (!response.ok) throw new Error(await responseError(response));
      await readAiStream(response, (result) => {
        setStatus(result.content ? '正在生成…' : '正在思考…');
        updateConversation(conversationId, (conversation) => ({ ...conversation, updatedAt: new Date().toISOString(), messages: conversation.messages.map((message) => message.id === assistantId ? { ...message, content: result.content, reasoning: result.reasoning, failed: false } : message) }));
      }, resetWatchdog);
      setStatus('');
    } catch (error) {
      const reason = abortReasonRef.current === 'user' ? '已停止生成。' : abortReasonRef.current === 'timeout' ? '模型超过 45 秒没有返回新内容，请重试或切换模型。' : error instanceof Error ? error.message : 'AI 请求失败，请重试。';
      updateConversation(conversationId, (conversation) => ({ ...conversation, messages: conversation.messages.map((message) => message.id === assistantId ? { ...message, content: reason, failed: true } : message) }));
      setStatus('');
    } finally {
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
      watchdogRef.current = null; abortRef.current = null; setLoading(false);
    }
  }

  function send() {
    const content = input.trim();
    if (!content || loading || !active) return;
    const userMessage: Message = { id: id(), role: 'user', content };
    const assistantMessage: Message = { id: id(), role: 'assistant', content: '' };
    const nextMessages = [...active.messages.filter((message) => !message.failed), userMessage];
    updateConversation(active.id, (conversation) => ({ ...conversation, title: conversation.messages.length ? conversation.title : content.slice(0, 28), messages: [...nextMessages, assistantMessage], updatedAt: new Date().toISOString() }));
    setInput(''); void request(nextMessages, active.id, assistantMessage.id);
  }

  function retry() {
    if (!active || loading) return;
    const lastUserIndex = active.messages.findLastIndex((message) => message.role === 'user');
    if (lastUserIndex < 0) return;
    const assistantMessage: Message = { id: id(), role: 'assistant', content: '' };
    const history = active.messages.slice(0, lastUserIndex + 1).filter((message) => !message.failed);
    updateConversation(active.id, (conversation) => ({ ...conversation, messages: [...history, assistantMessage] }));
    void request(history, active.id, assistantMessage.id);
  }

  function createChat() { const next = newConversation(); setConversations((items) => [next, ...items]); setActiveId(next.id); setInput(''); }
  function deleteChat(conversationId: string) {
    const remaining = conversations.filter((conversation) => conversation.id !== conversationId);
    if (remaining.length) {
      setConversations(remaining);
      if (activeId === conversationId) setActiveId(remaining[0].id);
      return;
    }
    const next = newConversation();
    setConversations([next]); setActiveId(next.id);
  }

  return <div className="flex h-full min-h-0 bg-[var(--background)]">
    <aside className={`${sidebarOpen ? 'w-64 border-r' : 'w-0'} hidden shrink-0 overflow-hidden border-[var(--card-border)] bg-[var(--card)] transition-[width] md:block`}><div className="flex h-full w-64 flex-col p-3"><button type="button" onClick={createChat} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--card-border)] text-sm font-medium transition hover:bg-[var(--background)]"><span className="material-icons-round text-lg">add</span>新对话</button><div className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto">{conversations.map((conversation) => <button key={conversation.id} type="button" onClick={() => setActiveId(conversation.id)} className={`group flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm ${conversation.id === activeId ? 'bg-[#e8f0fe] text-[#174ea6] dark:bg-[#174ea6] dark:text-[#d2e3fc]' : 'hover:bg-[var(--background)]'}`}><span className="material-icons-round text-lg">chat_bubble_outline</span><span className="min-w-0 flex-1 truncate">{conversation.title}</span><span onClick={(event) => { event.stopPropagation(); deleteChat(conversation.id); }} className="material-icons-round hidden text-base text-[var(--muted-foreground)] group-hover:block">delete</span></button>)}</div></div></aside>
    <section className="flex min-w-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center border-b border-[var(--card-border)] px-3"><button type="button" onClick={() => setSidebarOpen((value) => !value)} aria-label="切换对话列表" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-[var(--card)]"><span className="material-icons-round text-xl">menu</span></button><span className="ml-2 truncate text-sm font-medium">{active?.title}</span><button type="button" onClick={createChat} className="ml-auto grid h-9 w-9 place-items-center rounded-lg hover:bg-[var(--card)] md:hidden"><span className="material-icons-round text-xl">add</span></button></div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">{!active?.messages.length ? <EmptyChat onPrompt={(value) => setInput(value)} /> : <div className="mx-auto max-w-3xl space-y-7">{active.messages.map((message) => <MessageBubble key={message.id} message={message} onRetry={retry} />)}{status && <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]"><span className="flex gap-1"><i className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" /><i className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:150ms]" /><i className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:300ms]" /></span>{status}</div>}<div ref={endRef} /></div>}</div>
      <div className="shrink-0 px-3 pb-3 sm:px-6 sm:pb-5"><div className="mx-auto max-w-3xl rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-2 shadow-[0_8px_30px_rgba(15,23,42,.08)] focus-within:border-[#155eef] focus-within:ring-4 focus-within:ring-[#155eef]/10"><textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); } }} rows={2} placeholder={`给 ${model.displayName} 发消息…`} className="max-h-36 w-full resize-none bg-transparent px-2 py-2 text-base outline-none placeholder:text-[var(--muted-foreground)]" /><div className="flex items-center justify-between gap-2 px-1"><span className="text-xs text-[var(--muted-foreground)]">Enter 发送 · Shift + Enter 换行</span>{loading ? <button type="button" onClick={() => { abortReasonRef.current = 'user'; abortRef.current?.abort(); }} className="grid h-9 w-9 place-items-center rounded-xl bg-[#101828] text-white"><span className="material-icons-round text-lg">stop</span></button> : <button type="button" onClick={send} disabled={!input.trim()} className="grid h-9 w-9 place-items-center rounded-xl bg-[#155eef] text-white transition hover:bg-[#004eeb] disabled:opacity-40"><span className="material-icons-round text-lg">arrow_upward</span></button>}</div></div></div>
    </section>
  </div>;
}

function MessageBubble({ message, onRetry }: { message: Message; onRetry: () => void }) {
  if (message.role === 'user') return <div className="flex justify-end"><div className="max-w-[85%] rounded-2xl rounded-br-md bg-[#155eef] px-4 py-3 text-sm leading-6 text-white">{message.content}</div></div>;
  return <div className="group flex gap-3"><div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#155eef] to-[#7f56d9] text-white"><span className="material-icons-round text-base">auto_awesome</span></div><div className="min-w-0 flex-1">{message.reasoning && <details className="mb-3 rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-xs text-[var(--muted-foreground)]"><summary className="cursor-pointer font-medium">查看思考过程</summary><p className="mt-2 whitespace-pre-wrap leading-5">{message.reasoning}</p></details>}{message.content ? <div className={message.failed ? 'text-sm text-[#b42318]' : 'text-sm leading-7'}>{message.failed ? message.content : <MarkdownRenderer content={message.content} />}</div> : <div className="h-5 w-32 animate-pulse rounded bg-[var(--card-border)]" />}{message.failed && <button type="button" onClick={onRetry} className="mt-2 flex items-center gap-1 text-xs font-medium text-[#155eef]"><span className="material-icons-round text-base">refresh</span>重试</button>}</div></div>;
}

function EmptyChat({ onPrompt }: { onPrompt: (value: string) => void }) {
  const prompts = ['帮我制定今天的学习优先级', '解释一个我没理解的知识点', '把这段文字整理得更清晰'];
  return <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center py-10 text-center"><div className="grid h-16 w-16 place-items-center rounded-[22px] bg-gradient-to-br from-[#155eef] to-[#7f56d9] text-white shadow-xl shadow-[#155eef]/20"><span className="material-icons-round text-3xl">auto_awesome</span></div><h2 className="mt-5 text-2xl font-semibold tracking-tight">今天想聊点什么？</h2><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">聊天模式专注于快速、自然的模型对话。需要多步骤执行时切换到 Agent。</p><div className="mt-6 grid w-full gap-2 sm:grid-cols-3">{prompts.map((prompt) => <button key={prompt} type="button" onClick={() => onPrompt(prompt)} className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 text-left text-sm leading-5 transition hover:-translate-y-0.5 hover:border-[#155eef] hover:shadow-sm">{prompt}</button>)}</div></div>;
}

function NoModels({ planCode }: { planCode: string }) { return <div className="grid h-full place-items-center bg-[var(--background)] p-6"><div className="max-w-md text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#f2f4f7] text-[#667085]"><span className="material-icons-round">lock</span></div><h2 className="mt-4 text-xl font-semibold">当前没有可用模型</h2><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">{planCode.toUpperCase()} 套餐尚未分配这个模式的模型。管理员可以在「AI 与配额 → 模型与权限」中开放。</p><Link href="/settings?section=ai" className="mt-5 inline-flex rounded-xl bg-[#155eef] px-4 py-2.5 text-sm font-semibold text-white">检查 AI 配置</Link></div></div>; }
function WorkspaceLoading() { return <div className="grid h-full place-items-center"><div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]"><span className="h-4 w-4 animate-spin rounded-full border-2 border-[#155eef] border-t-transparent" />正在加载 Agent…</div></div>; }

async function responseError(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  try { const parsed = JSON.parse(text) as { error?: { message?: string } | string; message?: string }; return typeof parsed.error === 'string' ? parsed.error : parsed.error?.message ?? parsed.message ?? `AI 请求失败（${response.status}）`; } catch { return text || `AI 请求失败（${response.status}）`; }
}
