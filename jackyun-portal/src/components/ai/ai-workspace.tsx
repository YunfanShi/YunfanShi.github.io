'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { callAiApi, getAiConfig, getThinkingLevel, getThinkingTemperature, saveThinkingLevel, type ThinkingLevel } from '@/lib/ai-config';
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
  capabilities: string[];
  isSmartSelection?: boolean;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string;
  failed?: boolean;
  modelName?: string;
  routed?: boolean;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: string;
}

function id() { return crypto.randomUUID(); }
function newConversation(): Conversation { return { id: id(), title: '新对话', messages: [], updatedAt: new Date().toISOString() }; }

export default function AiWorkspace({ models, planCode, smartSelectionEnabled = false, initialMode = 'chat', initialPrompt = '' }: { models: ModelOption[]; planCode: string; smartSelectionEnabled?: boolean; initialMode?: 'chat' | 'agent'; initialPrompt?: string }) {
  const [mode, setMode] = useState<'chat' | 'agent'>(initialMode);
  const [personalModel, setPersonalModel] = useState<ModelOption | null>(null);
  const [browserModels, setBrowserModels] = useState<ModelOption[]>([]);
  const [browserModelStatus, setBrowserModelStatus] = useState(() => getAiConfig().providerMode === 'browser' ? '正在读取当前账号可用模型…' : '');
  const [modelRefreshKey, setModelRefreshKey] = useState(0);
  const [providerMode] = useState(() => getAiConfig().providerMode ?? 'cloud');
  const [browserProvider] = useState(() => getAiConfig().browserProvider ?? 'chatgpt');
  useEffect(() => {
    const config = getAiConfig();
    if (config.providerMode !== 'personal' && config.providerMode !== 'browser') return;
    const label = config.providerMode === 'browser' ? `${config.browserProvider ?? 'Browser'} 网页版` : config.model || '个人 API 模型';
    queueMicrotask(() => setPersonalModel({ id: -1, displayName: label, modelId: config.providerMode === 'browser' ? '' : config.model || label, providerName: config.providerMode === 'browser' ? '本地网页 AI' : '个人 API', description: '使用你的个人配置，不消耗平台套餐额度', supportsChat: true, supportsAgent: true, inputCostPerMillion: 0, outputCostPerMillion: 0, contextWindow: 0, capabilities: config.providerMode === 'browser' ? ['web_search'] : [] }));
  }, []);
  useEffect(() => {
    if (providerMode !== 'browser') return;
    const requestId = crypto.randomUUID();
    const listener = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'JACKYUN_COMPANION_MODELS' || event.data.requestId !== requestId) return;
      const detected = (Array.isArray(event.data.models) ? event.data.models : []) as BrowserAiWebModel[];
      setBrowserModels(detected.map((item, index) => ({ id: -1000 - index, displayName: item.label, modelId: item.id, providerName: '本地网页 AI', description: `${browserProvider} 当前登录账号可用${item.selected ? ' · 当前已选择' : ''}`, supportsChat: true, supportsAgent: true, inputCostPerMillion: 0, outputCostPerMillion: 0, contextWindow: 0, capabilities: ['web_search'] })));
      setBrowserModelStatus(detected.length ? `已从 ${browserProvider} 读取 ${detected.length} 个模型` : event.data.error || '未读取到模型，将使用网站默认模型');
    };
    window.addEventListener('message', listener);
    window.postMessage({ type: 'JACKYUN_COMPANION_LIST_MODELS', requestId, provider: browserProvider }, window.location.origin);
    const timeout = window.setTimeout(() => setBrowserModelStatus((value) => value.startsWith('正在') ? '读取超时，请确认 AI 网站已登录后重试' : value), 20_000);
    return () => { window.clearTimeout(timeout); window.removeEventListener('message', listener); };
  }, [browserProvider, providerMode, modelRefreshKey]);
  const smartModel = useMemo<ModelOption | null>(() => smartSelectionEnabled && providerMode === 'cloud' ? { id: -2, displayName: '智能选择', modelId: 'smart', providerName: '自动路由', description: '先判断任务，再从当前套餐内选择最合适的可用模型', supportsChat: models.some((model) => model.supportsChat), supportsAgent: models.some((model) => model.supportsAgent), inputCostPerMillion: 0, outputCostPerMillion: 0, contextWindow: 0, capabilities: [...new Set(models.flatMap((model) => model.capabilities))], isSmartSelection: true } : null, [models, providerMode, smartSelectionEnabled]);
  const allModels = useMemo(() => providerMode === 'browser' ? (browserModels.length ? browserModels : personalModel ? [personalModel] : []) : personalModel ? [personalModel, ...models] : smartModel ? [smartModel, ...models] : models, [browserModels, models, personalModel, providerMode, smartModel]);
  const availableModels = useMemo(() => allModels.filter((model) => mode === 'agent' ? model.supportsAgent : model.supportsChat), [mode, allModels]);
  const [modelId, setModelId] = useState<number>(() => (initialMode === 'agent' ? models.find((model) => model.supportsAgent) : models.find((model) => model.supportsChat))?.id ?? 0);
  const selectedModel = availableModels.find((model) => model.id === modelId) ?? availableModels[0];

  return <div className="mx-auto flex h-[calc(100dvh-8.5rem)] min-h-[620px] max-w-[1600px] flex-col overflow-hidden rounded-[24px] border border-[var(--card-border)] bg-[var(--background)] shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
    <header className="relative flex min-h-[68px] flex-wrap items-center gap-3 border-b border-[var(--card-border)] bg-[var(--card)] px-4 py-3 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:px-5">
      <div className="flex items-center gap-2.5"><div className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--foreground)] text-[var(--background)]"><span className="material-icons-round text-lg">auto_awesome</span></div><div><h1 className="text-sm font-semibold tracking-tight">JackYun</h1><p className="text-[11px] text-[var(--muted-foreground)]">AI · {planCode.toUpperCase()}</p></div></div>
      <div className="order-3 grid w-full grid-cols-2 rounded-full border border-[var(--card-border)] bg-[var(--background)] p-1 sm:order-none sm:w-[230px]">
        <ModeButton active={mode === 'chat'} label="Chat" onClick={() => setMode('chat')} />
        <ModeButton active={mode === 'agent'} label="Work" onClick={() => setMode('agent')} />
      </div>
      <div className="ml-auto flex min-w-0 items-center gap-2 sm:justify-self-end">
        {providerMode === 'browser' && <button type="button" onClick={() => { setBrowserModelStatus('正在重新读取模型…'); setModelRefreshKey((value) => value + 1); }} className="hidden max-w-[240px] items-center gap-1 truncate rounded-lg px-2 py-1 text-xs text-[var(--muted-foreground)] hover:bg-[var(--background)] lg:flex" title={`${browserModelStatus} · 点击重试`}><span className="material-icons-round text-sm">refresh</span><span className="truncate">{browserModelStatus}</span></button>}
        <label className="relative min-w-0"><span className="sr-only">选择模型</span><select value={selectedModel?.id ?? 0} onChange={(event) => setModelId(Number(event.target.value))} disabled={!availableModels.length} className="h-10 max-w-[230px] appearance-none rounded-xl border border-[var(--card-border)] bg-[var(--background)] py-0 pl-3 pr-9 text-sm font-medium outline-none focus:border-[#155eef] disabled:opacity-60"><option value={0}>{availableModels.length ? '选择模型' : '当前套餐暂无模型'}</option>{availableModels.map((model) => <option key={model.id} value={model.id}>{model.displayName} · {model.providerName}</option>)}</select><span className="material-icons-round pointer-events-none absolute right-2.5 top-2.5 text-lg text-[var(--muted-foreground)]">expand_more</span></label>
        <Link href="/settings?section=ai" aria-label="AI 设置" className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--card-border)] text-[var(--muted-foreground)] transition hover:bg-[var(--background)] hover:text-[var(--foreground)]"><span className="material-icons-round text-xl">settings</span></Link>
      </div>
    </header>

    {selectedModel && <div className="flex min-h-10 flex-wrap items-center gap-2 border-b border-[var(--card-border)] bg-[var(--background)]/70 px-4 py-2 text-xs text-[var(--muted-foreground)] sm:px-6"><span className={`h-2 w-2 rounded-full ${selectedModel.supportsAgent ? 'bg-[#7f56d9]' : 'bg-[#17b26a]'}`} /><span className="min-w-0 flex-1"><span className="block max-h-14 overflow-y-auto whitespace-normal break-words pr-2 leading-5">{selectedModel.description || selectedModel.modelId}</span></span><div className="flex flex-wrap gap-1">{selectedModel.capabilities.map((capability) => <span key={capability} className="rounded-full bg-[var(--card)] px-2 py-0.5">{{ agent: 'Agent', web_search: '联网', code: '代码', vision: '视觉', reasoning: '推理', long_context: '长上下文', tools: '工具', files: '文件' }[capability] ?? capability}</span>)}</div><span className="hidden shrink-0 sm:inline">{selectedModel.isSmartSelection ? '判断与执行分别计入套餐额度' : <>输入 ¥{selectedModel.inputCostPerMillion}/M · 输出 ¥{selectedModel.outputCostPerMillion}/M{selectedModel.contextWindow ? ` · ${Math.round(selectedModel.contextWindow / 1000)}K 上下文` : ''}</>}</span></div>}

    <div className="min-h-0 flex-1">
      {!selectedModel ? <NoModels planCode={planCode} /> : mode === 'chat' ? <ChatWorkspace model={selectedModel} initialPrompt={initialPrompt} /> : <div className="h-full min-h-0 bg-[var(--background)]"><AgentWorkspace embedded initialAssistantMode="agent" embeddedTitle="Work" currentPath="/ai" catalogModelId={selectedModel.id > 0 ? selectedModel.id : undefined} smartSelect={selectedModel.isSmartSelection} supportsReasoning={selectedModel.isSmartSelection || selectedModel.capabilities.includes('reasoning')} browserModel={selectedModel.id < 0 && !selectedModel.isSmartSelection ? selectedModel.modelId : undefined} /></div>}
    </div>
  </div>;
}

function ModeButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-pressed={active} className={`flex h-9 min-w-0 items-center justify-center whitespace-nowrap rounded-full px-4 text-sm font-semibold transition ${active ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`}>{label}</button>;
}

function ChatWorkspace({ model, initialPrompt }: { model: ModelOption; initialPrompt: string }) {
  const initialConversation: Conversation = { id: 'initial', title: '新对话', messages: [], updatedAt: '' };
  const [conversations, setConversations] = useState<Conversation[]>([initialConversation]);
  const [activeId, setActiveId] = useState(initialConversation.id);
  const [input, setInput] = useState(initialPrompt);
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [status, setStatus] = useState('');
  const [webSearch, setWebSearch] = useState(false);
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel>(() => getThinkingLevel());
  const abortRef = useRef<AbortController | null>(null);
  const abortReasonRef = useRef<'user' | 'timeout' | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const active = conversations.find((conversation) => conversation.id === activeId) ?? conversations[0];
  const effectiveWebSearch = webSearch && model.capabilities.includes('web_search');
  const supportsReasoning = model.isSmartSelection || model.capabilities.includes('reasoning');
  const effectiveThinkingLevel: ThinkingLevel = supportsReasoning ? thinkingLevel : 'low';

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
      ], { stream: true, maxTokens: 4000, temperature: getThinkingTemperature(effectiveThinkingLevel), noThinking: effectiveThinkingLevel === 'low', thinkingLevel: effectiveThinkingLevel, model: model.id < 0 && !model.isSmartSelection ? model.modelId : undefined, feature: effectiveThinkingLevel === 'high' ? 'reasoning' : 'chat', catalogModelId: model.id > 0 ? model.id : undefined, smartSelect: model.isSmartSelection, workspaceMode: 'chat', webSearch: effectiveWebSearch, signal: controller.signal, onModelSelected: (modelName) => { updateConversation(conversationId, (conversation) => ({ ...conversation, messages: conversation.messages.map((message) => message.id === assistantId ? { ...message, modelName, routed: true } : message) })); setStatus(`Nex AGI: ${modelName} · 正在连接模型…`); } });
      if (!response.ok) throw new Error(await responseError(response));
      const encodedModelName = response.headers.get('x-jackyun-model');
      let responseModelName = model.displayName;
      if (encodedModelName) { try { responseModelName = decodeURIComponent(encodedModelName); } catch { responseModelName = encodedModelName; } }
      updateConversation(conversationId, (conversation) => ({ ...conversation, messages: conversation.messages.map((message) => message.id === assistantId ? { ...message, modelName: responseModelName, routed: model.isSmartSelection } : message) }));
      if (model.isSmartSelection) setStatus(`Nex AGI: ${responseModelName} · 正在等待回复…`);
      await readAiStream(response, (result) => {
        setStatus(`${model.isSmartSelection ? `Nex AGI: ${responseModelName} · ` : ''}${result.content ? '正在生成…' : '正在思考…'}`);
        updateConversation(conversationId, (conversation) => ({ ...conversation, updatedAt: new Date().toISOString(), messages: conversation.messages.map((message) => message.id === assistantId ? { ...message, content: result.content, reasoning: result.reasoning, failed: false, modelName: responseModelName, routed: model.isSmartSelection } : message) }));
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
    <aside className={`${sidebarOpen ? 'w-64 border-r' : 'w-0'} hidden shrink-0 overflow-hidden border-[var(--card-border)] bg-[var(--card)] transition-[width] md:block`}><div className="flex h-full w-64 flex-col p-3"><button type="button" onClick={createChat} className="flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium transition hover:bg-[var(--background)]"><span className="material-icons-round text-lg">edit_square</span>新对话</button><p className="mb-2 mt-6 px-3 text-[11px] font-semibold text-[var(--muted-foreground)]">最近</p><div className="min-h-0 flex-1 space-y-1 overflow-y-auto">{conversations.map((conversation) => <button key={conversation.id} type="button" onClick={() => setActiveId(conversation.id)} className={`group flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm ${conversation.id === activeId ? 'bg-[var(--background)] text-[var(--foreground)]' : 'hover:bg-[var(--background)]'}`}><span className="material-icons-round text-base text-[var(--muted-foreground)]">chat_bubble_outline</span><span className="min-w-0 flex-1 truncate">{conversation.title}</span><span onClick={(event) => { event.stopPropagation(); deleteChat(conversation.id); }} className="material-icons-round hidden text-base text-[var(--muted-foreground)] group-hover:block">delete</span></button>)}</div></div></aside>
    <section className="flex min-w-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center px-3"><button type="button" onClick={() => setSidebarOpen((value) => !value)} aria-label="切换对话列表" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-[var(--card)]"><span className="material-icons-round text-xl">menu</span></button><span className="ml-2 truncate text-sm font-medium">{active?.title}</span><button type="button" onClick={createChat} className="ml-auto grid h-9 w-9 place-items-center rounded-lg hover:bg-[var(--card)] md:hidden"><span className="material-icons-round text-xl">edit_square</span></button></div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">{!active?.messages.length ? <EmptyChat onPrompt={(value) => setInput(value)} /> : <div className="mx-auto max-w-3xl space-y-7">{active.messages.map((message) => <MessageBubble key={message.id} message={message} onRetry={retry} />)}{status && <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]"><span className="flex gap-1"><i className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" /><i className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:150ms]" /><i className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:300ms]" /></span>{status}</div>}<div ref={endRef} /></div>}</div>
      <div className="shrink-0 pb-3 pl-3 pr-20 sm:pb-5 sm:pl-6 sm:pr-20"><div className="mx-auto max-w-3xl rounded-[26px] border border-[var(--card-border)] bg-[var(--card)] p-2 shadow-[0_8px_30px_rgba(15,23,42,.08)] focus-within:border-[var(--muted-foreground)]"><textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); } }} rows={2} placeholder={`询问 ${model.displayName}`} className="max-h-36 w-full resize-none bg-transparent px-3 py-2 text-base outline-none placeholder:text-[var(--muted-foreground)]" /><div className="flex items-center justify-between gap-2 px-1"><div className="flex items-center gap-2"><span className="hidden items-center gap-1 text-xs text-[var(--muted-foreground)] sm:flex"><span className="material-icons-round text-lg">add</span>Enter 发送</span><button type="button" disabled={!model.capabilities.includes('web_search')} onClick={() => setWebSearch((value) => !value)} aria-pressed={webSearch} title={model.capabilities.includes('web_search') ? '要求本次对话使用联网搜索模型' : '当前模型不支持联网搜索'} className={`flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${webSearch ? 'bg-[#d1e9ff] text-[#175cd3]' : 'bg-[var(--background)] text-[var(--muted-foreground)]'}`}><span className="material-icons-round text-base">language</span>联网</button><label className="flex items-center gap-1 text-xs text-[var(--muted-foreground)]"><span className="material-icons-round text-base">psychology</span><select aria-label="思考深度" value={supportsReasoning ? thinkingLevel : 'low'} disabled={!supportsReasoning} onChange={(event) => { const level = event.target.value as ThinkingLevel; setThinkingLevel(level); saveThinkingLevel(level); }} title={supportsReasoning ? '调整模型思考深度' : '当前模型不支持思考'} className="h-8 rounded-full border border-[var(--card-border)] bg-[var(--background)] px-2 text-xs outline-none disabled:cursor-not-allowed disabled:opacity-50"><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select></label></div>{loading ? <button type="button" onClick={() => { abortReasonRef.current = 'user'; abortRef.current?.abort(); }} className="grid h-9 w-9 place-items-center rounded-full bg-[var(--foreground)] text-[var(--background)]"><span className="material-icons-round text-lg">stop</span></button> : <button type="button" onClick={send} disabled={!input.trim()} className="grid h-9 w-9 place-items-center rounded-full bg-[var(--foreground)] text-[var(--background)] transition disabled:opacity-30"><span className="material-icons-round text-lg">arrow_upward</span></button>}</div></div></div>
    </section>
  </div>;
}

function MessageBubble({ message, onRetry }: { message: Message; onRetry: () => void }) {
  if (message.role === 'user') return <div className="flex justify-end"><div className="max-w-[85%] rounded-[22px] bg-[var(--card)] px-4 py-3 text-sm leading-6 shadow-sm">{message.content}</div></div>;
  return <div className="group flex gap-3"><div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--foreground)] text-[var(--background)]"><span className="material-icons-round text-base">auto_awesome</span></div><div className="min-w-0 flex-1">{message.modelName && <p className="mb-1 text-[11px] font-medium text-[var(--muted-foreground)]">{message.routed ? 'Nex AGI: ' : '来自 '}{message.modelName}</p>}{message.reasoning && <details className="mb-3 rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-xs text-[var(--muted-foreground)]"><summary className="cursor-pointer font-medium">查看思考过程</summary><p className="mt-2 whitespace-pre-wrap leading-5">{message.reasoning}</p></details>}{message.content ? <div className={message.failed ? 'text-sm text-[#b42318]' : 'text-sm leading-7'}>{message.failed ? message.content : <MarkdownRenderer content={message.content} />}</div> : <div className="h-5 w-32 animate-pulse rounded bg-[var(--card-border)]" />}{message.failed && <button type="button" onClick={onRetry} className="mt-2 flex items-center gap-1 text-xs font-medium text-[#155eef]"><span className="material-icons-round text-base">refresh</span>重试</button>}</div></div>;
}

function EmptyChat({ onPrompt }: { onPrompt: (value: string) => void }) {
  const prompts = ['帮我制定今天的学习优先级', '解释一个我没理解的知识点', '把这段文字整理得更清晰'];
  return <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center py-10 text-center"><h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">有什么可以帮忙的？</h2><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">快速问答、解释知识点或整理内容；需要执行任务时切换到 Work。</p><div className="mt-7 grid w-full gap-2 sm:grid-cols-3">{prompts.map((prompt) => <button key={prompt} type="button" onClick={() => onPrompt(prompt)} className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 text-left text-sm leading-5 transition hover:bg-[var(--background)]">{prompt}</button>)}</div></div>;
}

function NoModels({ planCode }: { planCode: string }) { return <div className="grid h-full place-items-center bg-[var(--background)] p-6"><div className="max-w-md text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#f2f4f7] text-[#667085]"><span className="material-icons-round">lock</span></div><h2 className="mt-4 text-xl font-semibold">当前没有可用模型</h2><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">{planCode.toUpperCase()} 套餐尚未分配这个模式的模型。管理员可以在「AI 与配额 → 模型与权限」中开放。</p><Link href="/settings?section=ai" className="mt-5 inline-flex rounded-xl bg-[#155eef] px-4 py-2.5 text-sm font-semibold text-white">检查 AI 配置</Link></div></div>; }
function WorkspaceLoading() { return <div className="grid h-full place-items-center"><div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]"><span className="h-4 w-4 animate-spin rounded-full border-2 border-[#155eef] border-t-transparent" />正在加载 Agent…</div></div>; }

async function responseError(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  try { const parsed = JSON.parse(text) as { error?: { message?: string } | string; message?: string }; return typeof parsed.error === 'string' ? parsed.error : parsed.error?.message ?? parsed.message ?? `AI 请求失败（${response.status}）`; } catch { return text || `AI 请求失败（${response.status}）`; }
}
