'use client';

import { AnalyzedQuestion } from '@/types/quiz';
import { UserAnswer } from './quiz-app';

interface ResultDisplayProps {
  questions: AnalyzedQuestion[];
  userAnswers: UserAnswer[];
  onRetry: () => void;
  onFinish: () => void;
  onJumpToQuestion: () => void;
}

export default function ResultDisplay({
  questions,
  userAnswers,
  onRetry,
  onFinish,
  onJumpToQuestion,
}: ResultDisplayProps) {
  const correctCount = userAnswers.filter(a => a.isCorrect === true).length;
  const total = questions.length;
  const accuracy = total > 0 ? Math.round((correctCount / total) * 100) : 0;
  const answeredCount = userAnswers.filter(a => a.answer !== '').length;

  const getGradeEmoji = (pct: number) => {
    if (pct >= 90) return '🌟';
    if (pct >= 80) return '🎉';
    if (pct >= 70) return '👍';
    if (pct >= 60) return '💪';
    if (pct >= 40) return '📚';
    return '💡';
  };

  const getGradeLabel = (pct: number) => {
    if (pct >= 90) return 'Excellent!';
    if (pct >= 80) return 'Great job!';
    if (pct >= 70) return 'Good work!';
    if (pct >= 60) return 'Keep it up!';
    if (pct >= 40) return 'More practice needed';
    return 'Keep studying!';
  };

  const getGradeColor = (pct: number) => {
    if (pct >= 80) return 'from-[#34A853] to-[#0F9D58]';
    if (pct >= 60) return 'from-[#FBBC04] to-[#F9A825]';
    return 'from-[#EA4335] to-[#D32F2F]';
  };

  return (
    <div className="animate-fade-in space-y-6">
      {/* Score Card */}
      <div className="text-center p-8 rounded-2xl bg-[var(--card)] border-2 border-[var(--card-border)]">
        <div className="relative inline-flex items-center justify-center mb-4">
          <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
            <circle
              cx="60" cy="60" r="52"
              fill="none"
              stroke="var(--card-border)"
              strokeWidth="8"
            />
            <circle
              cx="60" cy="60" r="52"
              fill="none"
              stroke={`url(#scoreGradient)`}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 52}`}
              strokeDashoffset={`${2 * Math.PI * 52 * (1 - accuracy / 100)}`}
              className="transition-all duration-1000 ease-out"
              style={{ filter: 'drop-shadow(0 2px 4px rgba(66, 133, 244, 0.3))' }}
            />
            <defs>
              <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={accuracy >= 60 ? '#34A853' : '#EA4335'} />
                <stop offset="100%" stopColor={accuracy >= 60 ? '#4285F4' : '#F9A825'} />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold text-[var(--foreground)]">{accuracy}%</span>
            <span className="text-xs text-[var(--muted-foreground)]">{correctCount}/{total}</span>
          </div>
        </div>
        <p className="text-2xl font-bold text-[var(--foreground)]">
          {getGradeEmoji(accuracy)} {getGradeLabel(accuracy)}
        </p>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">
          {answeredCount} of {total} questions answered
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-4 rounded-xl bg-[#34A853]/5 border border-[#34A853]/10 text-center">
          <span className="material-icons-round text-[#34A853] text-xl">check_circle</span>
          <p className="text-lg font-bold text-[#34A853]">{correctCount}</p>
          <p className="text-[10px] text-[var(--muted-foreground)]">Correct</p>
        </div>
        <div className="p-4 rounded-xl bg-[#EA4335]/5 border border-[#EA4335]/10 text-center">
          <span className="material-icons-round text-[#EA4335] text-xl">cancel</span>
          <p className="text-lg font-bold text-[#EA4335]">{total - correctCount}</p>
          <p className="text-[10px] text-[var(--muted-foreground)]">Incorrect</p>
        </div>
        <div className="p-4 rounded-xl bg-[#4285F4]/5 border border-[#4285F4]/10 text-center">
          <span className="material-icons-round text-[#4285F4] text-xl">quiz</span>
          <p className="text-lg font-bold text-[#4285F4]">{total}</p>
          <p className="text-[10px] text-[var(--muted-foreground)]">Total</p>
        </div>
      </div>

      {/* Question Breakdown */}
      <div className="p-4 rounded-xl bg-[var(--card)] border border-[var(--card-border)]">
        <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">Question Breakdown</h3>
        <div className="space-y-2">
          {questions.map((q, i) => {
            const answer = userAnswers[i];
            const isCorrect = answer?.isCorrect === true;
            const answered = answer?.answer !== '';
            return (
              <button
                key={i}
                onClick={onJumpToQuestion}
                className="w-full flex items-center gap-3 p-3 rounded-xl text-left hover:bg-[var(--background)] transition-colors"
              >
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  answered
                    ? isCorrect
                      ? 'bg-[#34A853] text-white'
                      : 'bg-[#EA4335] text-white'
                    : 'bg-[var(--card-border)] text-[var(--muted-foreground)]'
                }`}>
                  {answered ? (isCorrect ? '✓' : '✗') : '?'}
                </span>
                <span className="flex-1 text-sm text-[var(--foreground)] truncate">
                  Q{i + 1}: {q.questionText.slice(0, 80)}{q.questionText.length > 80 ? '...' : ''}
                </span>
                <span className="material-icons-round text-xs text-[var(--muted-foreground)]">visibility</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pb-8">
        <button
          onClick={onJumpToQuestion}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-[#4285F4] text-[#4285F4] font-medium text-sm hover:bg-[#4285F4]/5 active:scale-[0.98] transition-all"
        >
          <span className="material-icons-round text-base">visibility</span>
          Review Answers
        </button>
        <button
          onClick={onRetry}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[var(--background)] border border-[var(--card-border)] text-[var(--foreground)] font-medium text-sm hover:bg-[var(--card-border)] active:scale-[0.98] transition-all"
        >
          <span className="material-icons-round text-base">replay</span>
          Retry Quiz
        </button>
        <button
          onClick={onFinish}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#4285F4] text-white font-medium text-sm hover:bg-[#3367d6] active:scale-[0.98] transition-all shadow-md"
        >
          <span className="material-icons-round text-base">home</span>
          Done
        </button>
      </div>
    </div>
  );
}