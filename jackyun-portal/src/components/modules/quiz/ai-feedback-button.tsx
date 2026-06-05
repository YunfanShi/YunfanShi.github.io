'use client';

import { useState, useRef } from 'react';
import { getAIFeedback } from '@/lib/quiz/question-analyzer';

interface AiFeedbackButtonProps {
  question: { questionText: string; correctAnswer: string };
  userAnswer: string;
}

export default function AiFeedbackButton({ question, userAnswer }: AiFeedbackButtonProps) {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleGetFeedback = async () => {
    // Prevent concurrent requests (debounce)
    if (loading) return;

    // Already have feedback → toggle display
    if (feedback) {
      setOpen(!open);
      return;
    }

    // Cancel any in-flight request
    if (abortRef.current) {
      abortRef.current.abort();
    }
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);
    setOpen(true);

    const result = await getAIFeedback(question, userAnswer);

    // Check if request was aborted
    if (abortRef.current?.signal.aborted) return;

    if (result.error) {
      setError(result.error);
    } else if (result.data) {
      setFeedback(result.data);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-2">
      <button
        onClick={handleGetFeedback}
        className="flex items-center gap-1.5 text-xs font-medium text-[#4285F4] hover:text-[#3367d6] hover:bg-[#4285F4]/5 px-2 py-1.5 rounded-lg transition-all"
      >
        <span className="material-icons-round text-sm">question_answer</span>
        {feedback ? (open ? 'Hide AI Feedback' : 'Show AI Feedback') : 'Ask AI for Feedback'}
      </button>

      {open && (
        <div className="p-4 rounded-xl bg-gradient-to-br from-[#4285F4]/5 to-[#34A853]/5 border border-[#4285F4]/10 animate-fade-in">
          <div className="flex items-center gap-2 mb-2">
            <span className="material-icons-round text-[#4285F4] text-sm">smart_toy</span>
            <span className="text-xs font-semibold text-[#4285F4]">AI Tutor</span>
          </div>

          {loading && (
            <div className="flex items-center gap-2 py-3">
              <div className="animate-spin w-3 h-3 border-2 border-[#4285F4] border-t-transparent rounded-full" />
              <span className="text-xs text-[var(--muted-foreground)]">Generating feedback...</span>
            </div>
          )}

          {error && (
            <p className="text-xs text-[#EA4335]">{error}</p>
          )}

          {feedback && (
            <p className="text-sm text-[var(--foreground)] leading-relaxed whitespace-pre-wrap">
              {feedback}
            </p>
          )}
        </div>
      )}
    </div>
  );
}