'use client';

import { UserAnswer } from './quiz-app';

interface ProgressBarProps {
  total: number;
  current: number;
  correct: number;
  incorrect: number;
  onJumpTo: (index: number) => void;
  userAnswers: UserAnswer[];
}

export default function ProgressBar({
  total,
  current,
  correct,
  incorrect,
  onJumpTo,
  userAnswers,
}: ProgressBarProps) {
  return (
    <div className="sticky top-0 z-20 bg-[var(--background)]/90 backdrop-blur-md pt-1 pb-3">
      {/* Stats row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-[var(--foreground)]">
            Question {current + 1} of {total}
          </span>
          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1 text-[#34A853]">
              <span className="material-icons-round text-xs">check</span>
              {correct}
            </span>
            <span className="flex items-center gap-1 text-[#EA4335]">
              <span className="material-icons-round text-xs">close</span>
              {incorrect}
            </span>
          </div>
        </div>
        <span className="text-xs text-[var(--muted-foreground)]">
          {total - correct - incorrect} remaining
        </span>
      </div>

      {/* Progress bar */}
      <div className="flex gap-1">
        {Array.from({ length: total }).map((_, i) => {
          const answered = userAnswers[i]?.answer && userAnswers[i].answer !== '';
          const isCorrect = userAnswers[i]?.isCorrect === true;
          return (
            <button
              key={i}
              onClick={() => onJumpTo(i)}
              className={`flex-1 h-2 rounded-full transition-all duration-300 hover:opacity-80 cursor-pointer ${
                i === current
                  ? 'ring-2 ring-[#4285F4] ring-offset-1'
                  : ''
              } ${
                answered
                  ? isCorrect
                    ? 'bg-[#34A853]'
                    : 'bg-[#EA4335]'
                  : 'bg-[var(--card-border)]'
              }`}
              title={`Question ${i + 1}${answered ? (isCorrect ? ' ✓' : ' ✗') : ''}`}
            />
          );
        })}
      </div>

      {/* Question numbers (compact) */}
      <div className="flex gap-1 mt-1.5 justify-center">
        {Array.from({ length: total }).map((_, i) => {
          const answered = userAnswers[i]?.answer !== '';
          const isCorrect = userAnswers[i]?.isCorrect === true;
          return (
            <button
              key={i}
              onClick={() => onJumpTo(i)}
              className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium transition-all ${
                i === current
                  ? 'bg-[#4285F4] text-white shadow-md'
                  : answered
                  ? isCorrect
                    ? 'bg-[#34A853]/10 text-[#34A853]'
                    : 'bg-[#EA4335]/10 text-[#EA4335]'
                  : 'bg-[var(--background)] text-[var(--muted-foreground)] hover:bg-[var(--card-border)]'
              }`}
            >
              {answered ? (isCorrect ? '✓' : '✗') : i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}