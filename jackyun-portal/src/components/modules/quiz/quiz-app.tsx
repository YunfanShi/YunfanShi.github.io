'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { AnalyzedQuestion, QuizQuestion, QuestionOption, QuestionType } from '@/types/quiz';
import { analyzeQuestions, gradeAnswer, checkMultipleChoice } from '@/lib/quiz/question-analyzer';
import {
  saveCurrentQuestionsSync,
  getCurrentQuestionsSync,
  clearCurrentQuestions,
  saveCurrentSession,
  clearCurrentSession,
  getQuizSettings,
  saveQuizSettings,
} from '@/lib/quiz/storage';
import {
  createSession,
  saveAnswer,
  completeSession,
} from '@/actions/quiz';
import QuestionInput from './question-input';
import QuestionCard from './question-card';
import ResultDisplay from './result-display';
import QuizHistory from './quiz-history';
import QuizSettingsPanel from './quiz-settings';
import SubjectSelector from './subject-selector';
import ProgressBar from './progress-bar';

type View =
  | 'input'       // initial input screen
  | 'analyzing'   // AI is analyzing questions
  | 'subject'     // select subject after analysis
  | 'quiz'        // actively answering
  | 'results'     // completed, showing results
  | 'history'     // past quiz history
  | 'settings';   // quiz settings

export interface UserAnswer {
  questionIndex: number;
  answer: string;
  isCorrect: boolean | null;
}

/** Map AI-returned type strings to valid QuestionType */
function normalizeQuestionType(raw: string): QuestionType {
  const map: Record<string, QuestionType> = {
    multiple_choice: 'multiple_choice',
    mcq: 'multiple_choice',
    fill_blank: 'fill_blank',
    fill: 'fill_blank',
    essay: 'essay',
    long_answer: 'essay',
    short_answer: 'essay',
    true_false: 'true_false',
    tf: 'true_false',
    matching: 'matching',
  };
  const key = (raw || '').toLowerCase().replace(/[\s-]/g, '_');
  return map[key] || 'essay';
}

export default function QuizApp() {
  const [view, setView] = useState<View>('input');
  const [questions, setQuestions] = useState<AnalyzedQuestion[]>([]);
  const [dbQuestions, setDbQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<UserAnswer[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [subjectName, setSubjectName] = useState<string>('');
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [settings, setSettings] = useState(() => getQuizSettings());
  const [inputText, setInputText] = useState('');
  const questionRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Restore in-progress quiz on mount
  useEffect(() => {
    const saved = getCurrentQuestionsSync();
    if (saved.length > 0) {
      // Normalize types on restore
      const normalized = saved.map(q => ({
        ...q,
        type: normalizeQuestionType(q.type),
      }));
      setQuestions(normalized);
      setView('subject');
    }
  }, []);

  // Analyze questions
  const handleAnalyze = useCallback(async (rawText: string) => {
    setSubjectName('');
    setSessionId(null);
    setUserAnswers([]);
    setCurrentIndex(0);
    setAnalyzeError(null);
    setView('analyzing');
    setInputText(rawText);

    const result = await analyzeQuestions(rawText);
    if (result.error) {
      setAnalyzeError(result.error);
      setView('input');
      return;
    }

    // Normalize question types
    const normalized = result.questions.map(q => ({
      ...q,
      type: normalizeQuestionType(q.type),
    }));

    setQuestions(normalized);
    saveCurrentQuestionsSync(normalized);
    setView('subject');
  }, []);

  // Start quiz with subject
  const handleStartQuiz = useCallback(async (subject: string) => {
    setSubjectName(subject);
    setUserAnswers(questions.map(() => ({ questionIndex: 0, answer: '', isCorrect: null })));
    setCurrentIndex(0);
    setView('quiz');

    // Create session in DB — now returns real question IDs
    const result = await createSession(subject, questions);
    if ('sessionId' in result) {
      setSessionId(result.sessionId);
      saveCurrentSession({ id: result.sessionId, startedAt: new Date().toISOString() });

      // Use REAL question IDs from DB
      const questionIds = result.questionIds;
      setDbQuestions(questions.map((q, i) => ({
        id: questionIds[i] || '',      // REAL UUID from DB
        session_id: result.sessionId,
        question_text: q.questionText,
        question_type: q.type,
        options: q.options,
        correct_answer: q.correctAnswer,
        user_answer: null,
        is_correct: null,
        explanation: q.explanation,
        answered_at: null,
        order_index: i,
      })));
    }
  }, [questions]);

  // Answer a question
  const handleAnswer = useCallback(async (
    questionIndex: number,
    answer: string,
    questionData: { questionText: string; correctAnswer: string; type: QuestionType; options?: QuestionOption[] | null },
  ) => {
    let isCorrect: boolean | null = null;

    // For multiple choice, check locally first (no AI needed)
    if (questionData.type === 'multiple_choice' && questionData.options) {
      isCorrect = checkMultipleChoice(answer, questionData.correctAnswer);
    } else {
      // AI grading for other types
      const grade = await gradeAnswer(
        {
          questionText: questionData.questionText,
          correctAnswer: questionData.correctAnswer,
          type: questionData.type,
        },
        answer,
      );
      if ('isCorrect' in grade) {
        isCorrect = grade.isCorrect;
      }
    }

    // Update answers
    setUserAnswers(prev => {
      const updated = [...prev];
      updated[questionIndex] = { questionIndex, answer, isCorrect };
      return updated;
    });

    // Save to DB — now uses real question ID
    const qId = dbQuestions[questionIndex]?.id;
    if (sessionId && qId) {
      saveAnswer(sessionId, qId, answer, isCorrect ?? false);
    }
  }, [sessionId, dbQuestions]);

  // Navigate to next question
  const handleNext = useCallback(() => {
    if (currentIndex < questions.length - 1) {
      const next = currentIndex + 1;
      setCurrentIndex(next);
      // Scroll to next question
      questionRefs.current.get(next)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentIndex, questions.length]);

  // Jump to question
  const handleJumpToQuestion = useCallback((index: number) => {
    setCurrentIndex(index);
    questionRefs.current.get(index)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  // Complete quiz
  const handleComplete = useCallback(async () => {
    if (sessionId) {
      await completeSession(sessionId);
    }
    clearCurrentQuestions();
    clearCurrentSession();
    setView('results');
  }, [sessionId]);

  // Finish and go back
  const handleFinishReview = useCallback(() => {
    clearCurrentQuestions();
    clearCurrentSession();
    setQuestions([]);
    setUserAnswers([]);
    setSessionId(null);
    setSubjectName('');
    setView('input');
  }, []);

  // Settings change
  const handleSettingsChange = useCallback((newSettings: typeof settings) => {
    setSettings(newSettings);
    saveQuizSettings(newSettings);
  }, []);

  // Retry same questions
  const handleRetry = useCallback(() => {
    setUserAnswers(questions.map(() => ({ questionIndex: 0, answer: '', isCorrect: null })));
    setCurrentIndex(0);
    setSessionId(null);
    setView('subject');
  }, [questions]);

  const correctCount = userAnswers.filter(a => a.isCorrect === true).length;
  const answeredCount = userAnswers.filter(a => a.answer !== '').length;
  const allAnswered = questions.length > 0 && answeredCount === questions.length;

  return (
    <div className="max-w-[720px] mx-auto h-full flex flex-col">
      {/* Header / Navigation */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <h1 className="text-xl font-bold text-[var(--foreground)] flex items-center gap-2">
          <span className="material-icons-round text-[#4285F4] text-2xl">quiz</span>
          QuizWise
        </h1>
        <div className="flex items-center gap-1">
          <button
            onClick={() => { setView('input'); setInputText(''); }}
            className={`p-2 rounded-lg text-sm transition-all ${
              view === 'input' ? 'bg-[#4285F4] text-white' : 'text-[var(--muted-foreground)] hover:bg-[var(--background)]'
            }`}
          >
            <span className="material-icons-round text-base">{view === 'quiz' ? 'add' : 'edit'}</span>
          </button>
          <button
            onClick={() => setView('history')}
            className={`p-2 rounded-lg text-sm transition-all ${
              view === 'history' ? 'bg-[#4285F4] text-white' : 'text-[var(--muted-foreground)] hover:bg-[var(--background)]'
            }`}
          >
            <span className="material-icons-round text-base">history</span>
          </button>
          <button
            onClick={() => setView('settings')}
            className={`p-2 rounded-lg text-sm transition-all ${
              view === 'settings' ? 'bg-[#4285F4] text-white' : 'text-[var(--muted-foreground)] hover:bg-[var(--background)]'
            }`}
          >
            <span className="material-icons-round text-base">settings</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Question Input View */}
        {(view === 'input' || view === 'analyzing') && (
          <QuestionInput
            inputText={inputText}
            setInputText={setInputText}
            onAnalyze={handleAnalyze}
            isAnalyzing={view === 'analyzing'}
            error={analyzeError}
          />
        )}

        {/* Subject Selection */}
        {view === 'subject' && (
          <SubjectSelector
            questions={questions}
            onStart={handleStartQuiz}
            onCancel={() => { setView('input'); clearCurrentQuestions(); }}
          />
        )}

        {/* Quiz View */}
        {view === 'quiz' && (
          <div className="space-y-1">
            {/* Progress */}
            <ProgressBar
              total={questions.length}
              current={currentIndex}
              correct={correctCount}
              incorrect={answeredCount - correctCount}
              onJumpTo={handleJumpToQuestion}
              userAnswers={userAnswers}
            />

            {/* Questions */}
            <div className="space-y-2 mt-2">
              {questions.map((q, i) => (
                <div
                  key={i}
                  ref={(el) => { if (el) questionRefs.current.set(i, el); }}
                >
                  <QuestionCard
                    question={q}
                    index={i}
                    isActive={i === currentIndex}
                    userAnswer={userAnswers[i]}
                    onAnswer={(answer) => handleAnswer(i, answer, {
                      questionText: q.questionText,
                      correctAnswer: q.correctAnswer,
                      type: q.type as QuestionType,
                      options: q.options,
                    })}
                    showResult={settings.show_answer_immediately && userAnswers[i]?.answer !== ''}
                    onNext={handleNext}
                    onFocus={() => setCurrentIndex(i)}
                    isLast={i === questions.length - 1}
                  />
                </div>
              ))}
            </div>

            {/* Complete Button */}
            {allAnswered && (
              <div className="pt-4 pb-8 flex justify-center">
                <button
                  onClick={handleComplete}
                  className="flex items-center gap-2 px-8 py-3 rounded-xl bg-gradient-to-r from-[#4285F4] to-[#34A853] text-white font-semibold text-base shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all animate-fade-in"
                >
                  <span className="material-icons-round">check_circle</span>
                  Complete Quiz
                  <span className="ml-1 text-sm opacity-80">({correctCount}/{questions.length})</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Results View */}
        {view === 'results' && (
          <ResultDisplay
            questions={questions}
            userAnswers={userAnswers}
            onRetry={handleRetry}
            onFinish={handleFinishReview}
            onJumpToQuestion={() => {
              setView('quiz');
              // Jump to first wrong answer
              const firstWrong = userAnswers.findIndex(a => !a.isCorrect);
              setCurrentIndex(firstWrong >= 0 ? firstWrong : 0);
            }}
          />
        )}

        {/* History View */}
        {view === 'history' && (
          <QuizHistory onClose={() => setView('input')} />
        )}

        {/* Settings View */}
        {view === 'settings' && (
          <QuizSettingsPanel
            settings={settings}
            onChange={handleSettingsChange}
            onClose={() => setView('input')}
          />
        )}
      </div>
    </div>
  );
}