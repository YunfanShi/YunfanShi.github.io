'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { isDefinitiveSessionError, serviceErrorMessage } from '@/lib/service-errors';
import { isWorkspaceSleeping } from '@/lib/workspace-idle';

/** Recover the existing session only; passwords are never stored or replayed. */
export default function SessionRecovery({ loginPage = false }: { loginPage?: boolean }) {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let running = false;
    let finished = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const retry = async () => {
      if (cancelled || running || finished || isWorkspaceSleeping() || document.visibilityState !== 'visible') return;
      if (timer) clearTimeout(timer);
      if (!navigator.onLine) { setNotice('网络未连接，联网后将尝试恢复已有登录。（NETWORK_OFFLINE）'); return; }
      running = true;
      try {
        const { data, error } = await createClient().auth.getClaims();
        if (cancelled) return;
        if (data?.claims) {
          finished = true;
          setNotice(null);
          if (loginPage) {
            const next = new URLSearchParams(location.search).get('next');
            router.replace(next?.startsWith('/') && !next.startsWith('//') && !next.startsWith('/login') ? next : '/dashboard');
          }
          router.refresh();
          return;
        }
        if (!error || isDefinitiveSessionError(error)) {
          finished = true;
          setNotice(error ? serviceErrorMessage(error, '认证服务') : null);
          return;
        }
        setNotice(`${serviceErrorMessage(error, '认证服务')} 将自动重试已有登录。`);
      } catch (error) {
        if (!cancelled) setNotice(`${serviceErrorMessage(error, '认证服务')} 将自动重试已有登录。`);
      } finally {
        running = false;
        if (!cancelled && !finished) timer = setTimeout(() => void retry(), Math.min(300_000, 30_000 * 2 ** Math.min(attempts++, 4)));
      }
    };
    const trigger = () => void retry();
    const { data: subscription } = createClient().auth.onAuthStateChange((event, session) => {
      // SDK callbacks run inside its auth lock; defer verification until released.
      if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) queueMicrotask(()=>{window.dispatchEvent(new Event('jackyun-auth-recovered'));trigger();});
    });
    void retry();
    window.addEventListener('online', trigger);
    window.addEventListener('focus', trigger);
    window.addEventListener('jackyun-workspace-wake', trigger);
    document.addEventListener('visibilitychange', trigger);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      subscription.subscription.unsubscribe();
      window.removeEventListener('online', trigger);
      window.removeEventListener('focus', trigger);
      window.removeEventListener('jackyun-workspace-wake', trigger);
      document.removeEventListener('visibilitychange', trigger);
    };
  }, [loginPage, router]);
  return notice ? <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">{notice}</p> : null;
}
