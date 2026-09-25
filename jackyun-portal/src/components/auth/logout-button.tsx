'use client';

import { useTransition } from 'react';
import { signOut } from '@/actions/auth';
import { listOfflineMutations } from '@/lib/offline/workspace';
import { saveCurrentLocalBackups } from '@/lib/backup/local';
import { getOutbox, getSetting } from '@/lib/sync/outbox';
import { useLanguage } from '@/components/language-provider';
import { useAuthMode } from '@/components/auth/auth-mode-provider';
import { t } from '@/lib/i18n';

export default function LogoutButton() {
  const { lang } = useLanguage();
  const { userId } = useAuthMode();
  const [pending, startTransition] = useTransition();
  return <button type="button" disabled={pending} onClick={() => startTransition(async () => {
    try {
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
        window.alert(`还有 ${unsent.length + offline.length} 项修改只保存在此设备。请保持登录并在联网后完成同步，再退出。`);
        return;
      }
      navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_USER_CACHE' });
      await signOut();
    } catch (error) {
      window.alert(error instanceof Error ? `退出前保存失败：${error.message}` : '退出前保存失败，请稍后重试。');
    }
  })} className="flex h-11 w-11 items-center justify-center rounded-lg text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[#f1f3f4] hover:text-[var(--foreground)] disabled:opacity-50 dark:hover:bg-[#3c4043] sm:h-9 sm:w-auto sm:gap-1 sm:px-3">
    <span className="material-icons-round text-lg">logout</span>
    <span className="hidden sm:inline">{pending ? '退出中…' : t('topbar.logout', lang)}</span>
  </button>;
}
