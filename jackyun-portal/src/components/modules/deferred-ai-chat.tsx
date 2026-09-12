'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const AiChatFab = dynamic(() => import('./ai-chat-fab'), { ssr: false, loading: () => null });

/**
 * Keep the global AI affordance tiny. The previous implementation hydrated the
 * full Agent runtime, Markdown, highlighting and KaTeX on every portal route.
 */
export default function DeferredAiChat() {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const openWorkspace = (event: MessageEvent) => {
      if (event.data?.type === 'jackyun-open-ai') setReady(true);
    };
    window.addEventListener('message', openWorkspace);
    return () => window.removeEventListener('message', openWorkspace);
  }, []);

  if (pathname === '/ai') return null;
  if (ready) return <AiChatFab initiallyOpen />;
  return <button type="button" onClick={() => setReady(true)} aria-label="打开 JackYun AI 悬浮窗" title="打开聊天 / Agent" className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-5 z-30 grid h-13 w-13 place-items-center rounded-2xl bg-[#0f172a] text-white shadow-[0_12px_30px_rgba(15,23,42,.3)] transition duration-200 hover:-translate-y-1 hover:bg-[#1e293b] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#38bdf8]/30"><span className="material-icons-round text-2xl">auto_awesome</span></button>;
}
