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

  useEffect(() => {
    const load = () => setReady(true);
    const id = window.setTimeout(load, 800);
    return () => window.clearTimeout(id);
  }, []);

  return ready ? <AiChatFab /> : null;
}
