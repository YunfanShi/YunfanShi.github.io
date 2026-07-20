'use client';

import { useState } from 'react';
import { addAdmin, removeAdmin } from '@/actions/admin';

interface AdminUser {
  id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
}

interface AdminManagerPanelProps {
  admins: AdminUser[];
  currentUserId: string;
}

export function AdminManagerPanel({ admins, currentUserId }: AdminManagerPanelProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function handleAdd() {
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    const result = await addAdmin(email);
    if (!result.success) setError(result.error ?? '添加失败');
    else {
      setSuccess(`已将 ${email.trim()} 设为管理员`);
      setEmail('');
    }
    setLoading(false);
  }

  async function handleRemove(id: string, display: string) {
    if (!confirm(`确定要移除管理员 "${display}" 的权限吗？`)) return;
    setRemovingId(id);
    setError(null);
    setSuccess(null);
    const result = await removeAdmin(id);
    if (!result.success) setError(result.error ?? '移除失败');
    else {
      setSuccess(`已移除 ${display} 的管理员权限`);
    }
    setRemovingId(null);
  }

  return (
    <div className="space-y-4">
      {/* Current admins list */}
      <div className="space-y-1.5">
        {admins.length === 0 && (
          <p className="text-sm text-[var(--muted-foreground)] italic">暂无管理员</p>
        )}
        {admins.map((admin) => {
          const display = admin.display_name ?? admin.email ?? admin.id.slice(0, 8);
          const isSelf = admin.id === currentUserId;
          return (
            <div
              key={admin.id}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#4285F4]/5 text-sm"
            >
              <span className="material-icons-round text-sm text-[#4285F4]">admin_panel_settings</span>
              <span className="flex-1 text-[var(--foreground)]">{display}</span>
              {admin.email && admin.email !== admin.display_name && (
                <span className="text-xs text-[var(--muted-foreground)] hidden sm:inline">{admin.email}</span>
              )}
              {isSelf && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-[#4285F4]/10 text-[#4285F4] font-medium">
                  当前
                </span>
              )}
              <button
                onClick={() => handleRemove(admin.id, display)}
                disabled={isSelf || removingId === admin.id}
                className="ml-1 p-1 rounded text-[#EA4335] hover:bg-[#EA4335]/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title={isSelf ? '不能移除自己' : '移除管理员'}
              >
                <span className="material-icons-round text-base">
                  {removingId === admin.id ? 'hourglass_top' : 'remove_circle'}
                </span>
              </button>
            </div>
          );
        })}
      </div>

      {/* Add admin form */}
      <div className="flex gap-2 flex-wrap">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="输入邮箱添加管理员"
          className="flex-1 min-w-[200px] rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4] transition-colors"
        />
        <button
          onClick={handleAdd}
          disabled={loading || !email.trim()}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#4285F4] text-white text-sm font-medium hover:bg-[#3367d6] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          <span className="material-icons-round text-base">add_circle</span>
          添加管理员
        </button>
      </div>

      {/* Status messages */}
      {error && (
        <p className="text-xs text-[#EA4335] bg-[#EA4335]/10 rounded-lg px-3 py-2 flex items-center gap-1">
          <span className="material-icons-round text-sm">error</span>
          {error}
        </p>
      )}
      {success && (
        <p className="text-xs text-[#34A853] bg-[#34A853]/10 rounded-lg px-3 py-2 flex items-center gap-1">
          <span className="material-icons-round text-sm">check_circle</span>
          {success}
        </p>
      )}
    </div>
  );
}