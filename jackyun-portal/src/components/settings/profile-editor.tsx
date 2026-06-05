'use client';

import { useState } from 'react';

export default function ProfileEditor({ initialName, initialAvatar, userId }: { initialName: string; initialAvatar: string; userId: string }) {
  const [avatarUrl, setAvatarUrl] = useState(initialAvatar);
  const [displayName, setDisplayName] = useState(initialName);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const handleSave = async () => {
    setSaving(true); setMessage('');
    try {
      const res = await fetch('/api/legacy-sync', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storage_key: 'profile', storage_value: { display_name: displayName, avatar_url: avatarUrl } }),
      });
      if (!res.ok) throw new Error('保存失败');
      setMessage('✅ 资料已保存');
      setEditing(false);
    } catch (err) {
      setMessage('❌ ' + (err instanceof Error ? err.message : '保存失败'));
    } finally { setSaving(false); }
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
      {message && <p className={`text-xs ${message.startsWith('✅') ? 'text-[#34A853]' : 'text-[#EA4335]'}`}>{message}</p>}
    </div>
  );
}