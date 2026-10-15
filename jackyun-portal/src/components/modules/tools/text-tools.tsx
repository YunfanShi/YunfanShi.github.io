'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { useToolDraft } from './tool-drafts';

export default function TextTools() {
  const [input, setInput] = useToolDraft('text.input', '');
  const [output, setOutput] = useToolDraft('text.output', '');
  const [error, setError] = useToolDraft('text.error', '');
  const [copied, setCopied] = useState(false);

  const copyGeneration = useRef(0);
  useEffect(() => () => { copyGeneration.current++; }, []);

  const lines = input ? input.split('\n') : [];
  const words = input.trim() ? input.trim().split(/\s+/) : [];
  const chars = input.length;

  function run(fn: () => string) {
    copyGeneration.current++;
    setCopied(false);
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
    const generation = ++copyGeneration.current;
    try {
      await navigator.clipboard.writeText(output);
      if (generation === copyGeneration.current) setCopied(true);
    } catch {
      if (generation === copyGeneration.current) setError('复制失败，请手动复制');
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Input */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label htmlFor="tool-text-input" className="text-sm font-medium text-[var(--foreground)]">输入文本</label>
          <div className="flex gap-3 text-xs text-[var(--muted-foreground)]">
            <span>{chars} 字符</span>
            <span>{words.length} 词</span>
            <span>{lines.length} 行</span>
          </div>
        </div>
        <Textarea
          id="tool-text-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="在此输入文本..."
          rows={6}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "tool-text-error" : undefined}
          className="font-mono"
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
        <div id="tool-text-error" role="alert" className="jy-notice-error flex items-center gap-2">
          <span className="material-icons-round text-base">error_outline</span>
          {error}
        </div>
      )}

      {/* Output */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label htmlFor="tool-text-output" className="text-sm font-medium text-[var(--foreground)]">输出结果</label>
          <Button
            onClick={handleCopy}
            disabled={!output}
            size="sm"
          >
            <span className="material-icons-round text-sm" aria-hidden="true">{copied ? 'check' : 'content_copy'}</span>
            {copied ? '已复制' : '一键复制'}
          </Button>
        </div>
        <Textarea
          id="tool-text-output"
          value={output}
          readOnly
          placeholder="操作结果将显示在此处..."
          rows={6}
          className="font-mono"
        />
      </div>
    </div>
  );
}

function ActionButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <Button
      onClick={onClick}
      variant="outline"
      size="sm"
    >
      <span className="material-icons-round text-sm" aria-hidden="true">{icon}</span>
      {label}
    </Button>
  );
}
