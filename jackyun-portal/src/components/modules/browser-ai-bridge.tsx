'use client';

import { useEffect, useRef, useState } from 'react';
import { BROWSER_AI_CANCELLED, BROWSER_AI_REQUEST_EVENT, browserAiResponse, type BrowserAiRequest } from '@/lib/browser-ai';
import { getAiConfig } from '@/lib/ai-config';
import { formatBrowserAiPrompt } from '@/lib/browser-ai';
import { COMPANION_BETA_VERSION } from '@/lib/beta';

export default function BrowserAiBridge() {
  const [request, setRequest] = useState<BrowserAiRequest | null>(null);
  const [reply, setReply] = useState('');
  const [notice, setNotice] = useState('');
  const [automationStage, setAutomationStage] = useState<'idle' | 'opening' | 'filling' | 'waiting' | 'receiving' | 'complete' | 'error'>('idle');
  const requestRef = useRef<BrowserAiRequest | null>(null);
  const connectionTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const activateRequest = (next: BrowserAiRequest) => {
      setReply('');
      setNotice('');
      setRequest(next);
      requestRef.current = next;
      setAutomationStage(next.automation ? 'opening' : 'idle');
      console.info('[BETA/BrowserAI] Manual request created', { requestId: next.id, provider: next.provider, automation: next.automation, promptLength: next.prompt.length });
      if (next.automation) {
        window.postMessage({ type: 'JACKYUN_COMPANION_AI_PROMPT', requestId: next.id, provider: next.provider, prompt: next.prompt }, window.location.origin);
        setNotice('正在连接 JackYun Companion…');
        if (connectionTimerRef.current) window.clearTimeout(connectionTimerRef.current);
        connectionTimerRef.current = window.setTimeout(() => {
          if (requestRef.current?.id !== next.id) return;
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
      const next: BrowserAiRequest = {
        id: requestId,
        prompt: formatBrowserAiPrompt(messages),
        provider: config.browserProvider ?? 'chatgpt',
        automation: config.companionAutomation === true,
        stream: event.data.stream === true,
        resolve: async (response) => source?.postMessage({ type: 'JACKYUN_BROWSER_AI_RESPONSE', requestId, ok: true, body: await response.text(), stream: event.data.stream === true }, { targetOrigin: event.origin }),
        reject: (error) => source?.postMessage({ type: 'JACKYUN_BROWSER_AI_RESPONSE', requestId, ok: false, error: error.message }, { targetOrigin: event.origin }),
      };
      activateRequest(next);
    };
    window.addEventListener('message', legacyListener);
    const statusListener = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'JACKYUN_COMPANION_AI_STATUS') return;
      const active = requestRef.current;
      if (!active || event.data.requestId !== active.id) return;
      if (connectionTimerRef.current) { window.clearTimeout(connectionTimerRef.current); connectionTimerRef.current = null; }
      const stage = event.data.stage as typeof automationStage;
      if (['opening', 'filling', 'waiting', 'receiving', 'complete', 'error'].includes(stage)) setAutomationStage(stage);
      setNotice(event.data.error || event.data.detail || '');
      if (stage === 'complete' && typeof event.data.reply === 'string' && event.data.reply.trim()) {
        const content = event.data.reply.trim();
        setReply(content);
        active.resolve(browserAiResponse(content, active.stream));
        requestRef.current = null;
        window.setTimeout(() => setRequest(null), 650);
      }
    };
    window.addEventListener('message', statusListener);
    return () => { if (connectionTimerRef.current) window.clearTimeout(connectionTimerRef.current); window.removeEventListener(BROWSER_AI_REQUEST_EVENT, listener); window.removeEventListener('message', legacyListener); window.removeEventListener('message', statusListener); };
  }, []);

  useEffect(() => {
    if (!request) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      console.warn('[BETA/BrowserAI] Request cancelled with Escape', { requestId: request.id });
      request.reject(new Error(BROWSER_AI_CANCELLED));
      if (connectionTimerRef.current) window.clearTimeout(connectionTimerRef.current);
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
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold"><span className="rounded-full bg-white/75 px-3 py-1.5 text-[#0e7490] dark:bg-white/10 dark:text-[#67e8f9]">目标：{providerName}</span><span className="rounded-full bg-white/75 px-3 py-1.5 text-[var(--muted-foreground)] dark:bg-white/10">{request.automation ? 'Companion 自动填写' : '手动复制模式'}</span></div>
      </header>

      <div className="overflow-y-auto p-5 sm:p-6" data-scroll-region>
        {request.automation ? <AutomationProgress stage={automationStage} /> : <ol className="mb-5 grid grid-cols-4 gap-1 text-center text-[10px] font-bold text-[var(--muted-foreground)]"><li><span className="mx-auto grid h-7 w-7 place-items-center rounded-full bg-[#0891b2] text-white">1</span><span className="mt-1.5 block">复制</span></li><li><span className="mx-auto grid h-7 w-7 place-items-center rounded-full bg-[#0891b2] text-white">2</span><span className="mt-1.5 block">发送</span></li><li><span className="mx-auto grid h-7 w-7 place-items-center rounded-full bg-[#0891b2] text-white">3</span><span className="mt-1.5 block">粘贴</span></li><li><span className="mx-auto grid h-7 w-7 place-items-center rounded-full border-2 border-[#0891b2] bg-[var(--card)] text-[#0e7490]">4</span><span className="mt-1.5 block">导入</span></li></ol>}

        <button type="button" onClick={copy} className="min-h-12 w-full rounded-xl bg-[#0891b2] px-4 text-sm font-bold text-white shadow-md shadow-cyan-950/15"><span className="material-icons-round mr-2 align-middle text-lg">content_copy</span>复制完整 Prompt 和数据</button>
        <details className="mt-3 overflow-hidden rounded-xl border border-[var(--card-border)]"><summary className="cursor-pointer px-3 py-3 text-xs font-bold text-[var(--muted-foreground)]">查看完整 Prompt</summary><textarea readOnly value={request.prompt} rows={9} onFocus={(event) => event.currentTarget.select()} className="w-full resize-y border-t border-[var(--card-border)] bg-[var(--background)] p-3 font-mono text-xs leading-5 outline-none" /></details>

        <label className="mt-5 block text-sm font-bold">粘贴 AI 的完整回复</label>
        <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">必须遵守 Prompt 中的响应格式。若要求 JSON / NDJSON，请勿添加 Markdown 代码围栏、前言或解释。</p>
        <textarea value={reply} onChange={(event) => setReply(event.target.value)} rows={10} placeholder="把 ChatGPT、DeepSeek、Claude、Gemini 或其他 AI 的完整回复粘贴到这里…" className="mt-3 w-full resize-y rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-3 font-mono text-xs leading-5 outline-none focus:border-[#0891b2] focus:ring-4 focus:ring-[#0891b2]/10" />
        {notice && <p role="status" className="mt-3 rounded-xl border border-[#bae6fd] bg-[#f0f9ff] px-3 py-2.5 text-xs leading-5 text-[#075985] dark:border-[#24516a] dark:bg-[#0b2639] dark:text-[#7dd3fc]">{notice}</p>}
      </div>

      <footer className="mt-auto grid grid-cols-[auto_1fr] gap-2 border-t border-[var(--card-border)] bg-[var(--card)] p-4 sm:p-5"><button type="button" onClick={close} className="min-h-11 rounded-xl border border-[var(--card-border)] px-4 text-sm font-bold">取消</button><button type="button" disabled={!reply.trim()} onClick={submit} className="min-h-11 rounded-xl border-2 border-[#0891b2] px-4 text-sm font-bold text-[#0e7490] disabled:cursor-not-allowed disabled:opacity-40 dark:text-[#67e8f9]"><span className="material-icons-round mr-2 align-middle text-lg">download_done</span>导入回复并继续</button></footer>
    </aside>
  </div>;
}

function AutomationProgress({ stage }: { stage: 'idle' | 'opening' | 'filling' | 'waiting' | 'receiving' | 'complete' | 'error' }) {
  const steps = [{ key: 'opening', label: '打开网站' }, { key: 'filling', label: '填写发送' }, { key: 'waiting', label: '等待回复' }, { key: 'receiving', label: '接收内容' }, { key: 'complete', label: '返回网站' }];
  const current = stage === 'idle' ? 0 : Math.max(0, steps.findIndex((item) => item.key === stage));
  return <div className="mb-5 rounded-2xl border border-[#bae6fd] bg-[#f0f9ff] p-4 dark:border-[#24516a] dark:bg-[#0b2639]"><div className="flex items-center gap-2 text-sm font-bold text-[#075985] dark:text-[#7dd3fc]"><span className={`material-icons-round ${stage === 'error' ? 'text-[#dc2626]' : stage === 'complete' ? 'text-[#16a34a]' : 'animate-spin'}`}>{stage === 'error' ? 'error' : stage === 'complete' ? 'check_circle' : 'progress_activity'}</span>{stage === 'error' ? '自动处理需要帮助' : stage === 'complete' ? '回复已收到' : 'Jack Companion 正在处理'}</div><ol className="mt-4 grid grid-cols-5 gap-1 text-center text-[9px] font-semibold text-[#64748b]">{steps.map((item, index) => <li key={item.key}><span className={`mx-auto grid h-6 w-6 place-items-center rounded-full ${stage !== 'error' && index <= current ? 'bg-[#0891b2] text-white' : 'bg-white text-[#64748b] dark:bg-white/10'}`}>{index + 1}</span><span className="mt-1 block">{item.label}</span></li>)}</ol></div>;
}
