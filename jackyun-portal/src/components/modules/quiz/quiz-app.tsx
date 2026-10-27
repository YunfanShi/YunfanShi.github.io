'use client';
import { workspaceStorage } from '@/lib/sync/repository';
import { CLOUD_STATE_APPLIED_EVENT } from '@/lib/local-workspace';


import { useState, useEffect, useCallback, useRef } from 'react';
import { AnalyzedQuestion, QuizQuestion, QuestionOption, QuestionType } from '@/types/quiz';
import { analyzeQuestions, gradeAnswer, checkMultipleChoice } from '@/lib/quiz/question-analyzer';
import { parseQuizQuestions } from '@/lib/quiz/question-import';
import {
  getCurrentQuestions,
  getCurrentQuestionsSync,
  clearCurrentQuestions,
  clearCurrentQuizProgress,
  getCurrentQuizProgress,
  quizProgressMatchesQuestions,
  getCurrentSession,
  saveCurrentQuestions,
  saveCurrentQuizProgress,
  saveCurrentSession,
  clearCurrentSession,
  getQuizSettings,
  saveQuizSettings,
  appendLocalQuizHistory,
} from '@/lib/quiz/storage';
import {
  createSession,
  saveAnswer,
  completeSession,
} from '@/actions/quiz';
import { elapsedSeconds } from '@/lib/learning/metrics';
import QuestionInput from './question-input';
import QuestionCard from './question-card';
import ResultDisplay from './result-display';
import QuizHistory from './quiz-history';
import QuizSettingsPanel from './quiz-settings';
import SubjectSelector from './subject-selector';
import ProgressBar from './progress-bar';
import { useAuthMode } from '@/components/auth/auth-mode-provider';
import { Button } from '@/components/ui/button';

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
  /** Whether this answer is still being graded by AI (essay/fill-blank only) */
  isGrading?: boolean;
  gradingError?: string;
}

/** Map AI-returned type strings to valid QuestionType */
function normalizeQuestionType(raw: string): QuestionType {
  const map: Record<string, QuestionType> = {
    multiple_choice: 'multiple_choice',
    mcq: 'multiple_choice',
    multi_select: 'multi_select',
    multiple_select: 'multi_select',
    checkbox: 'multi_select',
    fill_blank: 'fill_blank',
    fill: 'fill_blank',
    numeric: 'numeric',
    calculation: 'numeric',
    numerical: 'numeric',
    essay: 'essay',
    long_answer: 'essay',
    short_answer: 'short_answer',
    short_response: 'short_answer',
    true_false: 'true_false',
    tf: 'true_false',
    matching: 'matching',
    ordering: 'ordering',
    sequence: 'ordering',
  };
  const key = (raw || '').toLowerCase().replace(/[\s-]/g, '_');
  return map[key] || 'essay';
}

export default function QuizApp() {
  const { signedIn } = useAuthMode();
  const [view, setView] = useState<View>('input');
  const [questions, setQuestions] = useState<AnalyzedQuestion[]>([]);
  const [dbQuestions, setDbQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<UserAnswer[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [subjectName, setSubjectName] = useState<string>('');
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [progressSaveError, setProgressSaveError] = useState<string | null>(null);
  const [serverAnswerPending, setServerAnswerPending] = useState(false);
  const [settings, setSettings] = useState(() => getQuizSettings());
  const [inputText, setInputText] = useState('');
  const [draftAnswers, setDraftAnswers] = useState<Record<number, string>>({});
  const quizStartedAtRef = useRef<string | null>(null);
  const progressRestoreHandledRef = useRef(false);
  const progressRestoreInFlightRef = useRef(false);
  const progressRestoreEventVersionRef = useRef(0);

  // Restore in-progress quiz on mount
  useEffect(() => {
    const restore = async () => {
      if (progressRestoreHandledRef.current || progressRestoreInFlightRef.current) return;
      progressRestoreInFlightRef.current = true;
      const eventVersion = progressRestoreEventVersionRef.current;
      try {
        let saved = getCurrentQuestionsSync();
        if (!saved.length) saved = await getCurrentQuestions();
        if (!saved.length) return;
        const progress = getCurrentQuizProgress();
        const normalized = saved.map(q => ({ ...q, type: normalizeQuestionType(q.type) }));
        if (progress && !quizProgressMatchesQuestions(progress, normalized)) return;
        progressRestoreHandledRef.current = Boolean(progress);
        queueMicrotask(() => {
          setQuestions(normalized);
          if (progress?.subjectName) {
            const restoredAnswers = normalized.map((_, index) => progress.answers.find(answer => answer.questionIndex === index)
              ?? { questionIndex: index, answer: '', isCorrect: null });
            setUserAnswers(restoredAnswers);
            setCurrentIndex(Math.min(progress.currentIndex, Math.max(0, normalized.length - 1)));
            setSessionId(progress.sessionId);
            setSubjectName(progress.subjectName);
            setDbQuestions(normalized.map((question, index) => ({
              id: progress.questionIds[index] ?? '', session_id: progress.sessionId ?? '',
              question_text: question.questionText, question_type: question.type, options: question.options,
              correct_answer: question.correctAnswer, user_answer: restoredAnswers[index].answer || null,
              is_correct: restoredAnswers[index].isCorrect, explanation: question.explanation,
              answered_at: restoredAnswers[index].answer ? progress.startedAt : null, order_index: index,
            })));
            quizStartedAtRef.current = progress.startedAt;
            setView('quiz');
          } else {
            setView('subject');
          }
        });
      } finally {
        progressRestoreInFlightRef.current = false;
        if (!progressRestoreHandledRef.current && eventVersion !== progressRestoreEventVersionRef.current) queueMicrotask(() => { void restore(); });
      }
    };
    const onCloudStateApplied = () => {
      progressRestoreEventVersionRef.current++;
      void restore().catch(() => setProgressSaveError('本机 QuizWise 数据读取失败；请勿覆盖或清除现有恢复副本。'));
    };
    void restore().catch(() => setProgressSaveError('本机 QuizWise 数据读取失败；请勿覆盖或清除现有恢复副本。'));
    window.addEventListener(CLOUD_STATE_APPLIED_EVENT, onCloudStateApplied);
    return () => window.removeEventListener(CLOUD_STATE_APPLIED_EVENT, onCloudStateApplied);
  }, []);

  // Analyze questions
  const handleAnalyze = useCallback(async (rawText: string) => {
    progressRestoreHandledRef.current = true;
    setSubjectName('');
    setSessionId(null);
    setUserAnswers([]);
    setCurrentIndex(0);
    setAnalyzeError(null);
    setView('analyzing');
    setProgressSaveError(null);
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

    try {
      await clearCurrentQuizProgress();
    } catch {
      setAnalyzeError('旧测验恢复记录未能安全清理；为避免覆盖尚未确认的答题进度，本次新测验没有替换本机数据。');
      setView('input');
      return;
    }
    try {
      await saveCurrentQuestions(normalized);
    } catch {
      setAnalyzeError('题目未能持久保存到本机；请重试或先导出内容。');
      setView('input');
      return;
    }
    setQuestions(normalized);
    setView('subject');
  }, []);

  const handleImport = useCallback(async (json: string) => {
    progressRestoreHandledRef.current = true;
    try {
      const imported = parseQuizQuestions(json);
      await clearCurrentQuizProgress();
      await saveCurrentQuestions(imported);
      setQuestions(imported);
      setDraftAnswers({});
      setUserAnswers([]);
      setSessionId(null);
      setAnalyzeError(null);
      setView('subject');
    } catch (error) {
      setAnalyzeError(error instanceof Error ? error.message : 'JSON 导入失败。');
    }
  }, []);

  // Consume commands sent by the global/homepage AI assistant. The custom
  // event handles same-page calls; persisted storage handles navigation to /quiz.
  useEffect(() => {
    const consumeAiCommand = () => {
      try {
        const raw = workspaceStorage.getItem('quizwise_ai_command');
        if (!raw) return;
        const command = JSON.parse(raw) as { action?: string; text?: string };
        if (command.action !== 'analyze' || !command.text?.trim()) return;
        workspaceStorage.removeItem('quizwise_ai_command');
        void handleAnalyze(command.text);
      } catch {
        workspaceStorage.removeItem('quizwise_ai_command');
      }
    };
    consumeAiCommand();
    window.addEventListener('quizwise-ai-command', consumeAiCommand);
    return () => window.removeEventListener('quizwise-ai-command', consumeAiCommand);
  }, [handleAnalyze]);

  // Start quiz with subject
  const handleStartQuiz = useCallback(async (subject: string) => {
    progressRestoreHandledRef.current = true;
    const startedAt = new Date().toISOString();
    quizStartedAtRef.current = startedAt;
    try {
      await saveCurrentSession({ id: `local-${crypto.randomUUID()}`, startedAt });
    } catch {
      setProgressSaveError('本机会话缓存未能保存；答题开始前请重试。');
      return;
    }
    setSubjectName(subject);
    setSessionId(null);
    setDraftAnswers({});
    setCurrentIndex(0);
    setView('quiz');
    const blankAnswers = questions.map((_, questionIndex) => ({ questionIndex, answer: '', isCorrect: null }));
    setUserAnswers(blankAnswers);
    try {
      await saveCurrentQuizProgress({ sessionId: null, startedAt, subjectName: subject,
        currentIndex: 0, questionIds: [], answers: blankAnswers });
      setProgressSaveError(null);
    } catch {
      setProgressSaveError('本机答题进度未能安全保存；请先导出题目，暂勿关闭页面。');
    }

    // Create session in DB — now returns real question IDs
    const result = signedIn ? await createSession(subject, questions).catch(() => ({ error: 'local-only' })) : { error: 'local-only' };
    if ('sessionId' in result) {
      setSessionId(result.sessionId);
      await saveCurrentSession({ id: result.sessionId, startedAt }).catch(() => {
        setProgressSaveError('云端会话已建立，但本机会话缓存未能更新；答题快照仍会独立保存。');
      });

      // Use REAL question IDs from DB
      const questionIds = result.questionIds;
      const identifiedQuestions = questions.map((question, index) => ({ ...question, id: questionIds[index] || undefined }));
      setQuestions(identifiedQuestions);
      await saveCurrentQuestions(identifiedQuestions).catch(() => {
        setProgressSaveError('云端会话已建立，但含稳定题目 ID 的本机题目副本未能保存；恢复前会等待一致副本。');
      });
      setDbQuestions(identifiedQuestions.map((q, i) => ({
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
      try {
        await saveCurrentQuizProgress({ sessionId: result.sessionId, startedAt, subjectName: subject,
          currentIndex: 0, questionIds, answers: blankAnswers });
        setProgressSaveError(null);
      } catch {
        setProgressSaveError('本机答题进度未能安全保存；请先导出题目，暂勿关闭页面。');
      }
    } else if (signedIn) {
      setServerAnswerPending(true);
    }
  }, [questions, signedIn]);

  // Answer a question
  const handleAnswer = useCallback(async (
    questionIndex: number,
    answer: string,
    questionData: { questionText: string; correctAnswer: string; type: QuestionType; options?: QuestionOption[] | null },
  ) => {
    let isCorrect: boolean | null = null;

    // Objective questions (MC/TF): instant local check, no AI delay
    if (
      questionData.type === 'multiple_choice' ||
      questionData.type === 'true_false' ||
      questionData.type === 'multi_select' ||
      questionData.type === 'matching' ||
      questionData.type === 'ordering'
    ) {
      isCorrect = checkMultipleChoice(answer, questionData.correctAnswer);
      
      // Update immediately
    } else {
      // Subjective questions (Essay/Fill-blank): AI grading on demand
      // Mark as grading in progress, then update with result
      setUserAnswers(prev => {
        const updated = [...prev];
        updated[questionIndex] = { questionIndex, answer, isCorrect: null, isGrading: true };
        return updated;
      });

    const grade = await gradeAnswer(
        {
          questionText: questionData.questionText,
          correctAnswer: questionData.correctAnswer,
          type: questionData.type,
        },
        answer,
    );
      if ('error' in grade) {
        setUserAnswers((previous) => {
          const updated = [...previous];
          updated[questionIndex] = { questionIndex, answer, isCorrect: null, isGrading: false, gradingError: grade.error };
          return updated;
        });
        return;
      }
      if ('isCorrect' in grade) {
        isCorrect = grade.isCorrect;
      }

      // Update with grading result
    }

    const answerSnapshot = questions.map((_, index) => userAnswers[index] ?? { questionIndex: index, answer: '', isCorrect: null });
    answerSnapshot[questionIndex] = { questionIndex, answer, isCorrect };
    try {
      const current = getCurrentSession();
      await saveCurrentQuizProgress({ sessionId, startedAt: current?.startedAt ?? new Date().toISOString(),
        subjectName, currentIndex: questionIndex, questionIds: dbQuestions.map(question => question.id), answers: answerSnapshot });
      setUserAnswers(answerSnapshot);
      setProgressSaveError(null);
    } catch {
      setUserAnswers(answerSnapshot);
      setProgressSaveError('本机答题进度未能安全保存；答案尚未确认，请先导出题目。');
      return;
    }

    // Save to DB — now uses real question ID
    const qId = dbQuestions[questionIndex]?.id;
    if (sessionId && qId) {
      const result = await saveAnswer(sessionId, qId, answer, isCorrect ?? false).catch(() => ({ error: '网络暂不可用' }));
      setServerAnswerPending('error' in result);
    }
  }, [sessionId, dbQuestions, questions, userAnswers, subjectName]);

  // Navigate to next question
  const handleNext = useCallback(() => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  }, [currentIndex, questions.length]);

  // Jump to question
  const handleJumpToQuestion = useCallback((index: number) => {
    setCurrentIndex(index);
  }, []);

  useEffect(() => {
    if (view !== 'quiz' || !questions.length) return;
    const startedAt = quizStartedAtRef.current ?? getCurrentSession()?.startedAt;
    if (!startedAt) return;
    void saveCurrentQuizProgress({ sessionId, startedAt, subjectName, currentIndex,
      questionIds: dbQuestions.map(question => question.id),
      answers: questions.map((_, questionIndex) => ({
        questionIndex, answer: userAnswers[questionIndex]?.answer ?? '',
        isCorrect: userAnswers[questionIndex]?.isCorrect ?? null,
      })) }).then(() => setProgressSaveError(null))
      .catch(() => setProgressSaveError('本机答题进度未能安全保存；请先导出题目，暂勿关闭页面。'));
  }, [currentIndex, dbQuestions, questions, sessionId, subjectName, userAnswers, view]);

  useEffect(() => {
    if (view !== 'quiz') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLButtonElement && !event.target.dataset.quizOption) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); setCurrentIndex((index) => Math.max(0, index - 1)); return; }
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); setCurrentIndex((index) => Math.min(questions.length - 1, index + 1)); return; }
      const question = questions[currentIndex];
      if (!question || userAnswers[currentIndex]?.answer) return;
      if (event.key === 'Enter' && draftAnswers[currentIndex]) {
        event.preventDefault();
        void handleAnswer(currentIndex, draftAnswers[currentIndex], question);
        return;
      }
      if (question.type === 'multiple_choice' && question.options) {
        const option = question.options.find((item, index) => item.label.toLowerCase() === event.key.toLowerCase() || String(index + 1) === event.key);
        if (option) { event.preventDefault(); setDraftAnswers((current) => ({ ...current, [currentIndex]: `${option.label}) ${option.text}` })); }
      } else if (question.type === 'true_false') {
        const answer = event.key === '1' || event.key.toLowerCase() === 't' ? 'True' : event.key === '2' || event.key.toLowerCase() === 'f' ? 'False' : null;
        if (answer) { event.preventDefault(); setDraftAnswers((current) => ({ ...current, [currentIndex]: answer })); }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentIndex, draftAnswers, handleAnswer, questions, userAnswers, view]);

  // Complete quiz
  const handleComplete = useCallback(async () => {
    if (signedIn && sessionId) {
      const pendingWrites = await Promise.all(userAnswers.map(async (answer, index) => {
        const questionId = dbQuestions[index]?.id;
        if (!answer.answer || !questionId) return false;
        const result = await saveAnswer(sessionId, questionId, answer.answer, answer.isCorrect ?? false).catch(() => ({ error: '网络暂不可用' }));
        return 'error' in result;
      }));
      if (pendingWrites.some(Boolean)) {
        setServerAnswerPending(true);
        setProgressSaveError('本机答题进度已保留；部分云端答案未确认，联网后再次完成测验即可重试。');
        return;
      }
      const completion = await completeSession(sessionId);
      if ('error' in completion) {
        setProgressSaveError('本机答题进度已保留；云端测验完成尚未确认，请稍后重试。');
        return;
      }
    }
    const completedAt = new Date().toISOString();
    const startedAt = quizStartedAtRef.current ?? getCurrentSession()?.startedAt ?? completedAt;
    try {
      await appendLocalQuizHistory({
      id: `local-${crypto.randomUUID()}`,
      subject_name: subjectName || 'Untitled Quiz',
      started_at: startedAt,
      completed_at: completedAt,
      total_questions: questions.length,
      correct_count: userAnswers.filter((answer) => answer.isCorrect === true).length,
      accuracy: questions.length ? Math.round(userAnswers.filter((answer) => answer.isCorrect === true).length / questions.length * 100) : 0,
      duration_seconds: elapsedSeconds(startedAt, completedAt),
      });
    } catch {
      setProgressSaveError('测验成绩未能保存到本机；答题恢复数据仍保留，请重试完成。');
      return;
    }
    try {
      await clearCurrentQuizProgress();
      setProgressSaveError(null);
      setServerAnswerPending(false);
    } catch {
      setProgressSaveError('测验结果已生成，但本机恢复进度未能清理；请勿重复导入同一测验。');
    }
    try {
      await clearCurrentQuestions();
      await clearCurrentSession();
    } catch {
      setProgressSaveError('测验已完成并记入本机历史；旧恢复缓存未能完全清理，请稍后重试。');
    }
    quizStartedAtRef.current = null;
    setView('results');
  }, [dbQuestions, questions.length, sessionId, signedIn, subjectName, userAnswers]);

  // Finish and go back
  const handleFinishReview = useCallback(async () => {
    try {
      await clearCurrentQuizProgress();
      setProgressSaveError(null);
    } catch {
      setProgressSaveError('本机答题恢复进度未能清理；请稍后重试。');
      return;
    }
    try {
      await clearCurrentQuestions();
      await clearCurrentSession();
    } catch {
      setProgressSaveError('本机恢复缓存未能完全清理；请稍后重试。');
      return;
    }
    setQuestions([]);
    setUserAnswers([]);
    setSessionId(null);
    setSubjectName('');
    setView('input');
  }, []);

  // Settings change
  const handleSettingsChange = useCallback(async (newSettings: typeof settings) => {
    setSettings(newSettings);
    try {
      await saveQuizSettings(newSettings);
      setProgressSaveError(null);
    } catch {
      setProgressSaveError('QuizWise 设置未能保存到本机；请重试。');
    }
  }, []);

  // Retry same questions
  const handleRetry = useCallback(() => {
    setUserAnswers(questions.map((_, questionIndex) => ({ questionIndex, answer: '', isCorrect: null })));
    setDraftAnswers({});
    setCurrentIndex(0);
    setSessionId(null);
    void clearCurrentQuizProgress().catch(() => setProgressSaveError('旧测验恢复记录未能清理；新测验进度尚未保存。'));
    setView('subject');
  }, [questions]);

  const correctCount = userAnswers.filter(a => a.isCorrect === true).length;
  const answeredCount = userAnswers.filter(a => a.answer && a.isCorrect !== null).length;
  const allAnswered = questions.length > 0 && answeredCount === questions.length && userAnswers.every((answer) => !answer.isGrading);

  return (
    <div className="max-w-[720px] mx-auto h-full flex flex-col">
      {/* Header / Navigation */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <h1 className="text-xl font-bold text-[var(--foreground)] flex items-center gap-2">
          <span className="material-icons-round text-[#4285F4] text-2xl">quiz</span>
          QuizWise
        </h1>
        <div className="flex items-center gap-1">
          <Button
            variant={view === 'input' ? 'default' : 'ghost'}
            size="icon"
            aria-label={view === 'quiz' ? '新建测验' : '输入题目'}
            onClick={() => { setView('input'); setInputText(''); }}
          >
            <span className="material-icons-round text-base">{view === 'quiz' ? 'add' : 'edit'}</span>
          </Button>
          <Button
            variant={view === 'history' ? 'default' : 'ghost'}
            size="icon"
            aria-label="测验历史"
            onClick={() => setView('history')}
          >
            <span className="material-icons-round text-base">history</span>
          </Button>
          <Button
            variant={view === 'settings' ? 'default' : 'ghost'}
            size="icon"
            aria-label="测验设置"
            onClick={() => setView('settings')}
          >
            <span className="material-icons-round text-base">settings</span>
          </Button>
        </div>
      </div>

      {/* Main Content */}
      {(progressSaveError || serverAnswerPending) && <p role="status" className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
        {progressSaveError ?? (sessionId
          ? '答题进度已保存在本机；云端答案仍有未确认操作，再次完成测验时会重试。'
          : '答题进度已保存在本机；云端测验会话尚未建立。')}
      </p>}
      <div className="flex-1 overflow-y-auto">
        {/* Question Input View */}
        {(view === 'input' || view === 'analyzing') && (
          <QuestionInput
            inputText={inputText}
            setInputText={setInputText}
            onAnalyze={handleAnalyze}
            onImport={handleImport}
            isAnalyzing={view === 'analyzing'}
            error={analyzeError}
          />
        )}

        {/* Subject Selection */}
        {view === 'subject' && (
          <SubjectSelector
            questions={questions}
            onStart={handleStartQuiz}
            onCancel={() => { setView('input'); void clearCurrentQuestions().catch(() => setProgressSaveError('题目未能从本机恢复队列清除。')); void clearCurrentQuizProgress().catch(() => setProgressSaveError('本机测验恢复记录未能清理。')); }}
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

            {/* One question at a time, as in Cue study. */}
            <div className="mt-4">
              {questions[currentIndex] && (() => {
                const q = questions[currentIndex];
                const i = currentIndex;
                return (
                  <QuestionCard
                    key={i}
                    question={q}
                    index={i}
                    isActive={i === currentIndex}
                    userAnswer={userAnswers[i]}
                    draftAnswer={draftAnswers[i] ?? ''}
                    onDraft={(answer) => setDraftAnswers((current) => ({ ...current, [i]: answer }))}
                    onConfirm={() => { if (draftAnswers[i]) void handleAnswer(i, draftAnswers[i], q); }}
                    onAnswer={(answer) => handleAnswer(i, answer, {
                      questionText: q.questionText,
                      correctAnswer: q.correctAnswer,
                      type: q.type as QuestionType,
                      options: q.options,
                    })}
                    showResult={settings.show_answer_immediately && userAnswers[i]?.answer !== ''}
                    onFocus={() => {}}
                  />
                );
              })()}
            </div>
            <nav aria-label="切换题目" className="mt-4 flex items-center justify-between gap-3"><Button variant="outline" disabled={currentIndex === 0} onClick={() => setCurrentIndex((index) => index - 1)}>← 上一题</Button><span aria-live="polite" className="text-sm text-[var(--muted-foreground)]">{currentIndex + 1} / {questions.length}</span><Button variant="outline" disabled={currentIndex >= questions.length - 1} onClick={handleNext}>下一题 →</Button></nav>
            <p className="mt-3 text-center text-xs text-[var(--muted-foreground)]">快捷键：← / → 切题；选择题按 A–D 或 1–4 选中；Enter 确认答案。输入框内保留正常输入。</p>

            {/* Complete Button */}
            {allAnswered && (
              <div className="pt-4 pb-8 flex justify-center">
                <Button
                  onClick={handleComplete}
                  className="px-8 text-base font-semibold shadow-lg"
                >
                  <span className="material-icons-round">check_circle</span>
                  Complete Quiz
                  <span className="ml-1 text-sm opacity-80">({correctCount}/{questions.length})</span>
                </Button>
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
