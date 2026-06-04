'use client';

import { useState, useRef, useEffect } from 'react';

interface FillBlankProps {
  userAnswer: string;
  onAnswer: (answer: string) => void;
  disabled: boolean;
  isCorrect: boolean;
  correctAnswer: string;
  showResult: boolean;
}

export default function FillBlank({
  userAnswer,
  onAnswer,
  disabled,
  isCorrect,
  correctAnswer,
  showResult,
}: FillBlankProps) {
  const [text, setText] = useState(userAnswer);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!disabled) {
      inputRef.current?.focus();
    }
  }, [disabled]);

  useEffect(() => {
    setText(userAnswer);
  }, [userAnswer]);

  const handleSubmit = () => {
    if (text.trim() && !disabled) {
      onAnswer(text.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div>
      {!disabled && (
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Fill in the blank..."
              className="w-full rounded-xl border-2 border-[var(--card-border)] bg-[var(--background)] px-4 py-3 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none focus:border-[#4285F4] focus:ring-4 focus:ring-[#4285F4]/10 transition-all"
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={!text.trim()}
            className="flex items-center gap-1.5 px-5 py-3 rounded-xl bg-[#4285F4] text-white text-sm font-medium hover:bg-[#3367d6] disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-all whitespace-nowrap"
          >
            <span className="material-icons-round text-base">check</span>
            Check
          </button>
        </div>
      )}

      {disabled && (
        <div className="space-y-2">
          <div className={`flex items-center gap-3 p-3 rounded-xl border-2 ${
            isCorrect ? 'border-[#34A853] bg-[#34A853]/5' : 'border-[#EA4335] bg-[#EA4335]/5'
          }`}>
            <span className="text-xs font-medium text-[var(--muted-foreground)]">Your answer:</span>
            <span className={`text-sm font-semibold ${isCorrect ? 'text-[#34A853]' : 'text-[#EA4335]'}`}>
              {userAnswer}
            </span>
            {isCorrect ? (
              <span className="material-icons-round text-[#34A853] text-lg ml-auto">check_circle</span>
            ) : (
              <span className="material-icons-round text-[#EA4335] text-lg ml-auto">cancel</span>
            )}
          </div>
          {showResult && (
            <div className="flex items-center gap-3 p-3 rounded-xl border-2 border-[#34A853] bg-[#34A853]/5">
              <span className="text-xs font-medium text-[var(--muted-foreground)]">Correct:</span>
              <span className="text-sm font-semibold text-[#34A853]">{correctAnswer}</span>
              <span className="material-icons-round text-[#34A853] text-lg ml-auto">lightbulb</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}