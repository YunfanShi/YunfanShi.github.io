'use client';

import { useState } from 'react';
import { updateProfile } from '@/actions/settings';
import { useRouter } from 'next/navigation';
import logger from '@/lib/logger';

const TAG = 'NameEditor';

export default function NameEditor({ initialName }: { initialName: string }) {
  const [displayName, setDisplayName] = useState(initialName);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();

  const handleSave = async () => {
    setSaving(true);
    setMessage('');

    try {
      const result = await updateProfile(displayName, '');
      logger.info(TAG, 'Profile save result', result);

      if (!result.success) {
        throw new Error(result.error || '保存失败');
      }

      setMessage('✅ 名字已更新');
      setEditing(false);
      // Refresh to get new session metadata
      router.refresh();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : '保存失败';
      logger.error(TAG, 'Save exception', { error: errMsg });
      setMessage('❌ ' + errMsg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        {/* Avatar icon (static, no edit) */}
        <div className="w-12 h-12 rounded-full bg-[#4285F4]/10 flex items-center justify-center flex-shrink-0">
          <span className="material-icons-round text-2xl text-[#4285F4]">person</span>
        </div>
        <div className="flex-1">
          {editing ? (
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="输入你的名字"
              className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)] outline-none focus:border-[#4285F4]"
              autoFocus
            />
          ) : (
            <p className="font-medium text-[var(--foreground)]">{displayName || '未设置'}</p>
          )}
          <p className="text-xs text-[var(--muted-foreground)] mt-1">
            修改你的显示名称，改完后刷新页面即可生效。
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        {editing ? (
          <>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-[#4285F4] text-sm font-medium text-white hover:bg-[#3367d6] disabled:opacity-60 transition-colors"
            >
              {saving ? '保存中...' : '保存'}
            </button>
            <button
              onClick={() => { setEditing(false); setDisplayName(initialName); }}
              className="px-4 py-2 rounded-lg border border-[var(--card-border)] text-sm text-[var(--foreground)] hover:bg-[var(--background)] transition-colors"
            >
              取消
            </button>
          </>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="px-4 py-2 rounded-lg border border-[var(--card-border)] text-sm font-medium text-[var(--foreground)] hover:bg-[var(--background)] transition-colors"
          >
            修改名字
          </button>
        )}
      </div>
      {message && (
        <p className={`text-xs ${message.startsWith('✅') ? 'text-[#34A853]' : 'text-[#EA4335]'}`}>
          {message}
        </p>
      )}
    </div>
  );
}