'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Keep the global AI affordance tiny. The previous implementation hydrated the
 * full Agent runtime, Markdown, highlighting and KaTeX on every portal route.
 */
export default function DeferredAiChat() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const openWorkspace = (event: MessageEvent) => {
      if (event.data?.type === 'jackyun-open-ai') router.push('/ai?mode=agent');
    };
    window.addEventListener('message', openWorkspace);
    return () => window.removeEventListener('message', openWorkspace);
  }, [router]);

  if (pathname === '/ai') return null;
  return <Link href="/ai" aria-label="打开 JackYun AI" title="打开 AI 工作台" className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-5 z-30 grid h-13 w-13 place-items-center rounded-2xl bg-gradient-to-br from-[#155eef] to-[#7f56d9] text-white shadow-[0_12px_30px_rgba(21,94,239,.32)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_16px_36px_rgba(21,94,239,.38)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#155eef]/30"><span className="material-icons-round text-2xl">auto_awesome</span></Link>;
}
