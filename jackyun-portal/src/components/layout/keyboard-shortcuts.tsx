'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { OPEN_GLOBAL_SEARCH_EVENT } from '@/components/layout/global-search';

export default function KeyboardShortcuts() {
  const router = useRouter();
  const pendingKey = useRef<string | null>(null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.isComposing || document.querySelector('[data-ui-dialog][data-state="open"], [data-ui-menu][data-state="open"], [data-navigation-drawer][data-open="true"]')) {
        pendingKey.current = null;
        if (pendingTimer.current) clearTimeout(pendingTimer.current);
        return;
      }
      // Ignore when typing in an input / textarea / contenteditable
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      if ((e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey)) {
        e.preventDefault();
        window.dispatchEvent(new Event(OPEN_GLOBAL_SEARCH_EVENT));
        return;
      }

      // `Escape` — close modals / dialogs
      if (e.key === 'Escape') {
        const closeBtn = document.querySelector<HTMLButtonElement>(
          '[data-dismiss="modal"], [aria-label="close"], [aria-label="关闭"]',
        );
        closeBtn?.click();
        return;
      }

      // `g` prefix shortcuts
      if (e.key === 'g' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (pendingTimer.current) clearTimeout(pendingTimer.current);
        pendingKey.current = 'g';
        pendingTimer.current = setTimeout(() => {
          pendingKey.current = null;
        }, 1000);
        return;
      }

      if (pendingKey.current === 'g') {
        pendingKey.current = null;
        if (pendingTimer.current) clearTimeout(pendingTimer.current);

        if (e.key === 'd') {
          e.preventDefault();
          router.push('/dashboard');
        } else if (e.key === 's') {
          e.preventDefault();
          router.push('/study');
        } else if (e.key === 'v') {
          e.preventDefault();
          router.push('/vocab');
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (pendingTimer.current) clearTimeout(pendingTimer.current);
    };
  }, [router]);

  return null;
}
