'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export default function FullscreenButton() {
  const [active, setActive] = useState(false);
  const [help, setHelp] = useState(false);
  useEffect(() => {
    const update = () => setActive(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  const toggle = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.fullscreenEnabled && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        window.dispatchEvent(new CustomEvent('toggle-sidebar-collapse', { detail: { collapsed: true } }));
      }
      else setHelp(true);
    } catch { setHelp(true); }
  };
  return <>
    <button type="button" onClick={toggle} aria-label={active ? '退出全屏' : '全屏'} title={active ? '退出全屏' : '全屏'} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[var(--muted-foreground)] hover:bg-black/5 dark:hover:bg-white/10"><span className="material-icons-round">{active ? 'fullscreen_exit' : 'fullscreen'}</span></button>
    {help && createPortal(<div className="fixed inset-0 z-[110] grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="fullscreen-help-title"><div className="w-full max-w-sm rounded-2xl bg-[var(--card)] p-5 text-[var(--foreground)]"><h2 id="fullscreen-help-title" className="text-lg font-semibold">减少浏览器工具栏占用</h2><p className="mt-3 text-sm leading-6">当前浏览器无法进入网页全屏，或这次请求被拒绝。安装 JackYun 后，从主屏幕或桌面启动，可使用独立应用窗口。iPhone / iPad 请在 Safari 的分享菜单中选择“添加到主屏幕”。</p><div className="mt-4 flex flex-wrap gap-3"><a href="/products" className="rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-white">查看安装方法</a><button type="button" onClick={() => setHelp(false)} className="rounded-xl border border-[var(--card-border)] px-4 py-3 text-sm">关闭</button></div></div></div>, document.body)}
  </>;
}
