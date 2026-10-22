'use client';

import { useRef, useState, type RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription, getDialogContainer } from '@/components/ui/dialog';
import { useLanguage } from '@/components/language-provider';
import { t } from '@/lib/i18n';
import { fetchWithTimeout } from '@/lib/request-timeout';
import { useAuthMode } from '@/components/auth/auth-mode-provider';
import { saveCurrentLocalBackups } from '@/lib/backup/local';
import { getOutbox, getSetting } from '@/lib/sync/outbox';
import { listOfflineMutations } from '@/lib/offline/workspace';

export default function LogoutButton({ open: controlledOpen, onOpenChange, restoreFocusTo, portalContainer: externalContainer }: { portalContainer?: HTMLElement | null; open?: boolean; onOpenChange?: (open: boolean) => void; restoreFocusTo?: RefObject<HTMLElement | null> } = {}) {
  const { lang } = useLanguage();
  const { userId } = useAuthMode();
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const setOpen = onOpenChange ?? setLocalOpen;
  const trigger = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logout(force: boolean) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      if (!force) {
        const owner = userId ?? await getSetting<string>('activeUserId') ?? 'guest';
        await saveCurrentLocalBackups(owner);
        await new Promise<void>((resolve) => {
          const timeout = window.setTimeout(resolve, 10_000);
          window.dispatchEvent(new CustomEvent('jackyun-sync-before-signout', {
            detail: { complete: () => { window.clearTimeout(timeout); resolve(); } },
          }));
        });
        const [unsent, offline] = await Promise.all([getOutbox(), userId ? listOfflineMutations(userId) : Promise.resolve([])]);
        if (unsent.length || offline.length) {
          throw new Error(`还有 ${unsent.length + offline.length} 项修改仅保存在此设备。可稍后同步，或选择强制退出并保留本地数据。`);
        }
      }
      window.dispatchEvent(new Event('jackyun-signout-start'));
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
      inFlight.current = false;
    }
  }

  return <Dialog open={open} onOpenChange={value => { if (!pending) setOpen(value); }}>
    <Button ref={trigger} variant="ghost" aria-label={t('topbar.logout', lang)} onClick={event => { setPortalContainer(getDialogContainer(event.currentTarget)); setOpen(true); }}>
      <span aria-hidden="true" className="material-icons-round text-lg">logout</span><span className="hidden sm:inline">{t('topbar.logout', lang)}</span>
    </Button>
    <DialogContent portalContainer={externalContainer ?? portalContainer} closeLabel="取消退出登录" closeDisabled={pending} onCloseAutoFocus={event => {
      event.preventDefault();
      const target = trigger.current?.getClientRects().length ? trigger.current : restoreFocusTo?.current;
      target?.focus();
    }}>
      <DialogTitle>退出登录</DialogTitle>
      <DialogDescription>本地数据和待同步修改会保留。设备被删除或服务器故障时，可强制退出；强制退出不会上传未同步的修改。请在共享设备上注意本地数据隐私。</DialogDescription>
      {error && <p role="alert" className="jy-notice-error mt-4">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-3">
        <Button busy={pending} onClick={() => logout(false)}>{pending ? '退出中…' : '退出登录'}</Button>
        <Button variant="outline" disabled={pending} onClick={() => logout(true)}>强制退出</Button>
        <Button variant="ghost" disabled={pending} onClick={() => setOpen(false)}>取消</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
