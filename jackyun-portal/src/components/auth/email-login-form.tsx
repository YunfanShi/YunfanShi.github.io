'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { signInWithIdentifier } from '@/actions/auth';

export default function EmailLoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();

    if (mode === 'login') {
      try {
        const result = await signInWithIdentifier(identifier, password);
        if (!result.success) setError(result.error ?? '登录失败，请重试。');
        else {
          const next = new URLSearchParams(window.location.search).get('next');
          router.replace(next?.startsWith('/') && !next.startsWith('//') ? next : '/dashboard');
          router.refresh();
          return;
        }
      } catch {
        setError('登录服务暂时不可用，请稍后重试。');
      }
    } else {
      const emailToUse = identifier.trim();
      if (!emailToUse.includes('@')) {
        setError('注册需要填写邮箱；登录时可以使用管理员分配的 ID。');
        setLoading(false);
        return;
      }
      const { error: signUpError } = await supabase.auth.signUp({
        email: emailToUse,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (signUpError) {
        if (
          signUpError.message.toLowerCase().includes('user already registered') ||
          signUpError.message.toLowerCase().includes('already registered')
        ) {
          setError('该邮箱已被注册，请直接登录');
        } else {
          setError(signUpError.message);
        }
      } else {
        setMessage(`📧 注册成功！验证邮件已发送至 ${emailToUse}，请查收邮件并点击验证链接，验证后即可直接登录。`);
        setMode('login');
      }
    }

    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="identifier"
          className="block text-sm font-medium text-[var(--foreground)] mb-1"
        >
          邮箱 / 用户名
        </label>
        <input
          id="identifier"
          type="text"
          required
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder={mode === 'login' ? '邮箱或登录 ID' : 'your@email.com'}
          className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4] transition-colors"
        />
      </div>
      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-[var(--foreground)] mb-1"
        >
          密码
        </label>
        <input
          id="password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4] transition-colors"
        />
      </div>

      {error && (
        <p className="text-sm text-[#EA4335] bg-[#EA4335]/10 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      {message && (
        <p className="text-sm text-[#34A853] bg-[#34A853]/10 rounded-lg px-3 py-2">
          {message}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#4285F4] px-4 py-3 text-sm font-medium text-white hover:bg-[#3367d6] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? (
          <>
            <span className="material-icons-round text-sm animate-spin">
              autorenew
            </span>
            处理中...
          </>
        ) : mode === 'login' ? (
          '登录'
        ) : (
          '注册'
        )}
      </button>

      <p className="text-sm text-center text-[var(--muted-foreground)]">
        {mode === 'login' ? (
          <>
            没有账号？{' '}
            <button
              type="button"
              onClick={() => { setMode('register'); setError(null); setMessage(null); }}
              className="text-[#4285F4] hover:underline"
            >
              注册
            </button>
            {' '}·{' '}
            <a href="/reset-password" className="text-[#4285F4] hover:underline">
              忘记密码
            </a>
          </>
        ) : (
          <>
            已有账号？{' '}
            <button
              type="button"
              onClick={() => { setMode('login'); setError(null); setMessage(null); }}
              className="text-[#4285F4] hover:underline"
            >
              登录
            </button>
          </>
        )}
      </p>
    </form>
  );
}
