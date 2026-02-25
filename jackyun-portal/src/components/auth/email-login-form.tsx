'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function EmailLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
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

    // Try sign in first
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (!signInError) {
      router.push('/dashboard');
      router.refresh();
      return;
    }

    // If user not found, try sign up
    if (
      signInError.message.toLowerCase().includes('invalid login credentials') ||
      signInError.message.toLowerCase().includes('user not found') ||
      signInError.status === 400
    ) {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (signUpError) {
        setError(signUpError.message);
      } else {
        setMessage('注册成功！请检查邮箱确认，或直接登录。');
        router.push('/dashboard');
        router.refresh();
      }
    } else {
      setError(signInError.message);
    }

    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-[var(--foreground)] mb-1"
        >
          邮箱
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
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
        ) : (
          '登录 / 注册'
        )}
      </button>
    </form>
  );
}
