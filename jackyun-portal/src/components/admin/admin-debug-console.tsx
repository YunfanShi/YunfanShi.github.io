'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import logger from '@/lib/logger';

type Preview = 'suspended' | 'deleted' | null;

export default function AdminDebugConsole() {
  const pathname = usePathname();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/llm-proxy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ _get_config_only: true, _check_admin: true }) })
      .then((response) => response.json())
      .then((data) => setIsAdmin(data.isAdmin === true))
      .catch(() => setIsAdmin(false));
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '`' || event.ctrlKey || event.metaKey || event.altKey || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      event.preventDefault();
      setOpen((value) => !value);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAdmin]);

  if (!isAdmin) return null;
  const copyDiagnostics = async () => {
    await navigator.clipboard.writeText(JSON.stringify(logger.getDiagnosticSnapshot(), null, 2));
    setCopied(true); window.setTimeout(() => setCopied(false), 1400);
  };

  return <>
    <button type="button" onClick={() => setOpen((value) => !value)} aria-label="打开管理员调试窗口" title="管理员调试（`）" className="fixed bottom-4 right-4 z-[140] grid h-9 w-9 place-items-center rounded-full border border-[#155eef]/30 bg-[#155eef] font-mono text-lg font-bold text-white shadow-lg hover:bg-[#004eeb]">~</button>
    {open && <aside className="fixed bottom-16 right-4 z-[140] w-[min(360px,calc(100vw-2rem))] rounded-2xl border border-[#344054] bg-[#101828] p-4 text-white shadow-2xl">
      <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-[#84adff]">管理员调试</p><p className="mt-1 text-sm text-slate-300">快捷键：`（~）</p></div><button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-slate-300 hover:bg-white/10"><span className="material-icons-round">close</span></button></div>
      <div className="mt-4 rounded-xl bg-white/5 p-3 text-xs text-slate-300"><p>路径：{pathname}</p><p className="mt-1">视口：{typeof window === 'undefined' ? '—' : `${window.innerWidth} × ${window.innerHeight}`}</p><p className="mt-1">日志：{logger.getDiagnosticSnapshot().logs.length} 条</p></div>
      <div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={() => setPreview('suspended')} className="rounded-lg bg-amber-500/15 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/25">预览封禁界面</button><button type="button" onClick={() => setPreview('deleted')} className="rounded-lg bg-red-500/15 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/25">预览注销恢复</button><button type="button" onClick={() => router.push('/admin/tickets')} className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/15">打开客服工单</button><button type="button" onClick={() => router.push('/admin/users')} className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/15">打开用户管理</button><button type="button" onClick={copyDiagnostics} className="rounded-lg bg-[#155eef] px-3 py-2 text-xs font-semibold hover:bg-[#004eeb]">{copied ? '诊断已复制' : '复制诊断日志'}</button><button type="button" onClick={() => window.location.reload()} className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/15">强制刷新页面</button></div>
    </aside>}
    {preview && <div className="fixed inset-0 z-[160] grid place-items-center bg-[#101828]/80 p-4 backdrop-blur-sm"><section className="w-full max-w-xl rounded-3xl border border-white/15 bg-white p-7 shadow-2xl"><div className={`grid h-12 w-12 place-items-center rounded-2xl text-white ${preview === 'suspended' ? 'bg-amber-500' : 'bg-red-600'}`}><span className="material-icons-round">{preview === 'suspended' ? 'gpp_bad' : 'restore'}</span></div><h2 className="mt-5 text-xl font-bold text-[#101828]">{preview === 'suspended' ? '账户已暂停（调试预览）' : '账户注销恢复期（调试预览）'}</h2><p className="mt-3 text-sm leading-6 text-[#475467]">这是管理员本地预览，不会修改当前账户、权限或任何数据库数据。用于检查受限用户进入客服对话前的提示界面。</p><button type="button" onClick={() => setPreview(null)} className="mt-6 rounded-xl bg-[#155eef] px-4 py-2.5 text-sm font-semibold text-white">关闭预览</button></section></div>}
  </>;
}
