'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updatePasswordWithToken } from '@/actions/auth';

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError('两次输入的密码不一致');
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);

    const result = await updatePasswordWithToken(password);
    if (result.error) {
      setError(result.error);
    } else {
      setMessage('密码已更新，正在跳转...');
      setTimeout(() => router.push('/dashboard'), 1500);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
      <div className="w-full max-w-sm mx-auto p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-[var(--foreground)]">设置新密码</h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            请输入你的新密码
          </p>
        </div>

        <div className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-8 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-[var(--foreground)] mb-1"
              >
                新密码
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4] transition-colors"
              />
            </div>
            <div>
              <label
                htmlFor="confirm"
                className="block text-sm font-medium text-[var(--foreground)] mb-1"
              >
                确认密码
              </label>
              <input
                id="confirm"
                type="password"
                required
                minLength={6}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
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
                  <span className="material-icons-round text-sm animate-spin">autorenew</span>
                  更新中...
                </>
              ) : (
                '更新密码'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
