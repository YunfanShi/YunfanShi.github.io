'use client';

import { useEffect, useState } from 'react';
import { BROWSER_AI_CANCELLED, BROWSER_AI_REQUEST_EVENT, browserAiResponse, type BrowserAiRequest } from '@/lib/browser-ai';
import { getAiConfig } from '@/lib/ai-config';
import { formatBrowserAiPrompt } from '@/lib/browser-ai';

export default function BrowserAiBridge() {
  const [request, setRequest] = useState<BrowserAiRequest | null>(null);
  const [reply, setReply] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const listener = (event: Event) => {
      const next = (event as CustomEvent<BrowserAiRequest>).detail;
      setReply('');
      setNotice('');
      setRequest(next);
      console.info('[BETA/BrowserAI] Manual request created', { requestId: next.id, provider: next.provider, automation: next.automation, promptLength: next.prompt.length });
      if (next.automation) {
        window.postMessage({ type: 'JACKYUN_COMPANION_AI_PROMPT', requestId: next.id, provider: next.provider, prompt: next.prompt }, window.location.origin);
        setNotice('已请求 Jack Companion 打开所选 AI 并填写 Prompt；生成完成后请把回复粘贴到下方。');
      }
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
      setReply(''); setNotice(''); setRequest(next);
    };
    window.addEventListener('message', legacyListener);
    return () => { window.removeEventListener(BROWSER_AI_REQUEST_EVENT, listener); window.removeEventListener('message', legacyListener); };
  }, []);

  if (!request) return null;
  const close = () => {
    console.warn('[BETA/BrowserAI] Request cancelled', { requestId: request.id });
    request.reject(new Error(BROWSER_AI_CANCELLED));
    setRequest(null);
  };
  const copy = async () => {
    await navigator.clipboard.writeText(request.prompt);
    setNotice('Prompt 和数据已复制。请发送给任意 AI，并把完整回复粘贴回来。');
    console.info('[BETA/BrowserAI] Prompt copied', { requestId: request.id });
  };
  const submit = () => {
    if (!reply.trim()) return;
    console.info('[BETA/BrowserAI] Reply accepted', { requestId: request.id, replyLength: reply.length });
    request.resolve(browserAiResponse(reply.trim(), request.stream));
    setRequest(null);
  };

  return <div className="fixed inset-0 z-[120] grid place-items-center bg-[#101828]/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="browser-ai-title">
    <section className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-[var(--card)] p-5 shadow-2xl sm:p-6">
      <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#7f56d9]">BETA · 本地网页 AI</p><h2 id="browser-ai-title" className="mt-1 text-xl font-semibold">让你自己的 AI 完成本次请求</h2><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">这是 API 不可用或没有 API Key 时的备用通道。数据不会发给 JackYun 的模型；只有你复制或授权 Companion 发送的内容会进入所选 AI 网站。</p></div><button type="button" onClick={close} aria-label="取消" className="rounded-lg p-2 text-[var(--muted-foreground)]"><span className="material-icons-round">close</span></button></div>
      <label className="mt-5 block text-sm font-semibold">1. 复制以下 Prompt 与数据</label>
      <textarea readOnly value={request.prompt} rows={10} className="mt-2 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-3 font-mono text-xs leading-5" />
      <button type="button" onClick={copy} className="mt-2 rounded-xl bg-[#155eef] px-4 py-2.5 text-sm font-semibold text-white">复制 Prompt 和数据</button>
      <label className="mt-5 block text-sm font-semibold">2. 粘贴 AI 的完整回复</label>
      <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">若任务要求 JSON / NDJSON，请保留原格式，不要添加 Markdown 代码围栏或解释文字。</p>
      <textarea value={reply} onChange={(event) => setReply(event.target.value)} rows={9} placeholder="在这里粘贴 AI 回复…" className="mt-2 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-3 text-sm leading-6" />
      {notice && <p role="status" className="mt-3 rounded-lg bg-[#eff8ff] px-3 py-2 text-xs text-[#175cd3]">{notice}</p>}
      <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={close} className="rounded-xl border border-[var(--card-border)] px-4 py-2.5 text-sm font-semibold">取消本次请求</button><button type="button" disabled={!reply.trim()} onClick={submit} className="rounded-xl bg-[#7f56d9] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">提交给当前页面</button></div>
    </section>
  </div>;
}
