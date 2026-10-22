'use client';

import Link from 'next/link';
import { useEffect, useImperativeHandle, useRef, useState, type Ref, type RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogClose, getDialogContainer } from '@/components/ui/dialog';

export type FullscreenAction = { toggle: (element: HTMLElement) => void };

export default function FullscreenButton({ hideTrigger = false, actionRef, restoreFocusTo }: { hideTrigger?: boolean; actionRef?: Ref<FullscreenAction>; restoreFocusTo?: RefObject<HTMLElement | null> }) {
  const [active, setActive] = useState(false);
  const [help, setHelp] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const update = () => setActive(Boolean(document.fullscreenElement));
    queueMicrotask(update);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  async function toggle(element: HTMLElement) {
    trigger.current = element;
    setPortalContainer(getDialogContainer(element));
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.fullscreenEnabled && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        window.dispatchEvent(new CustomEvent('toggle-sidebar-collapse', { detail: { collapsed: true } }));
      } else setHelp(true);
    } catch { setHelp(true); }
  }
  useImperativeHandle(actionRef, () => ({ toggle: element => { void toggle(element); } }));
  const label = active ? '退出全屏' : '全屏';
  const icon = <span aria-hidden="true" className="material-icons-round">{active ? 'fullscreen_exit' : 'fullscreen'}</span>;
  return <Dialog open={help} onOpenChange={setHelp}>
    {!hideTrigger && <Button variant="ghost" size="icon" aria-label={label} title={label} onClick={event => toggle(event.currentTarget)}>{icon}</Button>}
    <DialogContent portalContainer={portalContainer} closeLabel="关闭全屏帮助" onCloseAutoFocus={event => {
      event.preventDefault();
      const target = trigger.current?.isConnected ? trigger.current : restoreFocusTo?.current;
      target?.focus();
    }}>
      <DialogTitle>减少浏览器工具栏占用</DialogTitle>
      <DialogDescription>当前浏览器无法进入网页全屏，或这次请求被拒绝。安装 JackYun 后，从主屏幕或桌面启动，可使用独立应用窗口。iPhone / iPad 请在 Safari 的分享菜单中选择“添加到主屏幕”。</DialogDescription>
      <div className="mt-4 flex flex-wrap gap-3"><Button asChild><Link href="/products" prefetch={false}>查看安装方法</Link></Button><DialogClose asChild><Button variant="outline">关闭</Button></DialogClose></div>
    </DialogContent>
  </Dialog>;
}
