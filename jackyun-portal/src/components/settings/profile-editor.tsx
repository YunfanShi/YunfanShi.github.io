'use client';

import { useState } from 'react';
import { updateProfile } from '@/actions/settings';
import logger from '@/lib/logger';

const TAG = 'ProfileEditor';

export default function ProfileEditor({ initialName, initialAvatar, userId }: { initialName: string; initialAvatar: string; userId: string }) {
  const [avatarUrl, setAvatarUrl] = useState(initialAvatar);
  const [displayName, setDisplayName] = useState(initialName);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errorDetail, setErrorDetail] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    setErrorDetail('');
    logger.info(TAG, 'Saving profile via server action', { userId, displayName });

    try {
      const result = await updateProfile(displayName, avatarUrl);
      logger.info(TAG, 'Server action result', result);

      if (!result.success) {
        logger.error(TAG, 'Profile save failed', result);
        throw new Error(result.error || '保存失败');
      }

      // Also sync to legacy-sync for backward compatibility
      fetch('/api/legacy-sync', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'profile', value: { display_name: displayName, avatar_url: avatarUrl } }),
      }).catch(() => {
        logger.warn(TAG, 'Legacy sync fallback failed (non-critical)');
      });

      setMessage('✅ 资料已保存');
      setEditing(false);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : '保存失败';
      logger.error(TAG, 'Save exception', { error: errMsg });
      setMessage('❌ 保存失败');
      setErrorDetail(errMsg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        {editing ? (
          <label className="cursor-pointer group relative">
            {avatarUrl ? (
              <img src={avatarUrl} alt="头像" className="w-16 h-16 rounded-full border border-[var(--card-border)] object-cover opacity-80 group-hover:opacity-60 transition-opacity" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-[#4285F4]/10 flex items-center justify-center">
                <span className="material-icons-round text-3xl text-[#4285F4]">person</span>
              </div>
            )}
            <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100">
              <span className="material-icons-round text-white bg-black/50 rounded-full p-1 text-sm">photo_camera</span>
            </span>
            <input type="file" accept="image/*" className="hidden" onChange={e => {
              const f = e.target.files?.[0]; if (f) { const r = new FileReader(); r.onload = () => setAvatarUrl(r.result as string); r.readAsDataURL(f); }
            }} />
          </label>
        ) : (
          avatarUrl ? <img src={avatarUrl} alt="头像" className="w-16 h-16 rounded-full border border-[var(--card-border)] object-cover" /> :
            <div className="w-16 h-16 rounded-full bg-[#4285F4]/10 flex items-center justify-center"><span className="material-icons-round text-3xl text-[#4285F4]">person</span></div>
        )}
        <div className="flex-1">
          {editing ? (
            <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="输入你的名字"
              className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)] outline-none focus:border-[#4285F4]" />
          ) : (
            <p className="font-medium text-[var(--foreground)]">{displayName || '未设置'}</p>
          )}
          <p className="text-xs text-[var(--muted-foreground)] mt-1">管理你的头像和显示名称。</p>
        </div>
      </div>
      <div className="flex gap-2">
        {editing ? (
          <>
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-2 rounded-lg bg-[#4285F4] text-sm font-medium text-white hover:bg-[#3367d6] disabled:opacity-60 transition-colors">
              {saving ? '保存中...' : '保存'}
            </button>
            <button onClick={() => { setEditing(false); setAvatarUrl(initialAvatar); setDisplayName(initialName); }}
              className="px-4 py-2 rounded-lg border border-[var(--card-border)] text-sm text-[var(--foreground)] hover:bg-[var(--background)] transition-colors">取消</button>
          </>
        ) : (
          <button onClick={() => setEditing(true)}
            className="px-4 py-2 rounded-lg border border-[var(--card-border)] text-sm font-medium text-[var(--foreground)] hover:bg-[var(--background)] transition-colors">
            编辑资料
          </button>
        )}
      </div>
      {message && (
        <div>
          <p className={`text-xs ${message.startsWith('✅') ? 'text-[#34A853]' : 'text-[#EA4335]'}`}>{message}</p>
          {errorDetail && (
            <details className="mt-1">
              <summary className="text-xs text-[var(--muted-foreground)] cursor-pointer hover:text-[var(--foreground)]">
                查看详情
              </summary>
              <pre className="mt-1 p-2 rounded bg-[var(--background)] border border-[var(--card-border)] text-xs text-[#EA4335] whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto">
                {errorDetail}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}