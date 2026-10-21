'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';

interface EssayQuestionProps {
  userAnswer: string;
  onAnswer: (answer: string) => void;
  disabled: boolean;
  correctAnswer: string;
  showResult: boolean;
  isCorrect: boolean;
}

export default function EssayQuestion({
  userAnswer,
  onAnswer,
  disabled,
  correctAnswer,
  showResult,
  isCorrect,
}: EssayQuestionProps) {
  const [text, setText] = useState(userAnswer);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!disabled) {
      textareaRef.current?.focus();
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
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div>
      {!disabled && (
        <div className="space-y-3">
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your answer here... AI will grade your response."
            rows={5}
            className="resize-none rounded-xl"
          />
          <div className="flex items-center gap-2">
            <Button
              onClick={handleSubmit}
              disabled={!text.trim()}
              className="px-4"
            >
              <span className="material-icons-round text-base">check</span>
              Submit Answer
            </Button>
            <span className="text-xs text-[var(--muted-foreground)]">
              or <kbd className="px-1.5 py-0.5 rounded bg-[var(--background)] border border-[var(--card-border)] font-mono text-[10px]">⌘ + ↵</kbd>
            </span>
          </div>
        </div>
      )}

      {disabled && (
        <div className="space-y-3">
          {/* User's submitted answer */}
          <div className={`p-3 rounded-xl border-2 ${
            isCorrect ? 'border-[#34A853] bg-[#34A853]/5' : 'border-[#EA4335] bg-[#EA4335]/5'
          }`}>
            <p className="text-xs font-medium text-[var(--muted-foreground)] mb-1">Your Answer:</p>
            <p className="text-sm text-[var(--foreground)] whitespace-pre-wrap">{userAnswer}</p>
          </div>

          {showResult && (
            <div className="p-3 rounded-xl border-2 border-[#34A853] bg-[#34A853]/5">
              <p className="text-xs font-medium text-[#34A853] mb-1">Correct Answer:</p>
              <p className="text-sm text-[var(--foreground)] whitespace-pre-wrap">{correctAnswer}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
