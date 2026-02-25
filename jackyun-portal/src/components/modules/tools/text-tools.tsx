'use client';

import { useState } from 'react';

export default function TextTools() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const lines = input ? input.split('\n') : [];
  const words = input.trim() ? input.trim().split(/\s+/) : [];
  const chars = input.length;

  function run(fn: () => string) {
    setError('');
    try {
      setOutput(fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败');
    }
  }

  const actions: { label: string; icon: string; color: string; fn: () => string }[] = [
    {
      label: '转大写',
      icon: 'text_fields',
      color: '#4285F4',
      fn: () => input.toUpperCase(),
    },
    {
      label: '转小写',
      icon: 'text_fields',
      color: '#4285F4',
      fn: () => input.toLowerCase(),
    },
    {
      label: '去重（按行）',
      icon: 'filter_list',
      color: '#34A853',
      fn: () => [...new Set(input.split('\n'))].join('\n'),
    },
    {
      label: '排序（字母序）',
      icon: 'sort',
      color: '#34A853',
      fn: () =>
        input
          .split('\n')
          .sort((a, b) => a.localeCompare(b))
          .join('\n'),
    },
    {
      label: 'Base64 编码',
      icon: 'lock',
      color: '#FBBC05',
      fn: () => {
        try {
          return btoa(unescape(encodeURIComponent(input)));
        } catch {
          throw new Error('Base64 编码失败，请检查输入');
        }
      },
    },
    {
      label: 'Base64 解码',
      icon: 'lock_open',
      color: '#FBBC05',
      fn: () => {
        try {
          return decodeURIComponent(escape(atob(input.trim())));
        } catch {
          throw new Error('Base64 解码失败，请检查输入是否为有效的 Base64 字符串');
        }
      },
    },
    {
      label: 'JSON 格式化',
      icon: 'data_object',
      color: '#EA4335',
      fn: () => {
        try {
          return JSON.stringify(JSON.parse(input), null, 2);
        } catch {
          throw new Error('JSON 解析失败，请检查输入是否为有效的 JSON');
        }
      },
    },
  ];

  async function handleCopy() {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('复制失败，请手动复制');
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Input */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-[var(--foreground)]">输入文本</label>
          <div className="flex gap-3 text-xs text-[var(--muted-foreground)]">
            <span>{chars} 字符</span>
            <span>{words.length} 词</span>
            <span>{lines.length} 行</span>
          </div>
        </div>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="在此输入文本..."
          rows={6}
          className="w-full rounded-[10px] border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[#4285F4] resize-y font-mono"
        />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <ActionButton key={a.label} label={a.label} icon={a.icon} color={a.color} onClick={() => run(a.fn)} />
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-[8px] border border-[#EA4335] bg-[#EA4335]/10 px-3 py-2 text-sm text-[#EA4335]">
          <span className="material-icons-round text-base">error_outline</span>
          {error}
        </div>
      )}

      {/* Output */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-[var(--foreground)]">输出结果</label>
          <button
            onClick={handleCopy}
            disabled={!output}
            className="flex items-center gap-1 rounded-[8px] px-3 py-1 text-xs font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: copied ? '#34A853' : '#4285F4', color: '#fff' }}
          >
            <span className="material-icons-round text-sm">{copied ? 'check' : 'content_copy'}</span>
            {copied ? '已复制' : '一键复制'}
          </button>
        </div>
        <textarea
          value={output}
          readOnly
          placeholder="操作结果将显示在此处..."
          rows={6}
          className="w-full rounded-[10px] border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none resize-y font-mono"
        />
      </div>
    </div>
  );
}

function ActionButton({
  label,
  icon,
  color,
  onClick,
}: {
  label: string;
  icon: string;
  color: string;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex items-center gap-1.5 rounded-[8px] border px-3 py-1.5 text-xs font-medium transition-colors"
      style={{
        backgroundColor: hovered ? color : 'transparent',
        borderColor: hovered ? color : 'var(--card-border)',
        color: hovered ? '#fff' : 'var(--foreground)',
      }}
    >
      <span className="material-icons-round text-sm">{icon}</span>
      {label}
    </button>
  );
}
