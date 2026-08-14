'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { requestAccountDeletion } from '@/actions/account';

export default function DeleteAccountPanel() {
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (confirmText !== 'DELETE') return;

    setLoading(true);
    setError(null);

    try {
      const result = await requestAccountDeletion();
      if (result.success) {
        // Will redirect after sign out
        router.push('/login');
      } else {
        setError(result.error || '操作失败，请稍后重试');
        setLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
      setLoading(false);
    }
  };

  return (
    <section className="rounded-[12px] border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 p-5">
      <div className="flex items-center gap-2 mb-2">
        <span className="material-icons-round text-red-500 text-lg">warning</span>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">
          危险区域
        </h2>
      </div>
      <p className="text-sm text-[var(--muted-foreground)] mb-4">
        注销后你的账户将被标记为已删除，数据保留 30 天后自动清除。
        在此期间联系管理员可以恢复账户。此操作不可撤销。
      </p>

      {!showConfirm ? (
        <button
          type="button"
          onClick={() => setShowConfirm(true)}
          className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors"
        >
          停用并删除账户
        </button>
      ) : (
        <div className="space-y-3">
          <p className="text-sm font-medium text-red-600 dark:text-red-400">
            请输入 <code className="px-2 py-0.5 rounded bg-red-100 dark:bg-red-900/50 text-sm font-mono">DELETE</code> 确认注销：
          </p>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="输入 DELETE"
            className="w-full px-3 py-2 rounded-lg border border-red-300 dark:border-red-700 bg-white dark:bg-red-950/30 text-sm text-[var(--foreground)] outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
            disabled={loading}
          />
          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setShowConfirm(false);
                setConfirmText('');
                setError(null);
              }}
              className="flex-1 px-4 py-2 rounded-lg border border-[var(--card-border)] text-sm font-medium text-[var(--muted-foreground)] hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              disabled={loading}
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={confirmText !== 'DELETE' || loading}
              className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? '处理中...' : '确认停用'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
