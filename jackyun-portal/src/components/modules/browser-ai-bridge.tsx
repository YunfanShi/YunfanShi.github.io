'use client';

import { useEffect, useRef, useState } from 'react';
import { BROWSER_AI_CANCELLED, BROWSER_AI_REQUEST_EVENT, browserAiResponse, getBrowserAiConversationTarget, type BrowserAiConversation, type BrowserAiRequest } from '@/lib/browser-ai';
import { getAiConfig } from '@/lib/ai-config';
import { formatBrowserAiPrompt } from '@/lib/browser-ai';
import { COMPANION_BETA_VERSION } from '@/lib/beta';

export default function BrowserAiBridge() {
  const [request, setRequest] = useState<BrowserAiRequest | null>(null);
  const [reply, setReply] = useState('');
  const [notice, setNotice] = useState('');
  const [automationStage, setAutomationStage] = useState<'idle' | 'opening' | 'filling' | 'waiting' | 'receiving' | 'complete' | 'error'>('idle');
  const [companionState, setCompanionState] = useState<'checking' | 'ready' | 'outdated' | 'missing'>('checking');
  const [companionVersion, setCompanionVersion] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [conversationChoice, setConversationChoice] = useState<BrowserAiConversation[] | null>(null);
  const requestRef = useRef<BrowserAiRequest | null>(null);
  const awaitingConversationChoiceRef = useRef(false);
  const companionReadyRef = useRef(false);
  const chooseConversationRef = useRef<(mode: 'new' | 'selected', url?: string) => void>(() => {});
  const connectionTimerRef = useRef<number | null>(null);
  const automationTimerRef = useRef<number | null>(null);
  const conversationTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const dispatched = new Set<string>();
    const dispatchAutomation = (next: BrowserAiRequest) => {
      if (dispatched.has(next.id)) return;
      dispatched.add(next.id);
      window.postMessage({ type: 'JACKYUN_COMPANION_AI_PROMPT', requestId: next.id, provider: next.provider, prompt: next.prompt, conversationMode: next.conversationMode, conversationUrl: next.conversationUrl, model: next.model }, window.location.origin);
    };
    const resetAutomationWatchdog = (requestId: string) => {
      if (automationTimerRef.current) window.clearTimeout(automationTimerRef.current);
      automationTimerRef.current = window.setTimeout(() => {
        if (requestRef.current?.id !== requestId) return;
        setAutomationStage('error');
        setNotice('Companion 已超过 20 秒没有更新进度，任务可能卡住。你可以取消后重试，或使用下方手动复制模式。');
        console.error('[BETA/BrowserAI] Automation heartbeat timeout', { requestId });
      }, 20_000);
    };
    const activateRequest = (next: BrowserAiRequest) => {
      setReply('');
      setNotice('');
      setRequest(next);
      requestRef.current = next;
      setAutomationStage(next.automation ? 'opening' : 'idle');
      setElapsedSeconds(0);
      setConversationChoice(null);
      companionReadyRef.current = false;
      const recentChoiceKey = `jackyun-browser-ai-recent-choice:${next.provider}:${next.model || 'default'}`;
      awaitingConversationChoiceRef.current = next.automation && next.conversationMode === 'recent' && localStorage.getItem(recentChoiceKey) !== 'done';
      console.info('[BETA/BrowserAI] Request created', { requestId: next.id, provider: next.provider, automation: next.automation, promptLength: next.prompt.length });
      if (next.automation) {
        if (!awaitingConversationChoiceRef.current) resetAutomationWatchdog(next.id);
        setCompanionState('checking');
        setCompanionVersion('');
        window.postMessage({ type: 'JACKYUN_COMPANION_PING' }, window.location.origin);
        if (awaitingConversationChoiceRef.current) {
          window.postMessage({ type: 'JACKYUN_COMPANION_LIST_CONVERSATIONS', requestId: next.id, provider: next.provider }, window.location.origin);
          if (conversationTimerRef.current) window.clearTimeout(conversationTimerRef.current);
          conversationTimerRef.current = window.setTimeout(() => {
            if (requestRef.current?.id !== next.id || !awaitingConversationChoiceRef.current) return;
            setConversationChoice([]);
            setNotice('暂未识别到可继续的对话，可以新建一个。');
          }, 6000);
        }
        setNotice(`正在检查 Companion ${COMPANION_BETA_VERSION} 连接…`);
        if (connectionTimerRef.current) window.clearTimeout(connectionTimerRef.current);
        connectionTimerRef.current = window.setTimeout(() => {
          if (requestRef.current?.id !== next.id) return;
          setCompanionState('missing');
          setAutomationStage('error');
          setNotice(`未检测到 Companion ${COMPANION_BETA_VERSION}。请安装或重新加载最新 BETA 扩展，也可以直接使用下方手动复制模式。`);
        }, 4000);
      }
    };
    const listener = (event: Event) => {
      const next = (event as CustomEvent<BrowserAiRequest>).detail;
      activateRequest(next);
    };
    window.addEventListener(BROWSER_AI_REQUEST_EVENT, listener);
    const legacyListener = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'JACKYUN_BROWSER_AI_REQUEST') return;
      const config = getAiConfig();
      if (config.providerMode !== 'browser' || localStorage.getItem('jackyun_beta_active') !== 'true') return;
      const messages = Array.isArray(event.data.messages) ? event.data.messages.filter((item: unknown) => item && typeof item === 'object' && typeof (item as { content?: unknown }).content === 'string') : [];
      const requestId = String(event.data.requestId || crypto.randomUUID());
      const source = event.source;
      const conversation = getBrowserAiConversationTarget();
      const next: BrowserAiRequest = {
        id: requestId,
        prompt: formatBrowserAiPrompt(messages),
        provider: config.browserProvider ?? 'chatgpt',
        conversationMode: conversation.mode,
        conversationUrl: conversation.url,
        model: '',
        automation: config.companionAutomation === true,
        stream: event.data.stream === true,
        resolve: async (response) => source?.postMessage({ type: 'JACKYUN_BROWSER_AI_RESPONSE', requestId, ok: true, body: await response.text(), stream: event.data.stream === true }, { targetOrigin: event.origin }),
        reject: (error) => source?.postMessage({ type: 'JACKYUN_BROWSER_AI_RESPONSE', requestId, ok: false, error: error.message }, { targetOrigin: event.origin }),
      };
      activateRequest(next);
    };
    window.addEventListener('message', legacyListener);
    const readyListener = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'JACKYUN_COMPANION_READY') return;
      const version = String(event.data.version || '未知');
      setCompanionVersion(version);
      const active = requestRef.current;
      if (!active?.automation) return;
      if (version !== COMPANION_BETA_VERSION) {
        if (connectionTimerRef.current) { window.clearTimeout(connectionTimerRef.current); connectionTimerRef.current = null; }
        setCompanionState('outdated');
        setAutomationStage('error');
        setNotice(`已连接 Companion ${version}，但自动处理需要 ${COMPANION_BETA_VERSION}。请重新加载最新扩展。`);
        return;
      }
      setCompanionState('ready');
      companionReadyRef.current = true;
      setNotice(`Companion ${version} 已连接，正在发送任务…`);
      if (!awaitingConversationChoiceRef.current) {
        resetAutomationWatchdog(active.id);
        dispatchAutomation(active);
      }
    };
    window.addEventListener('message', readyListener);
    const conversationsListener = (event: MessageEvent) => {
      const active = requestRef.current;
      if (event.origin !== window.location.origin || event.data?.type !== 'JACKYUN_COMPANION_CONVERSATIONS' || event.data.requestId !== active?.id || !awaitingConversationChoiceRef.current) return;
      const items = Array.isArray(event.data.conversations) ? event.data.conversations.filter((item: unknown): item is BrowserAiConversation => Boolean(item && typeof item === 'object' && typeof (item as BrowserAiConversation).url === 'string' && typeof (item as BrowserAiConversation).title === 'string')) : [];
      if (conversationTimerRef.current) { window.clearTimeout(conversationTimerRef.current); conversationTimerRef.current = null; }
      setConversationChoice(items);
      setNotice(items.length ? '请选择本次对话位置。' : '这是该模型第一次使用，当前没有可继续的已打开对话。');
    };
    window.addEventListener('message', conversationsListener);
    chooseConversationRef.current = (mode, url = '') => {
      const active = requestRef.current;
      if (!active) return;
      const next = { ...active, conversationMode: mode, conversationUrl: mode === 'selected' ? url : '' } as BrowserAiRequest;
      localStorage.setItem(`jackyun-browser-ai-recent-choice:${active.provider}:${active.model || 'default'}`, 'done');
      requestRef.current = next;
      setRequest(next);
      setConversationChoice(null);
      awaitingConversationChoiceRef.current = false;
      setNotice('选择完成，正在准备任务…');
      if (companionReadyRef.current) {
        resetAutomationWatchdog(next.id);
        dispatchAutomation(next);
      }
    };
    const statusListener = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'JACKYUN_COMPANION_AI_STATUS') return;
      const active = requestRef.current;
      if (!active || event.data.requestId !== active.id) return;
      if (connectionTimerRef.current) { window.clearTimeout(connectionTimerRef.current); connectionTimerRef.current = null; }
      setCompanionState('ready');
      const stage = event.data.stage as typeof automationStage;
      console.info('[BETA/BrowserAI] Status', { requestId: active.id, stage, detail: event.data.detail || '', error: event.data.error || '' });
      if (['opening', 'filling', 'waiting', 'receiving', 'complete', 'error'].includes(stage)) setAutomationStage(stage);
      setNotice(event.data.error || event.data.detail || '');
      if (stage === 'complete' || stage === 'error') {
        if (automationTimerRef.current) { window.clearTimeout(automationTimerRef.current); automationTimerRef.current = null; }
      } else resetAutomationWatchdog(active.id);
      if (stage === 'complete' && typeof event.data.reply === 'string' && event.data.reply.trim()) {
        const content = event.data.reply.trim();
        setReply(content);
        active.resolve(browserAiResponse(content, active.stream));
        requestRef.current = null;
        window.setTimeout(() => setRequest(null), 650);
      }
    };
    window.addEventListener('message', statusListener);
    window.postMessage({ type: 'JACKYUN_COMPANION_PING' }, window.location.origin);
    return () => { if (connectionTimerRef.current) window.clearTimeout(connectionTimerRef.current); if (automationTimerRef.current) window.clearTimeout(automationTimerRef.current); if (conversationTimerRef.current) window.clearTimeout(conversationTimerRef.current); window.removeEventListener(BROWSER_AI_REQUEST_EVENT, listener); window.removeEventListener('message', legacyListener); window.removeEventListener('message', readyListener); window.removeEventListener('message', conversationsListener); window.removeEventListener('message', statusListener); };
  }, []);

  useEffect(() => {
    if (!request?.automation || automationStage === 'complete') return;
    const timer = window.setInterval(() => setElapsedSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [request?.automation, automationStage]);

  useEffect(() => {
    if (!request) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      console.warn('[BETA/BrowserAI] Request cancelled with Escape', { requestId: request.id });
      request.reject(new Error(BROWSER_AI_CANCELLED));
      if (connectionTimerRef.current) window.clearTimeout(connectionTimerRef.current);
      if (automationTimerRef.current) window.clearTimeout(automationTimerRef.current);
      if (conversationTimerRef.current) window.clearTimeout(conversationTimerRef.current);
      requestRef.current = null;
      setRequest(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [request]);

  if (!request) return null;
  const close = () => {
    console.warn('[BETA/BrowserAI] Request cancelled', { requestId: request.id });
    request.reject(new Error(BROWSER_AI_CANCELLED));
    if (connectionTimerRef.current) window.clearTimeout(connectionTimerRef.current);
    if (automationTimerRef.current) window.clearTimeout(automationTimerRef.current);
    if (conversationTimerRef.current) window.clearTimeout(conversationTimerRef.current);
    requestRef.current = null;
    setRequest(null);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(request.prompt);
      setNotice('Prompt 和数据已复制。请发送给任意 AI，并把完整回复粘贴回来。');
      console.info('[BETA/BrowserAI] Prompt copied', { requestId: request.id });
    } catch (error) {
      setNotice('复制失败，请展开完整 Prompt 后手动复制。');
      console.error('[BETA/BrowserAI] Prompt copy failed', { requestId: request.id, error });
    }
  };
  const submit = () => {
    if (!reply.trim()) return;
    console.info('[BETA/BrowserAI] Reply accepted', { requestId: request.id, replyLength: reply.length });
    request.resolve(browserAiResponse(reply.trim(), request.stream));
    requestRef.current = null;
    setRequest(null);
  };

  const providerName = ({ chatgpt: 'ChatGPT', deepseek: 'DeepSeek', claude: 'Claude', gemini: 'Gemini', qwen: '通义千问', perplexity: 'Perplexity' } as const)[request.provider];

  return <div className="fixed inset-0 z-[120] flex items-end justify-end bg-[#071b33]/35 backdrop-blur-[2px] sm:items-stretch" role="dialog" aria-modal="true" aria-labelledby="browser-ai-title">
    <button type="button" aria-label="取消本次 AI 请求" onClick={close} className="absolute inset-0 cursor-default" />
    <aside className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[28px] border border-[var(--card-border)] bg-[var(--card)] shadow-[-24px_0_70px_rgba(7,27,51,.24)] sm:h-full sm:max-h-none sm:max-w-[540px] sm:rounded-none sm:rounded-l-[28px]">
      <header className="bg-[linear-gradient(120deg,#ecfeff,#f0f9ff)] p-5 dark:bg-[linear-gradient(120deg,#0b2f35,#102a43)] sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#0891b2] text-white shadow-lg shadow-cyan-950/15"><span className="material-icons-round">hub</span></span>
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-bold uppercase tracking-[.14em] text-[#0e7490] dark:text-[#67e8f9]">本地网页 AI</p><span className="rounded-full bg-[#7c3aed] px-2 py-0.5 text-[10px] font-bold tracking-wider text-white">BETA</span></div><h2 id="browser-ai-title" className="mt-1 text-xl font-semibold">让你自己的 AI 完成本次请求</h2></div>
          <button type="button" onClick={close} aria-label="取消" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[var(--muted-foreground)] hover:bg-black/5 dark:hover:bg-white/10"><span className="material-icons-round">close</span></button>
        </div>
        <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">API 不可用或没有 API Key 时，可将完整任务交给你已登录的 AI。JackYun 不会把这些数据发送到自己的模型。</p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold"><span className="rounded-full bg-white/75 px-3 py-1.5 text-[#0e7490] dark:bg-white/10 dark:text-[#67e8f9]">目标：{providerName}</span><span className="rounded-full bg-white/75 px-3 py-1.5 text-[var(--muted-foreground)] dark:bg-white/10">{request.automation ? 'Companion 自动填写' : '手动复制模式'}</span><span className="rounded-full bg-white/75 px-3 py-1.5 text-[var(--muted-foreground)] dark:bg-white/10">{request.conversationMode === 'new' ? '新建对话' : request.conversationMode === 'selected' ? '指定上下文' : request.conversationMode === 'jackyun' ? 'JackYun 专属对话' : '继续最近对话'}</span></div>
      </header>

      <div className="overflow-y-auto p-5 sm:p-6" data-scroll-region>
        {request.automation ? <><CompanionConnection state={companionState} version={companionVersion} />{conversationChoice !== null && <FirstConversationChoice providerName={providerName} conversations={conversationChoice} onChoose={(mode, url) => chooseConversationRef.current(mode, url)} />}<AutomationProgress stage={automationStage} detail={notice} elapsedSeconds={elapsedSeconds} />{automationStage === 'error' && notice && <details className="mb-4 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-xs text-[#991b1b] dark:border-[#7f1d1d] dark:bg-[#450a0a] dark:text-[#fecaca]"><summary className="cursor-pointer font-semibold">查看错误详情</summary><p className="mt-2 leading-5">{notice}</p></details>}</> : <ol className="mb-5 grid grid-cols-4 gap-1 text-center text-[10px] font-bold text-[var(--muted-foreground)]"><li><span className="mx-auto grid h-7 w-7 place-items-center rounded-full bg-[#0891b2] text-white">1</span><span className="mt-1.5 block">复制</span></li><li><span className="mx-auto grid h-7 w-7 place-items-center rounded-full bg-[#0891b2] text-white">2</span><span className="mt-1.5 block">发送</span></li><li><span className="mx-auto grid h-7 w-7 place-items-center rounded-full bg-[#0891b2] text-white">3</span><span className="mt-1.5 block">粘贴</span></li><li><span className="mx-auto grid h-7 w-7 place-items-center rounded-full border-2 border-[#0891b2] bg-[var(--card)] text-[#0e7490]">4</span><span className="mt-1.5 block">导入</span></li></ol>}

        <button type="button" onClick={copy} className="min-h-12 w-full rounded-xl bg-[#0891b2] px-4 text-sm font-bold text-white shadow-md shadow-cyan-950/15"><span className="material-icons-round mr-2 align-middle text-lg">content_copy</span>复制完整 Prompt 和数据</button>
        <details className="mt-3 overflow-hidden rounded-xl border border-[var(--card-border)]"><summary className="cursor-pointer px-3 py-3 text-xs font-bold text-[var(--muted-foreground)]">查看完整 Prompt</summary><textarea readOnly value={request.prompt} rows={9} onFocus={(event) => event.currentTarget.select()} className="w-full resize-y border-t border-[var(--card-border)] bg-[var(--background)] p-3 font-mono text-xs leading-5 outline-none" /></details>

        <label className="mt-5 block text-sm font-bold">粘贴 AI 的完整回复</label>
        <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">必须遵守 Prompt 中的响应格式。若要求 JSON / NDJSON，请勿添加 Markdown 代码围栏、前言或解释。</p>
        <textarea value={reply} onChange={(event) => setReply(event.target.value)} rows={10} placeholder="把 ChatGPT、DeepSeek、Claude、Gemini 或其他 AI 的完整回复粘贴到这里…" className="mt-3 w-full resize-y rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-3 font-mono text-xs leading-5 outline-none focus:border-[#0891b2] focus:ring-4 focus:ring-[#0891b2]/10" />
        {!request.automation && notice && <p role="status" className="mt-3 rounded-xl border border-[#bae6fd] bg-[#f0f9ff] px-3 py-2.5 text-xs leading-5 text-[#075985] dark:border-[#24516a] dark:bg-[#0b2639] dark:text-[#7dd3fc]">{notice}</p>}
      </div>

      <footer className="mt-auto grid grid-cols-[auto_1fr] gap-2 border-t border-[var(--card-border)] bg-[var(--card)] p-4 sm:p-5"><button type="button" onClick={close} className="min-h-11 rounded-xl border border-[var(--card-border)] px-4 text-sm font-bold">取消</button><button type="button" disabled={!reply.trim()} onClick={submit} className="min-h-11 rounded-xl border-2 border-[#0891b2] px-4 text-sm font-bold text-[#0e7490] disabled:cursor-not-allowed disabled:opacity-40 dark:text-[#67e8f9]"><span className="material-icons-round mr-2 align-middle text-lg">download_done</span>导入回复并继续</button></footer>
    </aside>
  </div>;
}

function CompanionConnection({ state, version }: { state: 'checking' | 'ready' | 'outdated' | 'missing'; version: string }) {
  const view = state === 'ready'
    ? { icon: 'extension', title: `Companion ${version} 已连接`, detail: '任务进度会实时显示在这里。', tone: 'border-[#86efac] bg-[#f0fdf4] text-[#166534] dark:border-[#166534] dark:bg-[#052e16] dark:text-[#86efac]' }
    : state === 'checking'
      ? { icon: 'sensors', title: '正在检测 Companion', detail: '请保持此页面打开，稍后会自动切换到 AI 网站。', tone: 'border-[#bae6fd] bg-[#f0f9ff] text-[#075985] dark:border-[#24516a] dark:bg-[#0b2639] dark:text-[#7dd3fc]' }
      : { icon: 'extension_off', title: state === 'outdated' ? `扩展版本过旧：${version || '未知'}` : '没有检测到 Companion', detail: `自动处理需要 Companion ${COMPANION_BETA_VERSION}；下方仍可手动复制。`, tone: 'border-[#fbbf24] bg-[#fffbeb] text-[#92400e] dark:border-[#92400e] dark:bg-[#451a03] dark:text-[#fde68a]' };
  return <div className={`mb-3 flex items-start gap-3 rounded-2xl border p-3 ${view.tone}`}><span className={`material-icons-round mt-0.5 ${state === 'checking' ? 'animate-pulse' : ''}`}>{view.icon}</span><div><p className="text-sm font-bold">{view.title}</p><p className="mt-0.5 text-xs leading-5 opacity-80">{view.detail}</p></div></div>;
}

function FirstConversationChoice({ providerName, conversations, onChoose }: { providerName: string; conversations: BrowserAiConversation[]; onChoose: (mode: 'new' | 'selected', url?: string) => void }) {
  const recent = conversations[0];
  return <section className="mb-3 rounded-2xl border border-[#c4b5fd] bg-[#f5f3ff] p-4 text-[#4c1d95] dark:border-[#6d28d9] dark:bg-[#2e1065] dark:text-[#ddd6fe]">
    <p className="text-sm font-bold">第一次使用 {providerName}</p>
    <p className="mt-1 text-xs leading-5 opacity-80">选择这次从哪里开始；之后“继续最近对话”会直接执行。</p>
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      <button type="button" onClick={() => onChoose('new')} className="min-h-10 rounded-xl bg-[#7c3aed] px-3 text-xs font-bold text-white">新建一个对话</button>
      {recent && <button type="button" onClick={() => onChoose('selected', recent.url)} className="min-h-10 min-w-0 truncate rounded-xl border border-[#8b5cf6] px-3 text-xs font-bold" title={recent.title}>继续“{recent.title}”</button>}
    </div>
  </section>;
}

function automationErrorCode(detail: string): string {
  if (/20 秒|没有更新进度|卡住/.test(detail)) return 'E-HEARTBEAT';
  if (/Companion|扩展|连接/.test(detail)) return 'E-COMPANION';
  if (/回复|超时/.test(detail)) return 'E-REPLY';
  if (/输入框|填写|发送/.test(detail)) return 'E-SEND';
  return 'E-AUTO';
}

function automationSummary(stage: 'idle' | 'opening' | 'filling' | 'waiting' | 'receiving' | 'complete' | 'error', detail: string): string {
  if (stage === 'error') return /20 秒|没有更新进度|卡住/.test(detail) ? '进度中断，可重试或手动处理' : '自动处理未完成';
  if (stage === 'opening') return /首次启动/.test(detail) ? '首次打开网站，可能需要更久' : '正在连接 AI 网站';
  if (stage === 'filling') return '正在填写并发送';
  if (stage === 'waiting') return '消息已发送，等待回复';
  if (stage === 'receiving') return '正在接收完整回复';
  if (stage === 'complete') return '回复已收到';
  return '正在准备任务';
}

function AutomationProgress({ stage, detail, elapsedSeconds }: { stage: 'idle' | 'opening' | 'filling' | 'waiting' | 'receiving' | 'complete' | 'error'; detail: string; elapsedSeconds: number }) {
  const steps = [{ key: 'opening', label: '打开网站' }, { key: 'filling', label: '填写发送' }, { key: 'waiting', label: '等待回复' }, { key: 'receiving', label: '接收内容' }, { key: 'complete', label: '返回网站' }];
  const current = stage === 'idle' ? 0 : Math.max(0, steps.findIndex((item) => item.key === stage));
  const code = stage === 'error' ? automationErrorCode(detail) : '';
  return <div className="mb-3 min-w-0 rounded-2xl border border-[#bae6fd] bg-[#f0f9ff] p-4 dark:border-[#24516a] dark:bg-[#0b2639]"><div className="flex min-w-0 items-center gap-2 text-sm font-bold text-[#075985] dark:text-[#7dd3fc]">{stage === 'error' || stage === 'complete' ? <span className={`material-icons-round shrink-0 ${stage === 'error' ? 'text-[#dc2626]' : 'text-[#16a34a]'}`}>{stage === 'error' ? 'error' : 'check_circle'}</span> : <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[#0891b2]/30 border-t-[#0891b2]" aria-hidden="true" />}<span className="min-w-0 flex-1 truncate">{stage === 'error' ? `需要帮助 · ${code}` : stage === 'complete' ? '回复已收到' : 'Jack Companion 正在处理'}</span><span className="shrink-0 text-xs font-medium tabular-nums opacity-70">{elapsedSeconds}s</span></div><p className="mt-2 text-xs text-[#39708a] dark:text-[#9bdcf5]">{automationSummary(stage, detail)}</p><ol className="mt-4 grid grid-cols-5 gap-1 text-center text-[9px] font-semibold text-[#64748b]">{steps.map((item, index) => <li key={item.key} className="min-w-0"><span className={`mx-auto grid h-6 w-6 place-items-center rounded-full ${stage !== 'error' && index <= current ? 'bg-[#0891b2] text-white' : 'bg-white text-[#64748b] dark:bg-white/10'}`}>{index + 1}</span><span className="mt-1 block truncate" title={item.label}>{item.label}</span></li>)}</ol></div>;
}
