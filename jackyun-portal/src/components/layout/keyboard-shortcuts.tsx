'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

export default function KeyboardShortcuts() {
  const router = useRouter();
  const pendingKey = useRef<string | null>(null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ignore when typing in an input / textarea / contenteditable
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      // `/` — focus search or open search
      if (e.key === '/') {
        e.preventDefault();
        const searchInput = document.querySelector<HTMLInputElement>(
          'input[type="search"], input[placeholder*="搜索"], input[placeholder*="search"]',
        );
        if (searchInput) searchInput.focus();
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
