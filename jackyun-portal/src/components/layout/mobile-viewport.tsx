'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { browserWorkspaceLayout } from '@/lib/workspace-layout';

/** Keep the phone workspace inside the visible viewport when a keyboard opens. */
export default function MobileViewport() {
  const pathname = usePathname();
  useEffect(() => {
    document.querySelector<HTMLElement>('[data-portal-main]')?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);
  useEffect(() => {
    const root = document.documentElement;
    const pointer = window.matchMedia('(pointer: coarse)');
    const updateLayout = () => {
      root.dataset.workspaceLayout = browserWorkspaceLayout();
      root.dataset.workspaceInput = pointer.matches ? 'touch' : 'pointer';
    };
    updateLayout();
    window.addEventListener('resize', updateLayout);
    pointer.addEventListener('change', updateLayout);
    return () => {
      window.removeEventListener('resize', updateLayout);
      pointer.removeEventListener('change', updateLayout);
      delete root.dataset.workspaceLayout;
      delete root.dataset.workspaceInput;
    };
  }, []);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    let fullHeight = window.innerHeight;
    const update = () => {
      // Pinch zoom must keep the user's chosen scale and must not resize the app.
      if (viewport.scale !== 1) return;
      const editing = document.activeElement?.matches('input, textarea, select, [contenteditable="true"], iframe') ?? false;
      if (!editing) fullHeight = window.innerHeight;
      root.style.setProperty('--portal-viewport-height', `${viewport.height}px`);
      root.dataset.portalKeyboard = String(Math.max(window.innerHeight, fullHeight) - viewport.height > 150);
    };
    const rotate = () => { fullHeight = window.innerHeight; update(); };
    update();
    viewport.addEventListener('resize', update);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', rotate);
    document.addEventListener('focusout', update);
    return () => {
      viewport.removeEventListener('resize', update);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', rotate);
      document.removeEventListener('focusout', update);
      root.style.removeProperty('--portal-viewport-height');
      delete root.dataset.portalKeyboard;
    };
  }, []);
  return null;
}
