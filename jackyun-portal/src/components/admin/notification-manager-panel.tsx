'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getAllNotifications,
  createNotification,
  updateNotification,
  deleteNotification,
  type NotificationInput,
} from '@/actions/admin';
import type { SiteNotification } from '@/types';

interface NotificationFormState {
  title: string;
  content: string;
  content_type: 'html' | 'markdown';
  delivery_type: 'notice' | 'message';
  is_active: boolean;
  start_time: string;
  end_time: string;
}

const EMPTY_FORM: NotificationFormState = {
  title: '',
  content: '',
  content_type: 'markdown',
  delivery_type: 'notice',
  is_active: true,
  start_time: '',
  end_time: '',
};

function formatDate(iso: string | null): string {
  if (!iso) return '永久';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isCurrentlyActive(n: SiteNotification): boolean {
  const now = new Date().getTime();
  if (n.start_time && new Date(n.start_time).getTime() > now) return false;
  if (n.end_time && new Date(n.end_time).getTime() < now) return false;
  return true;
}

export function NotificationManagerPanel() {
  const [notifications, setNotifications] = useState<SiteNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<NotificationFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAllNotifications();
      setNotifications(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(n: SiteNotification) {
    setEditingId(n.id);
    setForm({
      title: n.title,
      content: n.content,
      content_type: n.content_type,
      delivery_type: n.delivery_type ?? 'notice',
      is_active: n.is_active,
      start_time: n.start_time ? n.start_time.slice(0, 16) : '',
      end_time: n.end_time ? n.end_time.slice(0, 16) : '',
    });
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.title.trim() && !form.content.trim()) {
      setError('请输入标题或内容');
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);

    const input: NotificationInput = {
      title: form.title,
      content: form.content,
      content_type: form.content_type,
      delivery_type: form.delivery_type,
      is_active: form.is_active,
      start_time: form.start_time ? new Date(form.start_time).toISOString() : null,
      end_time: form.end_time ? new Date(form.end_time).toISOString() : null,
    };

    try {
      const result =
        editingId !== null
          ? await updateNotification(editingId, input)
          : await createNotification(input);
      if (!result.success) {
        setError(result.error ?? '保存失败');
      } else {
        setSuccess(editingId ? '通知已更新' : '通知已创建');
        setModalOpen(false);
        load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('确定要删除这条通知吗？删除后不可恢复。')) return;
    setDeletingId(id);
    setError(null);
    setSuccess(null);
    try {
      const result = await deleteNotification(id);
      if (!result.success) {
        setError(result.error ?? '删除失败');
      } else {
        setSuccess('通知已删除');
        load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleToggleActive(n: SiteNotification) {
    setError(null);
    setSuccess(null);
    try {
      const result = await updateNotification(n.id, {
        title: n.title,
        content: n.content,
        content_type: n.content_type,
        delivery_type: n.delivery_type ?? 'notice',
        is_active: !n.is_active,
        start_time: n.start_time,
        end_time: n.end_time,
      });
      if (!result.success) {
        setError(result.error ?? '操作失败');
      } else {
        setSuccess(n.is_active ? '通知已停用' : '通知已启用');
        load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败');
    }
  }

  const inputCls =
    'w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4] transition-colors';

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-[var(--muted-foreground)]">
          这里只管理面向全体用户的公告：“通知”会弹窗并显示在通知列表；“消息”仅显示在通知列表。工单私信不会出现在此处。
        </p>
        <button
          onClick={openCreate}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#4285F4] text-white text-sm font-medium hover:bg-[#3367d6] transition-colors"
        >
          <span className="material-icons-round text-base">add</span>
          新建通知 / 消息
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

      {/* List */}
      {loading ? (
        <p className="text-sm text-[var(--muted-foreground)] italic">加载中...</p>
      ) : notifications.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)] italic">
          暂无通知，点击「新建通知」创建第一条。
        </p>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const active = n.is_active && isCurrentlyActive(n);
            return (
              <div
                key={n.id}
                className="rounded-xl border border-[var(--card-border)] p-3 flex items-start gap-3"
              >
                {/* Status dot */}
                <span
                  className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                    active
                      ? 'bg-[#34A853]'
                      : n.is_active
                      ? 'bg-[#FBBC05]'
                      : 'bg-[#EA4335]'
                  }`}
                  title={
                    active
                      ? '展示中'
                      : n.is_active
                      ? '未到有效期'
                      : '已停用'
                  }
                />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-[var(--foreground)] truncate">
                      {n.title || '（无标题）'}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                        n.content_type === 'html'
                          ? 'bg-[#EA4335]/10 text-[#EA4335]'
                          : 'bg-[#4285F4]/10 text-[#4285F4]'
                      }`}
                    >
                      {n.content_type === 'html' ? 'HTML' : 'Markdown'}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${n.delivery_type === 'message' ? 'bg-[#9E77ED]/10 text-[#7F56D9]' : 'bg-[#34A853]/10 text-[#027A48]'}`}>
                      {n.delivery_type === 'message' ? '消息（仅中心）' : '通知（弹窗 + 中心）'}
                    </span>
                    {!n.is_active && (
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-[#EA4335]/10 text-[#EA4335]">
                        已停用
                      </span>
                    )}
                    {n.is_active && !isCurrentlyActive(n) && (
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-[#FBBC05]/10 text-[#FBBC05]">
                        未在有效期
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--muted-foreground)] mt-1 line-clamp-2 break-all">
                    {n.content.length > 120 ? n.content.slice(0, 120) + '...' : n.content}
                  </p>
                  <p className="text-[10px] text-[var(--muted-foreground)] mt-1.5">
                    {formatDate(n.start_time)} → {formatDate(n.end_time)} · 创建于{' '}
                    {new Date(n.created_at).toLocaleDateString('zh-CN')}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleToggleActive(n)}
                    className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--card-border)]/50 hover:text-[var(--foreground)] transition-colors"
                    title={n.is_active ? '停用' : '启用'}
                  >
                    <span className="material-icons-round text-base">
                      {n.is_active ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                  <button
                    onClick={() => openEdit(n)}
                    className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--card-border)]/50 hover:text-[var(--foreground)] transition-colors"
                    title="编辑"
                  >
                    <span className="material-icons-round text-base">edit</span>
                  </button>
                  <button
                    onClick={() => handleDelete(n.id)}
                    disabled={deletingId === n.id}
                    className="p-1.5 rounded-lg text-[#EA4335] hover:bg-[#EA4335]/10 transition-colors disabled:opacity-40"
                    title="删除"
                  >
                    <span className="material-icons-round text-base">
                      {deletingId === n.id ? 'hourglass_top' : 'delete'}
                    </span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
        >
          <div role="dialog" aria-modal="true" className="flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-2xl">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--card-border)]">
              <h3 className="text-base font-bold text-[var(--foreground)]">
                {editingId ? '编辑通知' : '新建通知'}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--card-border)]/50 transition-colors"
              >
                <span className="material-icons-round text-lg">close</span>
              </button>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {/* Title */}
              <div>
                <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">
                  标题
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="通知标题（显示在弹窗顶部）"
                  className={inputCls}
                />
              </div>

              {/* Content type */}
              <div>
                <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">投递方式</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setForm({ ...form, delivery_type: 'notice' })} className={`rounded-lg border px-3 py-2 text-sm font-medium ${form.delivery_type === 'notice' ? 'border-[#34A853] bg-[#34A853]/10 text-[#027A48]' : 'border-[var(--card-border)] text-[var(--muted-foreground)]'}`}>通知<br /><span className="text-[10px] font-normal">弹窗 + 通知</span></button>
                  <button type="button" onClick={() => setForm({ ...form, delivery_type: 'message' })} className={`rounded-lg border px-3 py-2 text-sm font-medium ${form.delivery_type === 'message' ? 'border-[#7F56D9] bg-[#9E77ED]/10 text-[#7F56D9]' : 'border-[var(--card-border)] text-[var(--muted-foreground)]'}`}>消息<br /><span className="text-[10px] font-normal">仅通知</span></button>
                </div>
              </div>

              {/* Content type */}
              <div>
                <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">
                  内容格式
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, content_type: 'markdown' })}
                    className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      form.content_type === 'markdown'
                        ? 'border-[#4285F4] bg-[#4285F4]/10 text-[#4285F4]'
                        : 'border-[var(--card-border)] text-[var(--muted-foreground)] hover:border-[var(--card-border)]'
                    }`}
                  >
                    <span className="material-icons-round text-base mr-1 align-middle">description</span>
                    Markdown
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, content_type: 'html' })}
                    className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      form.content_type === 'html'
                        ? 'border-[#EA4335] bg-[#EA4335]/10 text-[#EA4335]'
                        : 'border-[var(--card-border)] text-[var(--muted-foreground)] hover:border-[var(--card-border)]'
                    }`}
                  >
                    <span className="material-icons-round text-base mr-1 align-middle">code</span>
                    HTML
                  </button>
                </div>
              </div>

              {/* Content */}
              <div>
                <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">
                  内容
                </label>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  placeholder={
                    form.content_type === 'markdown'
                      ? '支持 Markdown：\n# 标题\n**加粗**\n- 列表项\n[链接](https://...)\n\n> 引用'
                      : '输入 HTML 代码，例如：\n<div style="color:red">公告内容</div>'
                  }
                  rows={8}
                  className={`${inputCls} font-mono text-xs leading-relaxed resize-y`}
                />
                <p className="text-[10px] text-[var(--muted-foreground)] mt-1">
                  {form.content_type === 'markdown'
                    ? '支持标题、粗体、斜体、链接、列表、引用、代码块等常见语法'
                    : '支持任意 HTML 代码，可自定义样式'}
                </p>
              </div>

              {/* Validity period */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">
                    开始时间
                  </label>
                  <input
                    type="datetime-local"
                    value={form.start_time}
                    onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">
                    结束时间
                  </label>
                  <input
                    type="datetime-local"
                    value={form.end_time}
                    onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                    className={inputCls}
                  />
                </div>
              </div>
              <p className="text-[10px] text-[var(--muted-foreground)] -mt-2">
                留空表示立即开始 / 永久有效
              </p>

              {/* Is active */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="w-4 h-4 accent-[#4285F4]"
                />
                <span className="text-sm text-[var(--foreground)]">创建后立即启用</span>
              </label>
            </div>

            {/* Modal footer */}
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-[var(--card-border)]">
              <button
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-[var(--card-border)] text-sm font-medium text-[var(--muted-foreground)] hover:bg-[var(--card-border)]/30 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1 px-4 py-2 rounded-lg bg-[#4285F4] text-white text-sm font-medium hover:bg-[#3367d6] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                <span className="material-icons-round text-base">
                  {saving ? 'hourglass_top' : 'save'}
                </span>
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
