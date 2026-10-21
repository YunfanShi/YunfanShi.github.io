'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
    queueMicrotask(() => setText(userAnswer));
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
            <Input
              ref={inputRef}
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Fill in the blank..."
              className="rounded-xl"
            />
          </div>
          <Button
            onClick={handleSubmit}
            disabled={!text.trim()}
            className="whitespace-nowrap px-5"
          >
            <span className="material-icons-round text-base">check</span>
            Check
          </Button>
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
