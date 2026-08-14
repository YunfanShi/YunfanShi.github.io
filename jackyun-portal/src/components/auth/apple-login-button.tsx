'use client';

import { createClient } from '@/lib/supabase/client';
import { useState } from 'react';

/** Apple OAuth is shown only after the provider is enabled in the Supabase project. */
export default function AppleLoginButton() {
  const [error, setError] = useState('');
  const signIn = async () => {
    setError('');
    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({ provider: 'apple', options: { redirectTo: `${location.origin}/auth/callback` } });
    if (oauthError) setError('Apple 登录暂不可用，请联系管理员完成登录配置。');
  };
  return <div><button type="button" onClick={signIn} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-[var(--card-border)] bg-[var(--card)] text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--background)]"><span className="text-lg font-semibold">●</span>使用 Apple 登录</button>{error && <p className="mt-2 text-xs text-[#d92d20]">{error}</p>}</div>;
}
