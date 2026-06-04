'use client';

import { useState } from 'react';
import { requestPasswordReset } from '@/actions/auth';

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const result = await requestPasswordReset(email.trim());
    if (result.error) {
      setError(result.error);
    } else {
      setMessage('重置邮件已发送，请检查你的邮箱。');
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
      <div className="w-full max-w-sm mx-auto p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-[var(--foreground)]">找回密码</h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            输入你的邮箱，我们将发送重置链接
          </p>
        </div>

        <div className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-8 shadow-sm">
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
                  发送中...
                </>
              ) : (
                '发送重置邮件'
              )}
            </button>

            <p className="text-sm text-center text-[var(--muted-foreground)]">
              <a href="/login" className="text-[#4285F4] hover:underline">
                返回登录
              </a>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
