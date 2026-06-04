'use client';

import { useState } from 'react';
import { AnalyzedQuestion, QuestionOption } from '@/types/quiz';
import MultipleChoice from './multiple-choice';
import EssayQuestion from './essay-question';
import FillBlank from './fill-blank';
import TrueFalse from './true-false';
import AiFeedbackButton from './ai-feedback-button';
import { UserAnswer } from './quiz-app';

interface QuestionCardProps {
  question: AnalyzedQuestion;
  index: number;
  isActive: boolean;
  userAnswer: UserAnswer | undefined;
  onAnswer: (answer: string) => void;
  showResult: boolean;
  onNext: () => void;
  onFocus: () => void;
  isLast: boolean;
}

export default function QuestionCard({
  question,
  index,
  isActive,
  userAnswer,
  onAnswer,
  showResult,
  onNext,
  onFocus,
  isLast,
}: QuestionCardProps) {
  const [showExplanation, setShowExplanation] = useState(false);
  const answered = userAnswer?.answer && userAnswer.answer !== '';
  const isCorrect = userAnswer?.isCorrect === true;

  const typeLabel = {
    multiple_choice: 'Multiple Choice',
    fill_blank: 'Fill in the Blank',
    essay: 'Essay',
    true_false: 'True or False',
    matching: 'Matching',
  }[question.type] || question.type;

  const typeIcon = {
    multiple_choice: 'checklist',
    fill_blank: 'edit_note',
    essay: 'article',
    true_false: 'toggle_on',
    matching: 'swap_horiz',
  }[question.type] || 'quiz';

  return (
    <div
      className={`rounded-2xl border-2 transition-all duration-300 ${
        isActive
          ? 'border-[#4285F4] shadow-lg shadow-[#4285F4]/10 bg-[var(--card)]'
          : showResult && answered
          ? isCorrect
            ? 'border-[#34A853]/30 bg-[var(--card)]'
            : 'border-[#EA4335]/30 bg-[var(--card)]'
          : 'border-[var(--card-border)] bg-[var(--card)]'
      }`}
      onClick={onFocus}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
            isActive ? 'bg-[#4285F4] text-white' :
            showResult && answered ? (isCorrect ? 'bg-[#34A853] text-white' : 'bg-[#EA4335] text-white') :
            'bg-[var(--background)] text-[var(--muted-foreground)]'
          }`}>
            {showResult && answered ? (
              isCorrect ? '✓' : '✗'
            ) : (
              index + 1
            )}
          </span>
          <div className="flex items-center gap-1.5">
            <span className="material-icons-round text-sm text-[var(--muted-foreground)]">{typeIcon}</span>
            <span className="text-xs font-medium text-[var(--muted-foreground)] capitalize">
              {typeLabel}
            </span>
          </div>
        </div>
        {showResult && answered && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
            isCorrect ? 'bg-[#34A853]/10 text-[#34A853]' : 'bg-[#EA4335]/10 text-[#EA4335]'
          }`}>
            {isCorrect ? 'Correct' : 'Incorrect'}
          </span>
        )}
      </div>

      {/* Question Text */}
      <div className="px-5 pb-3">
        <p className="text-[15px] font-medium text-[var(--foreground)] leading-relaxed">
          {question.questionText}
        </p>
      </div>

      {/* Answer Area */}
      <div className="px-5 pb-4">
        {question.type === 'multiple_choice' && question.options && (
          <MultipleChoice
            options={question.options}
            selectedAnswer={userAnswer?.answer || ''}
            onSelect={onAnswer}
            disabled={!!answered}
            isCorrect={isCorrect}
            correctAnswer={question.correctAnswer}
            showResult={showResult}
          />
        )}

        {question.type === 'essay' && (
          <EssayQuestion
            userAnswer={userAnswer?.answer || ''}
            onAnswer={onAnswer}
            disabled={!!answered}
            correctAnswer={question.correctAnswer}
            showResult={showResult}
            isCorrect={isCorrect}
          />
        )}

        {question.type === 'fill_blank' && (
          <FillBlank
            userAnswer={userAnswer?.answer || ''}
            onAnswer={onAnswer}
            disabled={!!answered}
            isCorrect={isCorrect}
            correctAnswer={question.correctAnswer}
            showResult={showResult}
          />
        )}

        {question.type === 'true_false' && (
          <TrueFalse
            selectedAnswer={userAnswer?.answer || ''}
            onSelect={onAnswer}
            disabled={!!answered}
            isCorrect={isCorrect}
            correctAnswer={question.correctAnswer}
            showResult={showResult}
          />
        )}

        {/* Explanation section */}
        {showResult && answered && (
          <div className="mt-3 space-y-2">
            {question.explanation && (
              <button
                onClick={() => setShowExplanation(!showExplanation)}
                className="flex items-center gap-1 text-xs text-[#4285F4] hover:underline"
              >
                <span className="material-icons-round text-sm">
                  {showExplanation ? 'expand_less' : 'expand_more'}
                </span>
                {showExplanation ? 'Hide' : 'Show'} explanation
              </button>
            )}
            {showExplanation && question.explanation && (
              <div className="p-3 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-sm text-[var(--muted-foreground)] leading-relaxed animate-fade-in">
                {question.explanation}
              </div>
            )}

            {/* AI Feedback */}
            <AiFeedbackButton
              question={{ questionText: question.questionText, correctAnswer: question.correctAnswer }}
              userAnswer={userAnswer?.answer || ''}
            />
          </div>
        )}
      </div>

      {/* Next button */}
      {isActive && answered && !isLast && (
        <div className="px-5 pb-4">
          <button
            onClick={(e) => { e.stopPropagation(); onNext(); }}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[var(--background)] border border-[var(--card-border)] text-sm font-medium text-[var(--foreground)] hover:bg-[#4285F4] hover:text-white hover:border-[#4285F4] active:scale-[0.98] transition-all"
          >
            Next Question
            <span className="material-icons-round text-base">arrow_forward</span>
          </button>
        </div>
      )}
    </div>
  );
}