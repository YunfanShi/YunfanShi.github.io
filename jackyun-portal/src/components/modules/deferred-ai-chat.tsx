'use client';

import dynamic from 'next/dynamic';

// The AI workspace pulls in Markdown, syntax highlighting, KaTeX and the tool
// runtime. Keep that sizeable bundle out of the navigation-critical chunk.
const AiChatFab = dynamic(() => import('./ai-chat-fab'), {
  ssr: false,
  loading: () => null,
});

export default function DeferredAiChat() {
  return <AiChatFab />;
}
