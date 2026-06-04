-- QuizWise: Quiz sessions, questions, subjects, and settings

-- Quiz subjects (predefined + custom)
CREATE TABLE IF NOT EXISTS public.quiz_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'custom',
  is_custom BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, name)
);
ALTER TABLE public.quiz_subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own quiz_subjects" ON public.quiz_subjects FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Quiz sessions
CREATE TABLE IF NOT EXISTS public.quiz_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES public.quiz_subjects(id) ON DELETE SET NULL,
  subject_name TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  total_questions INTEGER DEFAULT 0,
  correct_count INTEGER DEFAULT 0,
  accuracy DECIMAL(5,2) DEFAULT 0,
  duration_seconds INTEGER DEFAULT 0
);
ALTER TABLE public.quiz_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own quiz_sessions" ON public.quiz_sessions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Individual questions
CREATE TABLE IF NOT EXISTS public.quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.quiz_sessions(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'multiple_choice',
  options JSONB,
  correct_answer TEXT NOT NULL,
  user_answer TEXT,
  is_correct BOOLEAN,
  explanation TEXT,
  answered_at TIMESTAMPTZ,
  order_index INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own quiz_questions" ON public.quiz_questions FOR ALL
USING (EXISTS (SELECT 1 FROM public.quiz_sessions WHERE quiz_sessions.id = quiz_questions.session_id AND quiz_sessions.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.quiz_sessions WHERE quiz_sessions.id = quiz_questions.session_id AND quiz_sessions.user_id = auth.uid()));

-- User quiz settings
CREATE TABLE IF NOT EXISTS public.quiz_settings (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  show_answer_immediately BOOLEAN DEFAULT true,
  auto_submit_on_enter BOOLEAN DEFAULT true,
  default_subject_id UUID,
  selected_subjects UUID[] DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.quiz_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own quiz_settings" ON public.quiz_settings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_user_id ON public.quiz_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_started_at ON public.quiz_sessions(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_session_id ON public.quiz_questions(session_id);