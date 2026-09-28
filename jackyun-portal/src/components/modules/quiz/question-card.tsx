'use client';

import { useState } from 'react';
import { AnalyzedQuestion } from '@/types/quiz';
import MultipleChoice from './multiple-choice';
import EssayQuestion from './essay-question';
import FillBlank from './fill-blank';
import TrueFalse from './true-false';
import OptionComposer from './option-composer';
import AiFeedbackButton from './ai-feedback-button';
import { UserAnswer } from './quiz-app';

interface QuestionCardProps {
  question: AnalyzedQuestion;
  index: number;
  isActive: boolean;
  userAnswer: UserAnswer | undefined;
  draftAnswer: string;
  onDraft: (answer: string) => void;
  onConfirm: () => void;
  onAnswer: (answer: string) => void;
  showResult: boolean;
  onFocus: () => void;
}

export default function QuestionCard({
  question,
  index,
  isActive,
  userAnswer,
  draftAnswer,
  onDraft,
  onConfirm,
  onAnswer,
  showResult,
  onFocus,
}: QuestionCardProps) {
  const [showExplanation, setShowExplanation] = useState(false);
  const answered = Boolean(userAnswer?.answer && !userAnswer.gradingError);
  const isCorrect = userAnswer?.isCorrect === true;
  const isGrading = userAnswer?.isGrading === true;
  // For essay/fill-blank, don't show result until grading is complete
  const isObjective = ['multiple_choice', 'true_false', 'multi_select', 'matching', 'ordering'].includes(question.type);
  const effectiveShowResult = showResult && answered && (isObjective || !isGrading);

  const typeLabel = {
    multiple_choice: 'Multiple Choice',
    multi_select: 'Multiple Select',
    fill_blank: 'Fill in the Blank',
    numeric: 'Numeric / Calculation',
    short_answer: 'Short Answer',
    essay: 'Essay',
    true_false: 'True or False',
    matching: 'Matching',
    ordering: 'Ordering',
  }[question.type] || question.type;

  const typeIcon = {
    multiple_choice: 'checklist',
    multi_select: 'check_box',
    fill_blank: 'edit_note',
    numeric: 'calculate',
    short_answer: 'short_text',
    essay: 'article',
    true_false: 'toggle_on',
    matching: 'swap_horiz',
    ordering: 'format_list_numbered',
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
            effectiveShowResult ? (isCorrect ? 'bg-[#34A853] text-white' : 'bg-[#EA4335] text-white') :
            'bg-[var(--background)] text-[var(--muted-foreground)]'
          }`}>
            {effectiveShowResult ? (
              isCorrect ? '✓' : '✗'
            ) : isGrading ? (
              <span className="material-icons-round text-sm animate-spin">sync</span>
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
        {showResult && answered && !isGrading && (
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
            selectedAnswer={userAnswer?.answer || draftAnswer}
            onSelect={onDraft}
            disabled={!!answered}
            isCorrect={isCorrect}
            correctAnswer={question.correctAnswer}
            showResult={showResult}
          />
        )}

        {(question.type === 'essay' || question.type === 'short_answer') && (
          <EssayQuestion
            userAnswer={userAnswer?.answer || ''}
            onAnswer={onAnswer}
            disabled={!!answered}
            correctAnswer={question.correctAnswer}
            showResult={showResult}
            isCorrect={isCorrect}
          />
        )}

        {(question.type === 'fill_blank' || question.type === 'numeric') && (
          <FillBlank
            userAnswer={userAnswer?.answer || ''}
            onAnswer={onAnswer}
            disabled={!!answered}
            isCorrect={isCorrect}
            correctAnswer={question.correctAnswer}
            showResult={showResult}
          />
        )}

        {userAnswer?.gradingError && <p role="alert" className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">评分暂时失败：{userAnswer.gradingError}。答案未判错，可以重新提交。</p>}

        {question.type === 'true_false' && (
          <TrueFalse
            selectedAnswer={userAnswer?.answer || draftAnswer}
            onSelect={onDraft}
            disabled={!!answered}
            isCorrect={isCorrect}
            correctAnswer={question.correctAnswer}
            showResult={showResult}
          />
        )}

        {(question.type === 'multi_select' || question.type === 'matching' || question.type === 'ordering') && question.options && (
          <OptionComposer
            type={question.type}
            options={question.options}
            value={userAnswer?.answer || ''}
            onSubmit={onAnswer}
            disabled={!!answered}
            showResult={showResult}
            correctAnswer={question.correctAnswer}
          />
        )}

        {!answered && (question.type === 'multiple_choice' || question.type === 'true_false') && <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#4285F4]/20 bg-[#4285F4]/5 p-3"><span className="text-sm text-[var(--muted-foreground)]">{draftAnswer ? '已选中，可修改；确认后才会判题。' : '先选择答案，再确认。'}</span><button type="button" disabled={!draftAnswer} onClick={onConfirm} className="min-h-11 rounded-xl bg-[#4285F4] px-5 text-sm font-semibold text-white disabled:opacity-40">确认答案</button></div>}

        {/* Explanation section */}
        {effectiveShowResult && (
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

    </div>
  );
}
