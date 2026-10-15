'use client';

import { Component, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';

function LoadingTool() { return <p role="status" className="py-8 text-sm text-[var(--muted-foreground)]">正在加载工具，加载完成后可操作…</p>; }
const loaders = {
  time: () => import('./time-sync'),
  clipboard: () => import('./clipboard-share'),
  md2word: () => import('./markdown-to-word'),
  study: () => import('./study-daily-tools'),
};
type PanelId = keyof typeof loaders;
const initialPanels = {
  time: dynamic(loaders.time, { loading: LoadingTool }),
  clipboard: dynamic(loaders.clipboard, { loading: LoadingTool }),
  md2word: dynamic(loaders.md2word, { loading: LoadingTool }),
  study: dynamic(loaders.study, { loading: LoadingTool }),
};

class PanelBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div role="alert" className="space-y-3 py-4">
      <p>工具未能加载。已有输入已保留，可切换其他工具；恢复网络后请重试。</p>
      <Button variant="outline" onClick={this.props.onRetry}>重试加载</Button>
    </div> : this.props.children;
  }
}

export function ToolPanel({ id }: { id: PanelId }) {
  const [Panel, setPanel] = useState(() => initialPanels[id]);
  const [attempt, setAttempt] = useState(0);
  function retry() {
    // A failed React.lazy promise is cached. Create a fresh lazy wrapper only on retry.
    setPanel(() => dynamic(loaders[id], { loading: LoadingTool }));
    setAttempt(value => value + 1);
  }
  return <PanelBoundary key={attempt} onRetry={retry}><Panel /></PanelBoundary>;
}
