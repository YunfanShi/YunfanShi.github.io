'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Props {
  currentProviders: string[];
  userId: string;
}

const ALL_PROVIDERS = ['google', 'github', 'email'] as const;
type Provider = (typeof ALL_PROVIDERS)[number];

const PROVIDER_LABELS: Record<Provider, string> = {
  google: 'Google',
  github: 'GitHub',
  email: '邮箱',
};

const PROVIDER_ICONS: Record<Provider, React.ReactNode> = {
  google: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  ),
  github: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  ),
  email: <span className="material-icons-round text-base">mail</span>,
};

export default function AccountLinkingPanel({ currentProviders, userId }: Props) {
  const [linking, setLinking] = useState<Provider | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleLink(provider: Provider) {
    setLinking(provider);
    setMessage(null);

    if (provider === 'email') {
      setMessage('邮箱关联请通过邮箱登录后自动关联。');
      setLinking(null);
      return;
    }

    const supabase = createClient();
    const callbackUrl = new URL(`${window.location.origin}/auth/callback`);
    callbackUrl.searchParams.set('linking', 'true');
    callbackUrl.searchParams.set('linking_user_id', userId);

    await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: callbackUrl.toString(),
        ...(provider === 'google'
          ? { queryParams: { access_type: 'offline', prompt: 'consent' } }
          : {}),
      },
    });
  }

  const unlinked = ALL_PROVIDERS.filter((p) => !currentProviders.includes(p));

  return (
    <div className="space-y-3">
      {/* Already linked */}
      {currentProviders.length > 0 && (
        <div className="space-y-1.5">
          {currentProviders.map((p) => (
            <div
              key={p}
              className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg bg-[#34A853]/5 text-[var(--foreground)]"
            >
              <span className="material-icons-round text-sm text-[#34A853]">check_circle</span>
              {PROVIDER_LABELS[p as Provider] ?? p}
              <span className="text-xs text-[var(--muted-foreground)] ml-auto">已关联</span>
            </div>
          ))}
        </div>
      )}

      {/* Unlinked providers */}
      {unlinked.length > 0 && (
        <div className="space-y-2">
          {unlinked.map((p) => (
            <button
              key={p}
              onClick={() => handleLink(p)}
              disabled={linking === p}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg border border-[var(--card-border)] bg-[var(--card)] text-sm font-medium text-[var(--foreground)] hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-60"
            >
              {linking === p ? (
                <span className="material-icons-round text-sm animate-spin text-[var(--muted-foreground)]">
                  autorenew
                </span>
              ) : (
                PROVIDER_ICONS[p]
              )}
              关联 {PROVIDER_LABELS[p]} 账号
            </button>
          ))}
        </div>
      )}

      {unlinked.length === 0 && (
        <p className="text-sm text-[var(--muted-foreground)]">已关联所有登录方式</p>
      )}

      {message && (
        <p className="text-sm text-[#4285F4] bg-[#4285F4]/10 rounded-lg px-3 py-2">
          {message}
        </p>
      )}
    </div>
  );
}
