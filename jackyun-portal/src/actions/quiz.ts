'use server';

import { createClient } from '@/lib/supabase/server';
import { AnalyzedQuestion, QuizSession, QuizQuestion, QuizSessionWithQuestions, QuizSubject } from '@/types/quiz';

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
  return { supabase, user };
}

// ========== Sessions ==========

export async function createSession(
  subjectName: string,
  questions: AnalyzedQuestion[],
): Promise<{ sessionId: string } | { error: string }> {
  try {
    const { supabase, user } = await getAuthenticatedUser();

    // Ensure subject exists
    const { data: subject } = await supabase
      .from('quiz_subjects')
      .upsert(
        {
          user_id: user.id,
          name: subjectName,
          category: 'custom',
          is_custom: false,
        },
        { onConflict: 'user_id,name' },
      )
      .select('id')
      .single();

    // Create session
    const { data: session, error: sessionError } = await supabase
      .from('quiz_sessions')
      .insert({
        user_id: user.id,
        subject_id: subject?.id ?? null,
        subject_name: subjectName,
        total_questions: questions.length,
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (sessionError || !session) throw new Error(sessionError?.message ?? 'Failed to create session');

    // Insert questions
    const questionsToInsert = questions.map((q, idx) => ({
      session_id: session.id,
      question_text: q.questionText,
      question_type: q.type,
      options: q.options,
      correct_answer: q.correctAnswer,
      explanation: q.explanation,
      order_index: idx,
    }));

    const { error: qError } = await supabase.from('quiz_questions').insert(questionsToInsert);
    if (qError) throw new Error(qError.message);

    return { sessionId: session.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to create session' };
  }
}

export async function saveAnswer(
  sessionId: string,
  questionId: string,
  userAnswer: string,
  isCorrect: boolean,
): Promise<{ ok: boolean } | { error: string }> {
  try {
    const { supabase, user } = await getAuthenticatedUser();

    // Verify session ownership
    const { data: session } = await supabase
      .from('quiz_sessions')
      .select('user_id')
      .eq('id', sessionId)
      .single();

    if (!session || session.user_id !== user.id) throw new Error('Session not found');

    const { error } = await supabase
      .from('quiz_questions')
      .update({
        user_answer: userAnswer,
        is_correct: isCorrect,
        answered_at: new Date().toISOString(),
      })
      .eq('id', questionId)
      .eq('session_id', sessionId);

    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to save answer' };
  }
}

export async function completeSession(sessionId: string): Promise<{ ok: boolean } | { error: string }> {
  try {
    const { supabase, user } = await getAuthenticatedUser();

    // Verify session ownership
    const { data: session } = await supabase
      .from('quiz_sessions')
      .select('user_id, started_at')
      .eq('id', sessionId)
      .single();

    if (!session || session.user_id !== user.id) throw new Error('Session not found');

    // Count correct answers
    const { count: correctCount } = await supabase
      .from('quiz_questions')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .eq('is_correct', true);

    // Count total
    const { count: totalCount } = await supabase
      .from('quiz_questions')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sessionId);

    const duration = Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000);
    const accuracy = totalCount && totalCount > 0
      ? Math.round(((correctCount ?? 0) / totalCount) * 10000) / 100
      : 0;

    const { error } = await supabase
      .from('quiz_sessions')
      .update({
        completed_at: new Date().toISOString(),
        correct_count: correctCount ?? 0,
        accuracy,
        duration_seconds: duration,
      })
      .eq('id', sessionId);

    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to complete session' };
  }
}

// ========== History ==========

export async function getSessionHistory(
  limit = 20,
  offset = 0,
): Promise<{ sessions: QuizSession[] } | { error: string }> {
  try {
    const { supabase, user } = await getAuthenticatedUser();
    const { data, error } = await supabase
      .from('quiz_sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('started_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(error.message);
    return { sessions: data as QuizSession[] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to load history' };
  }
}

export async function getSessionQuestions(
  sessionId: string,
): Promise<{ session: QuizSessionWithQuestions } | { error: string }> {
  try {
    const { supabase, user } = await getAuthenticatedUser();

    const { data: session } = await supabase
      .from('quiz_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single();

    if (!session) throw new Error('Session not found');

    const { data: questions } = await supabase
      .from('quiz_questions')
      .select('*')
      .eq('session_id', sessionId)
      .order('order_index');

    return {
      session: {
        ...(session as QuizSession),
        questions: (questions as QuizQuestion[]) ?? [],
      },
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to load session' };
  }
}

export async function deleteSession(sessionId: string): Promise<{ ok: boolean } | { error: string }> {
  try {
    const { supabase, user } = await getAuthenticatedUser();

    const { error } = await supabase
      .from('quiz_sessions')
      .delete()
      .eq('id', sessionId)
      .eq('user_id', user.id);

    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to delete session' };
  }
}

// ========== Stats ==========

export async function getQuizStats(): Promise<{
  totalQuizzes: number;
  totalQuestions: number;
  averageAccuracy: number;
  totalTimeMinutes: number;
} | { error: string }> {
  try {
    const { supabase, user } = await getAuthenticatedUser();

    const { data: sessions, error } = await supabase
      .from('quiz_sessions')
      .select('correct_count, total_questions, accuracy, duration_seconds')
      .eq('user_id', user.id)
      .not('completed_at', 'is', null);

    if (error) throw new Error(error.message);

    const sessions_data = sessions ?? [];
    const totalQuizzes = sessions_data.length;
    const totalQuestions = sessions_data.reduce((sum: number, s: { total_questions?: number }) => sum + (s.total_questions ?? 0), 0);
    const averageAccuracy = totalQuizzes > 0
      ? Math.round(sessions_data.reduce((sum: number, s: { accuracy?: number }) => sum + (s.accuracy ?? 0), 0) / totalQuizzes)
      : 0;
    const totalTimeMinutes = Math.round(
      sessions_data.reduce((sum: number, s: { duration_seconds?: number }) => sum + (s.duration_seconds ?? 0), 0) / 60,
    );

    return { totalQuizzes, totalQuestions, averageAccuracy, totalTimeMinutes };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to load stats' };
  }
}

// ========== Settings ==========

export async function getQuizSettingsDB(): Promise<{
  show_answer_immediately: boolean;
  auto_submit_on_enter: boolean;
  default_subject_id: string | null;
  selected_subjects: string[];
} | { error: string }> {
  try {
    const { supabase, user } = await getAuthenticatedUser();

    const { data, error } = await supabase
      .from('quiz_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) throw new Error(error.message);

    return {
      show_answer_immediately: data?.show_answer_immediately ?? true,
      auto_submit_on_enter: data?.auto_submit_on_enter ?? true,
      default_subject_id: data?.default_subject_id ?? null,
      selected_subjects: data?.selected_subjects ?? [],
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to load settings' };
  }
}

export async function saveQuizSettingsDB(
  show_answer_immediately: boolean,
  auto_submit_on_enter: boolean,
  default_subject_id: string | null,
  selected_subjects: string[],
): Promise<{ ok: boolean } | { error: string }> {
  try {
    const { supabase, user } = await getAuthenticatedUser();

    const { error } = await supabase.from('quiz_settings').upsert(
      {
        user_id: user.id,
        show_answer_immediately,
        auto_submit_on_enter,
        default_subject_id,
        selected_subjects,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to save settings' };
  }
}

// ========== Subjects ==========

export async function getUserSubjects(): Promise<{ subjects: QuizSubject[] } | { error: string }> {
  try {
    const { supabase, user } = await getAuthenticatedUser();

    const { data, error } = await supabase
      .from('quiz_subjects')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return { subjects: data as QuizSubject[] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to load subjects' };
  }
}

export async function addCustomSubject(
  name: string,
  category: string = 'custom',
): Promise<{ subject: QuizSubject } | { error: string }> {
  try {
    const { supabase, user } = await getAuthenticatedUser();

    const { data, error } = await supabase
      .from('quiz_subjects')
      .insert({
        user_id: user.id,
        name,
        category,
        is_custom: true,
      })
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return { subject: data as QuizSubject };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to add subject' };
  }
}

export async function deleteSubject(
  subjectId: string,
): Promise<{ ok: boolean } | { error: string }> {
  try {
    const { supabase, user } = await getAuthenticatedUser();

    const { error } = await supabase
      .from('quiz_subjects')
      .delete()
      .eq('id', subjectId)
      .eq('user_id', user.id);

    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to delete subject' };
  }
}