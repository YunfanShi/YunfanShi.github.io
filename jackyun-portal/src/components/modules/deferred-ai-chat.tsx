'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

// The AI workspace pulls in Markdown, syntax highlighting, KaTeX and the tool
// runtime. Keep that sizeable bundle out of the navigation-critical chunk.
const AiChatFab = dynamic(() => import('./ai-chat-fab'), {
  ssr: false,
  loading: () => null,
});

export default function DeferredAiChat() {
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const updateVisibility = () => setHidden(localStorage.getItem('jackyun_hide_homepage_ai') === 'true');
    updateVisibility();
    window.addEventListener('jackyun-ai-visibility', updateVisibility);
    const load = () => setReady(true);
    const id = window.setTimeout(load, 800);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('jackyun-ai-visibility', updateVisibility);
    };
  }, []);

  return ready && !hidden ? <AiChatFab /> : null;
}
