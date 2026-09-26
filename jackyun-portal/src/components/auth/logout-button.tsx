'use client';

import { useState } from 'react';
import { useLanguage } from '@/components/language-provider';
import { t } from '@/lib/i18n';
import { fetchWithTimeout } from '@/lib/request-timeout';

export default function LogoutButton() {
  const { lang } = useLanguage();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logout(force: boolean) {
    setPending(true);
    setError(null);
    window.dispatchEvent(new Event('jackyun-signout-start'));
    try {
      const response = await fetchWithTimeout(`/api/auth/signout${force ? '?force=1' : ''}`, { method: 'POST' });
      if (!response.ok) throw new Error('退出失败。认证服务可能不可用，请选择强制退出或稍后重试。');
      // Keep account-owned local data and pending uploads for the next login.
      navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_USER_CACHE' });
      // A full reload removes authenticated React state and in-memory clients.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign('/login');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '退出失败，请重试。');
      window.dispatchEvent(new Event('jackyun-signout-cancel'));
      setPending(false);
    }
  }

  return <>
    <button type="button" onClick={() => setOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-lg text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[#f1f3f4] hover:text-[var(--foreground)] dark:hover:bg-[#3c4043] sm:h-9 sm:w-auto sm:gap-1 sm:px-3">
      <span className="material-icons-round text-lg">logout</span>
      <span className="hidden sm:inline">{t('topbar.logout', lang)}</span>
    </button>
    {open && <div className="fixed inset-0 z-[200] grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="logout-title">
      <div className="w-full max-w-md space-y-4 rounded-2xl bg-[var(--card)] p-6 shadow-xl">
        <h2 id="logout-title" className="text-lg font-semibold">退出登录</h2>
        <p className="text-sm leading-6">本地数据和待同步修改会保留。设备被删除或服务器故障时，可强制退出；强制退出不会上传未同步的修改。请在共享设备上注意本地数据隐私。</p>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={pending} onClick={() => void logout(false)} className="rounded-lg bg-[var(--brand)] px-4 py-2 text-white disabled:opacity-50">{pending ? '退出中…' : '退出登录'}</button>
          <button type="button" disabled={pending} onClick={() => void logout(true)} className="rounded-lg border border-[var(--card-border)] px-4 py-2 disabled:opacity-50">强制退出</button>
          <button type="button" disabled={pending} onClick={() => setOpen(false)} className="px-3 py-2 disabled:opacity-50">取消</button>
        </div>
      </div>
    </div>}
  </>;
}
