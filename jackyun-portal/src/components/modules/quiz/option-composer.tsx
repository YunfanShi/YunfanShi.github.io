'use client';

import { useState } from 'react';
import { QuestionOption, QuestionType } from '@/types/quiz';

interface Props {
  type: Extract<QuestionType, 'multi_select' | 'matching' | 'ordering'>;
  options: QuestionOption[];
  value: string;
  onSubmit: (answer: string) => void;
  disabled: boolean;
  showResult: boolean;
  correctAnswer: string;
}

export default function OptionComposer({ type, options, value, onSubmit, disabled, showResult, correctAnswer }: Props) {
  const [selected, setSelected] = useState<string[]>(() => value ? value.split(',').map(item => item.trim()) : []);
  const isOrdering = type === 'ordering';

  function toggle(label: string) {
    if (disabled) return;
    setSelected(previous => {
      if (isOrdering) return previous.includes(label) ? previous.filter(item => item !== label) : [...previous, label];
      return previous.includes(label) ? previous.filter(item => item !== label) : [...previous, label];
    });
  }

  function submit() {
    if (!selected.length || disabled) return;
    const answer = isOrdering
      ? selected.join(',')
      : options.filter(option => selected.includes(option.label)).map(option => option.label).join(',');
    onSubmit(answer);
  }

  const title = type === 'ordering' ? '按正确顺序点击项目' : type === 'matching' ? '选择所有正确配对' : '选择所有正确答案';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 text-xs text-[var(--muted-foreground)]">
        <span>{title}</span>
        {!disabled && selected.length > 0 && <button type="button" onClick={() => setSelected([])} className="text-[#4285F4] hover:underline">清空</button>}
      </div>
      {isOrdering && selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 rounded-xl border border-[#4285F4]/20 bg-[#4285F4]/5 p-2.5">
          {selected.map((label, index) => (
            <span key={label} className="rounded-lg bg-[#4285F4] px-2 py-1 text-xs font-semibold text-white">{index + 1}. {label}</span>
          ))}
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const checked = selected.includes(option.label);
          return (
            <button
              type="button"
              key={option.label}
              onClick={() => toggle(option.label)}
              disabled={disabled}
              className={`flex min-h-12 items-start gap-3 rounded-xl border p-3 text-left transition-colors ${checked ? 'border-[#4285F4] bg-[#4285F4]/10' : 'border-[var(--card-border)] bg-[var(--background)] hover:border-[#4285F4]/50'} disabled:cursor-default`}
            >
              <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-xs font-bold ${checked ? 'bg-[#4285F4] text-white' : 'bg-[var(--card)] text-[var(--muted-foreground)]'}`}>
                {isOrdering && checked ? selected.indexOf(option.label) + 1 : checked ? '✓' : option.label}
              </span>
              <span className="text-sm leading-relaxed text-[var(--foreground)]">{option.text}</span>
            </button>
          );
        })}
      </div>
      {!disabled && (
        <button type="button" onClick={submit} disabled={!selected.length} className="min-h-11 rounded-xl bg-[#4285F4] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#3367d6] disabled:opacity-40">
          确认答案
        </button>
      )}
      {showResult && value && <p className="text-xs text-[var(--muted-foreground)]">标准答案：{correctAnswer}</p>}
    </div>
  );
}
