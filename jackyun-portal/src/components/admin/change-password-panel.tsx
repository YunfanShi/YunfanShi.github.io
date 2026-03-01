'use client';

import { useState } from 'react';
import { changePassword, setInitialPassword } from '@/actions/auth';

interface ChangePasswordPanelProps {
  hasPassword?: boolean;
}

export default function ChangePasswordPanel({ hasPassword = true }: ChangePasswordPanelProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirm) {
      setError('两次输入的新密码不一致');
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);

    const result = hasPassword
      ? await changePassword(currentPassword, newPassword)
      : await setInitialPassword(newPassword);

    if (result.error) {
      setError(result.error);
    } else {
      setMessage(hasPassword ? '密码已成功更新' : '密码已成功设置');
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
      setTimeout(() => setOpen(false), 1500);
    }
    setLoading(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--card-border)] text-sm font-medium text-[var(--foreground)] hover:bg-[#4285F4]/5 hover:border-[#4285F4]/30 transition-colors"
      >
        <span className="material-icons-round text-base text-[#4285F4]">lock</span>
        {hasPassword ? '修改密码' : '设置密码'}
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--card-border)] p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-[var(--foreground)]">{hasPassword ? '修改密码' : '设置密码'}</p>
        <button
          onClick={() => { setOpen(false); setError(null); setMessage(null); }}
          className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          <span className="material-icons-round text-base">close</span>
        </button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        {hasPassword && (
          <input
            type="password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="当前密码"
            className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4] transition-colors"
          />
        )}
        <input
          type="password"
          required
          minLength={6}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="新密码（至少 6 位）"
          className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4] transition-colors"
        />
        <input
          type="password"
          required
          minLength={6}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="确认新密码"
          className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4] transition-colors"
        />
        {error && (
          <p className="text-sm text-[#EA4335] bg-[#EA4335]/10 rounded-lg px-3 py-2">{error}</p>
        )}
        {message && (
          <p className="text-sm text-[#34A853] bg-[#34A853]/10 rounded-lg px-3 py-2">{message}</p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#4285F4] px-4 py-2 text-sm font-medium text-white hover:bg-[#3367d6] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <>
              <span className="material-icons-round text-sm animate-spin">autorenew</span>
              更新中...
            </>
          ) : (
            hasPassword ? '更新密码' : '设置密码'
          )}
        </button>
      </form>
    </div>
  );
}
