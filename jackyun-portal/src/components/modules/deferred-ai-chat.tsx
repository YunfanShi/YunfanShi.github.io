'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

const AiChatFab = dynamic(() => import('./ai-chat-fab'), { ssr: false, loading: () => null });

/**
 * Keep the global AI affordance tiny. The previous implementation hydrated the
 * full Agent runtime, Markdown, highlighting and KaTeX on every portal route.
 */
export default function DeferredAiChat() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const openWorkspace = (event: MessageEvent) => {
      if (event.data?.type === 'jackyun-open-ai') setReady(true);
    };
    window.addEventListener('message', openWorkspace);
    return () => window.removeEventListener('message', openWorkspace);
  }, []);

  if (ready) return <AiChatFab initiallyOpen />;
  return <button type="button" onClick={() => setReady(true)} aria-label="打开 JackYun AI 悬浮窗" title="打开聊天 / Agent" className="group fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-5 z-50 flex h-14 items-center gap-2 overflow-hidden rounded-full border border-white/20 bg-gradient-to-br from-[#155eef] to-[#6941c6] px-4 text-white shadow-[0_16px_40px_rgba(21,94,239,.32)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_20px_48px_rgba(21,94,239,.4)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#155eef]/25"><span className="material-icons-round text-2xl">auto_awesome</span><span className="max-w-0 overflow-hidden whitespace-nowrap text-sm font-semibold opacity-0 transition-all duration-200 group-hover:max-w-24 group-hover:opacity-100">JackYun AI</span></button>;
}
