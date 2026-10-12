'use client';

import { useSyncExternalStore } from 'react';
import { browserWorkspaceLayout, type WorkspaceLayout } from '@/lib/workspace-layout';

function subscribe(update: () => void) {
  const pointer = window.matchMedia('(pointer: coarse)');
  window.addEventListener('resize', update);
  pointer.addEventListener('change', update);
  return () => { window.removeEventListener('resize', update); pointer.removeEventListener('change', update); };
}
function snapshot(): WorkspaceLayout {
  return browserWorkspaceLayout();
}
export function useWorkspaceLayout(): WorkspaceLayout {
  return useSyncExternalStore(subscribe, snapshot, () => 'desktop');
}
