'use client';

import { QuestionOption } from '@/types/quiz';

interface MultipleChoiceProps {
  options: QuestionOption[];
  selectedAnswer: string;
  onSelect: (answer: string) => void;
  disabled: boolean;
  isCorrect: boolean;
  correctAnswer: string;
  showResult: boolean;
}

export default function MultipleChoice({
  options,
  selectedAnswer,
  onSelect,
  disabled,
  isCorrect,
  correctAnswer,
  showResult,
}: MultipleChoiceProps) {
  const getOptionStyle = (opt: QuestionOption) => {
    const optLabel = opt.label;
    const selectedLabel = selectedAnswer.match(/^([A-Da-d])/)?.[1]?.toUpperCase();
    const correctLabel = correctAnswer.match(/^([A-Da-d])/)?.[1]?.toUpperCase();
    const isSelected = selectedLabel === optLabel.toUpperCase();

    if (!showResult || !disabled) {
      // Before result
      if (isSelected) {
        return 'bg-[#4285F4] text-white border-[#4285F4] shadow-md shadow-[#4285F4]/20';
      }
      return 'bg-[var(--background)] text-[var(--foreground)] border-[var(--card-border)] hover:border-[#4285F4] hover:bg-[#4285F4]/5';
    }

    // After result
    if (optLabel.toUpperCase() === correctLabel) {
      return 'bg-[#34A853]/10 text-[#34A853] border-[#34A853] font-semibold';
    }
    if (isSelected && !isCorrect) {
      return 'bg-[#EA4335]/10 text-[#EA4335] border-[#EA4335]';
    }
    return 'bg-[var(--background)] text-[var(--muted-foreground)] border-[var(--card-border)] opacity-60';
  };

  return (
    <div className="space-y-2">
      {options.map((opt) => {
        const optLabel = opt.label;
        const selectedLabel = selectedAnswer.match(/^([A-Da-d])/)?.[1]?.toUpperCase();
        const isSelected = selectedLabel === optLabel.toUpperCase();

        return (
          <button
            key={optLabel}
            onClick={() => !disabled && onSelect(`${optLabel}) ${opt.text}`)}
            disabled={disabled}
            className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 text-left transition-all duration-200 ${
              getOptionStyle(opt)
            } ${disabled ? 'cursor-default' : 'cursor-pointer active:scale-[0.99]'}`}
          >
            <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-all ${
              isSelected && !showResult
                ? 'bg-white/20 text-white'
                : isSelected && showResult && isCorrect
                ? 'bg-[#34A853] text-white'
                : isSelected && showResult && !isCorrect
                ? 'bg-[#EA4335] text-white'
                : 'bg-[var(--card-border)] text-[var(--muted-foreground)]'
            }`}>
              {optLabel}
            </span>
            <span className="text-sm">{opt.text}</span>
            {showResult && optLabel.toUpperCase() === correctAnswer.match(/^([A-Da-d])/)?.[1]?.toUpperCase() && (
              <span className="material-icons-round text-[#34A853] text-lg ml-auto shrink-0">check_circle</span>
            )}
            {showResult && isSelected && !isCorrect && (
              <span className="material-icons-round text-[#EA4335] text-lg ml-auto shrink-0">cancel</span>
            )}
          </button>
        );
      })}
    </div>
  );
}