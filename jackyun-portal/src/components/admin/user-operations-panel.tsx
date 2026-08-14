'use client';

import { useMemo, useState } from 'react';
import { setAccountStatus, type ManagedUser } from '@/actions/admin';

export default function UserOperationsPanel({ users, currentUserId }: { users: ManagedUser[]; currentUserId: string }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'suspended' | 'deleted'>('all');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const visible = useMemo(() => users.filter((user) => {
    const search = `${user.display_name ?? ''} ${user.email ?? ''} ${user.id}`.toLowerCase().includes(query.toLowerCase());
    const state = filter === 'all' || (filter === 'deleted' ? Boolean(user.deleted_at) : user.account_status === filter);
    return search && state;
  }), [users, query, filter]);
  const changeStatus = async (user: ManagedUser) => {
    const next = user.account_status === 'active' ? 'suspended' : 'active';
    const reason = next === 'suspended' ? prompt('暂停原因（会向管理员显示）：') ?? '' : '';
    if (next === 'suspended' && !reason.trim()) return;
    setPendingId(user.id); setNotice('');
    const result = await setAccountStatus(user.id, next, reason);
    setNotice(result.success ? `已${next === 'suspended' ? '暂停' : '恢复'}该账户，请刷新列表查看最新状态。` : result.error ?? '操作失败');
    setPendingId(null);
  };
  return <div className="space-y-4"><div className="flex flex-col gap-3 sm:flex-row"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索姓名、邮箱或用户 ID" className="h-10 flex-1 rounded-lg border border-[#d0d5dd] bg-white px-3 text-sm outline-none focus:border-[#155eef] dark:border-white/15 dark:bg-white/5" /><div className="flex gap-1 rounded-lg bg-[#f2f4f7] p-1 dark:bg-white/5">{([['all', '全部'], ['active', '正常'], ['suspended', '已暂停'], ['deleted', '待恢复']] as const).map(([value, label]) => <button key={value} onClick={() => setFilter(value)} className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${filter === value ? 'bg-white text-[#155eef] shadow-sm dark:bg-[#344054]' : 'text-[#667085] dark:text-[#98a2b3]'}`}>{label}</button>)}</div></div>{notice && <p className="rounded-lg bg-[#eff8ff] px-3 py-2 text-xs text-[#175cd3]">{notice}</p>}<div className="overflow-x-auto rounded-xl border border-[#eaecf0] dark:border-white/10"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-[#f9fafb] text-xs text-[#667085] dark:bg-white/5 dark:text-[#98a2b3]"><tr><th className="px-4 py-3">用户</th><th className="px-4 py-3">角色</th><th className="px-4 py-3">状态</th><th className="px-4 py-3">云端数据</th><th className="px-4 py-3">注册时间</th><th className="px-4 py-3" /></tr></thead><tbody>{visible.map((user) => <tr key={user.id} className="border-t border-[#eaecf0] dark:border-white/10"><td className="px-4 py-3"><p className="font-medium">{user.display_name || '未命名用户'}</p><p className="mt-0.5 text-xs text-[#667085] dark:text-[#98a2b3]">{user.email || user.id}</p></td><td className="px-4 py-3"><span className="rounded-full bg-[#eff4ff] px-2 py-1 text-xs font-medium text-[#175cd3]">{user.role}</span></td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-medium ${user.deleted_at ? 'bg-[#fef3f2] text-[#b42318]' : user.account_status === 'suspended' ? 'bg-[#fffaeb] text-[#b54708]' : 'bg-[#ecfdf3] text-[#027a48]'}`}>{user.deleted_at ? '待恢复' : user.account_status === 'suspended' ? '已暂停' : '正常'}</span>{user.suspended_reason && <p className="mt-1 max-w-32 truncate text-xs text-[#667085]" title={user.suspended_reason}>{user.suspended_reason}</p>}</td><td className="px-4 py-3 text-xs text-[#667085] dark:text-[#98a2b3]">{user.focus_sessions} 次专注<br />{user.legacy_records} 条旧模块记录</td><td className="px-4 py-3 text-xs text-[#667085] dark:text-[#98a2b3]">{new Date(user.created_at).toLocaleDateString('zh-CN')}</td><td className="px-4 py-3 text-right">{user.id !== currentUserId && !user.deleted_at && <button onClick={() => changeStatus(user)} disabled={pendingId === user.id} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${user.account_status === 'active' ? 'bg-[#fef3f2] text-[#b42318]' : 'bg-[#ecfdf3] text-[#027a48]'}`}>{pendingId === user.id ? '处理中…' : user.account_status === 'active' ? '暂停账户' : '恢复账户'}</button>}</td></tr>)}</tbody></table>{visible.length === 0 && <p className="p-8 text-center text-sm text-[#667085]">未找到用户</p>}</div></div>;
}
