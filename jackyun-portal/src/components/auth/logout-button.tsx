'use client';

import { useTransition } from 'react';
import { signOut } from '@/actions/auth';
import { clearOfflineWorkspace } from '@/lib/offline/workspace';
import { useLanguage } from '@/components/language-provider';
import { t } from '@/lib/i18n';

export default function LogoutButton() {
  const { lang } = useLanguage();
  const [pending, startTransition] = useTransition();
  return <button type="button" disabled={pending} onClick={() => startTransition(async () => {
    await clearOfflineWorkspace();
    navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_USER_CACHE' });
    await signOut();
  })} className="flex h-11 w-11 items-center justify-center rounded-lg text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[#f1f3f4] hover:text-[var(--foreground)] disabled:opacity-50 dark:hover:bg-[#3c4043] sm:h-9 sm:w-auto sm:gap-1 sm:px-3">
    <span className="material-icons-round text-lg">logout</span>
    <span className="hidden sm:inline">{pending ? '退出中…' : t('topbar.logout', lang)}</span>
  </button>;
}
