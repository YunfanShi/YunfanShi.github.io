'use client';
import { siteConfirm } from '@/lib/site-dialog';
import { useEffect, useState } from 'react';

export default function OfflineSettingsPanel() {
  const [pages, setPages] = useState<string[]>([]);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  async function refresh() {
    const worker = navigator.serviceWorker?.controller;
    if (!worker) { setStatus('正式版支持离线缓存；首次访问后刷新一次以启用。'); return; }
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => { channel.port1.close(); setStatus('缓存状态暂时不可用，请重试'); }, 4000);
    channel.port1.onmessage = event => { clearTimeout(timer); setPages(event.data.routes || []); channel.port1.close(); };
    worker.postMessage({ type: 'GET_OFFLINE_STATUS' }, [channel.port2]);
  }
  useEffect(() => { queueMicrotask(() => { void refresh(); }); }, []);
  async function clear() {
    if (!(await siteConfirm('清除离线页面缓存？学习数据与待同步修改会保留。'))) return;
    const worker = navigator.serviceWorker?.controller;
    if (!worker) return;
    setBusy(true);
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => { channel.port1.close(); setBusy(false); setStatus('清理未确认，请重试'); }, 4000);
    channel.port1.onmessage = () => { clearTimeout(timer); channel.port1.close(); setBusy(false); setPages([]); setStatus('离线页面已清理，学习数据与待同步修改保留'); };
    worker.postMessage({ type: 'CLEAR_USER_CACHE' }, [channel.port2]);
  }
  return <div className="space-y-4">
    <div className="rounded-xl bg-[var(--background)] p-4 text-sm leading-7"><strong>断网时可以做什么</strong><p>已访问并缓存的日程、学习计划、词汇、记忆、时间管理等本地页面继续工作。本机修改在恢复联网后上传。离线页面最多保留 7 天、24 个地址，缓存可能被浏览器回收。</p><p>AI 生成、第三方服务、图书下载和账号管理需要联网；未访问的页面会显示明确的离线提示。</p></div>
    <div className="flex flex-wrap gap-3"><button type="button" onClick={refresh} className="min-h-11 rounded-xl border border-[var(--card-border)] px-4">查看缓存</button><button type="button" onClick={clear} disabled={busy} className="min-h-11 rounded-xl border border-[var(--card-border)] px-4 disabled:opacity-50">清理离线页面</button><a href="/products" target="_blank" rel="noopener noreferrer" className="min-h-11 rounded-xl bg-[var(--brand)] px-4 py-3 text-white">安装 PWA</a></div>
    <p role="status" className="text-sm text-[var(--muted-foreground)]">{status || `已缓存 ${pages.length} 个页面地址`}</p>
    <ul className="grid gap-2 sm:grid-cols-2">{pages.map(path => <li key={path}><a href={path} className="block rounded-xl border border-[var(--card-border)] px-3 py-2 text-sm">{path}</a></li>)}</ul>
  </div>;
}
