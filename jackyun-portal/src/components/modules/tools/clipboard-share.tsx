'use client';

import { useState } from 'react';

export default function ClipboardShare() {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'idle' | 'copied' | 'pasted' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const chars = text.length;

  function flash(s: 'copied' | 'pasted' | 'error') {
    setStatus(s);
    setTimeout(() => setStatus('idle'), 2000);
  }

  async function handleCopy() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      flash('copied');
    } catch {
      setErrorMsg('复制失败，请检查浏览器权限');
      flash('error');
    }
  }

  async function handlePaste() {
    try {
      const t = await navigator.clipboard.readText();
      setText(t);
      flash('pasted');
    } catch {
      setErrorMsg('粘贴失败，请检查浏览器权限');
      flash('error');
    }
  }

  function handleClear() {
    setText('');
    setStatus('idle');
  }

  const statusConfig = {
    idle: null,
    copied: { msg: '已复制到剪贴板 ✓', color: '#34A853' },
    pasted: { msg: '已从剪贴板粘贴 ✓', color: '#4285F4' },
    error: { msg: errorMsg, color: '#EA4335' },
  };

  const statusInfo = statusConfig[status];

  return (
    <div className="flex flex-col gap-4">
      {/* Textarea */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-[var(--foreground)]">文本内容</label>
          <span className="text-xs text-[var(--muted-foreground)]">{chars} 字符</span>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="在此输入或粘贴文本..."
          rows={10}
          className="w-full rounded-[10px] border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[#4285F4] resize-y"
        />
      </div>

      {/* Status message */}
      {statusInfo && (
        <div
          className="flex items-center gap-2 rounded-[8px] border px-3 py-2 text-sm font-medium"
          style={{
            borderColor: statusInfo.color,
            backgroundColor: `${statusInfo.color}18`,
            color: statusInfo.color,
          }}
        >
          <span className="material-icons-round text-base">
            {status === 'error' ? 'error_outline' : 'check_circle_outline'}
          </span>
          {statusInfo.msg}
        </div>
      )}

      {/* Buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleCopy}
          disabled={!text}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-[10px] py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{ backgroundColor: '#34A853' }}
        >
          <span className="material-icons-round text-base">content_copy</span>
          复制
        </button>
        <button
          onClick={handlePaste}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-[10px] py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: '#4285F4' }}
        >
          <span className="material-icons-round text-base">content_paste</span>
          粘贴
        </button>
        <button
          onClick={handleClear}
          disabled={!text}
          className="flex items-center justify-center gap-1.5 rounded-[10px] border border-[var(--card-border)] px-4 py-2.5 text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors disabled:opacity-40"
        >
          <span className="material-icons-round text-base">delete_outline</span>
          清空
        </button>
      </div>
    </div>
  );
}
