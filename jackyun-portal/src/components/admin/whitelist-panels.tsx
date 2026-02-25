'use client';

import { useState } from 'react';
import {
  addWhitelistEmail,
  removeWhitelistEmail,
  addWhitelistUsername,
  removeWhitelistUsername,
} from '@/actions/admin';
import type { WhitelistEmail, WhitelistUsername } from '@/types';

// ── Email Whitelist ───────────────────────────────────────────────────────────

interface EmailListProps {
  items: WhitelistEmail[];
}

export function WhitelistEmailsPanel({ items }: EmailListProps) {
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    const result = await addWhitelistEmail(email, note);
    if (!result.success) setError(result.error ?? '添加失败');
    else {
      setEmail('');
      setNote('');
    }
    setLoading(false);
  }

  async function handleRemove(id: string) {
    await removeWhitelistEmail(id);
  }

  return (
    <div className="space-y-3">
      {/* List */}
      <div className="space-y-1.5">
        {items.length === 0 && (
          <p className="text-sm text-[var(--muted-foreground)] italic">暂无记录</p>
        )}
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#34A853]/5 text-sm"
          >
            <span className="material-icons-round text-sm text-[#34A853]">mail</span>
            <span className="flex-1 text-[var(--foreground)]">{item.email}</span>
            {item.note && (
              <span className="text-xs text-[var(--muted-foreground)]">{item.note}</span>
            )}
            <button
              onClick={() => handleRemove(item.id)}
              className="ml-auto p-1 rounded text-[#EA4335] hover:bg-[#EA4335]/10 transition-colors"
              title="删除"
            >
              <span className="material-icons-round text-base">delete</span>
            </button>
          </div>
        ))}
      </div>

      {/* Add form */}
      <div className="flex gap-2 flex-wrap">
        <input
          type="text"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="邮箱地址"
          className="flex-1 min-w-[160px] rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4] transition-colors"
        />
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="备注（可选）"
          className="flex-1 min-w-[120px] rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4] transition-colors"
        />
        <button
          onClick={handleAdd}
          disabled={loading || !email.trim()}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#4285F4] text-white text-sm font-medium hover:bg-[#3367d6] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          <span className="material-icons-round text-base">add_circle</span>
          添加
        </button>
      </div>
      {error && (
        <p className="text-xs text-[#EA4335]">{error}</p>
      )}
    </div>
  );
}

// ── Username Whitelist ────────────────────────────────────────────────────────

interface UsernameListProps {
  items: WhitelistUsername[];
}

const PLATFORM_COLORS: Record<string, string> = {
  github: '#24292e',
  google: '#4285F4',
  local: '#34A853',
};

export function WhitelistUsernamesPanel({ items }: UsernameListProps) {
  const [username, setUsername] = useState('');
  const [platform, setPlatform] = useState('github');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    if (!username.trim()) return;
    setLoading(true);
    setError(null);
    const result = await addWhitelistUsername(username, platform, note);
    if (!result.success) setError(result.error ?? '添加失败');
    else {
      setUsername('');
      setNote('');
    }
    setLoading(false);
  }

  async function handleRemove(id: string) {
    await removeWhitelistUsername(id);
  }

  return (
    <div className="space-y-3">
      {/* List */}
      <div className="space-y-1.5">
        {items.length === 0 && (
          <p className="text-sm text-[var(--muted-foreground)] italic">暂无记录</p>
        )}
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#4285F4]/5 text-sm"
          >
            <span className="material-icons-round text-sm text-[#4285F4]">person</span>
            <span className="flex-1 text-[var(--foreground)]">{item.username}</span>
            <span
              className="text-xs px-1.5 py-0.5 rounded-full font-medium"
              style={{
                backgroundColor: `${PLATFORM_COLORS[item.platform] ?? '#888'}22`,
                color: PLATFORM_COLORS[item.platform] ?? '#888',
              }}
            >
              {item.platform}
            </span>
            {item.note && (
              <span className="text-xs text-[var(--muted-foreground)]">{item.note}</span>
            )}
            <button
              onClick={() => handleRemove(item.id)}
              className="ml-auto p-1 rounded text-[#EA4335] hover:bg-[#EA4335]/10 transition-colors"
              title="删除"
            >
              <span className="material-icons-round text-base">delete</span>
            </button>
          </div>
        ))}
      </div>

      {/* Add form */}
      <div className="flex gap-2 flex-wrap">
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="用户名"
          className="flex-1 min-w-[140px] rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4] transition-colors"
        />
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          className="rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)] outline-none focus:border-[#4285F4] transition-colors"
        >
          <option value="github">github</option>
          <option value="google">google</option>
          <option value="local">local</option>
        </select>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="备注（可选）"
          className="flex-1 min-w-[120px] rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4] transition-colors"
        />
        <button
          onClick={handleAdd}
          disabled={loading || !username.trim()}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#4285F4] text-white text-sm font-medium hover:bg-[#3367d6] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          <span className="material-icons-round text-base">add_circle</span>
          添加
        </button>
      </div>
      {error && (
        <p className="text-xs text-[#EA4335]">{error}</p>
      )}
    </div>
  );
}

// ── Force Merge ───────────────────────────────────────────────────────────────

import { forceAccountMerge } from '@/actions/admin';

export function ForceMergePanel() {
  const [id1, setId1] = useState('');
  const [id2, setId2] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [open, setOpen] = useState(false);

  async function handleMerge() {
    if (!id1.trim() || !id2.trim()) return;
    setLoading(true);
    setResult(null);
    const res = await forceAccountMerge(id1.trim(), id2.trim());
    if (res.success) {
      setResult({
        success: true,
        message: `合并成功！已迁移表：${res.migratedTables?.join(', ') ?? '无'}`,
      });
      setId1('');
      setId2('');
    } else {
      setResult({ success: false, message: res.error ?? '合并失败' });
    }
    setLoading(false);
  }

  return (
    <div className="border border-[var(--card-border)] rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[var(--muted-foreground)] hover:bg-[var(--card-border)]/10 transition-colors"
      >
        <span className="material-icons-round text-base">merge</span>
        高级：手动合并账号
        <span className="material-icons-round text-base ml-auto">
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-[var(--card-border)]">
          <p className="text-xs text-[var(--muted-foreground)] pt-2">
            将副账号的所有数据迁移到主账号下。输入 UUID 或 邮箱地址。
          </p>
          <input
            type="text"
            value={id1}
            onChange={(e) => setId1(e.target.value)}
            placeholder="主账号 (UUID 或 邮箱)"
            className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4] transition-colors"
          />
          <input
            type="text"
            value={id2}
            onChange={(e) => setId2(e.target.value)}
            placeholder="副账号 (UUID 或 邮箱)"
            className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4] transition-colors"
          />
          <button
            onClick={handleMerge}
            disabled={loading || !id1.trim() || !id2.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#EA4335] text-white text-sm font-medium hover:bg-[#c5221f] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <span className="material-icons-round text-base animate-spin">autorenew</span>
            ) : (
              <span className="material-icons-round text-base">merge_type</span>
            )}
            强制合并
          </button>
          {result && (
            <p
              className={`text-sm rounded-lg px-3 py-2 ${
                result.success
                  ? 'text-[#34A853] bg-[#34A853]/10'
                  : 'text-[#EA4335] bg-[#EA4335]/10'
              }`}
            >
              {result.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
