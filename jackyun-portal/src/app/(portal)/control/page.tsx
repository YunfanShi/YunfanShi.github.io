'use client';

import { useEffect } from 'react';
import LegacyFrame from '@/components/modules/legacy-frame';

export default function ControlPage() {
  useEffect(() => {
    // Collapse sidebar
    window.dispatchEvent(new CustomEvent('toggle-sidebar-collapse', { detail: { collapsed: true } }));
    // Auto fullscreen
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }, []);

  return <LegacyFrame src="/Control.html" title="日程中心" />;
}
