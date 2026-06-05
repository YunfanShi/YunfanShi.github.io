-- 017_fix_all_tables.sql
-- Comprehensive migration: reset all app tables with correct FK references
-- All FKs now reference auth.users(id) instead of public.profiles(id)

-- ============================================================
-- 1. Drop existing tables (order matters for FK dependencies)
-- ============================================================
DROP TABLE IF EXISTS public.quiz_questions CASCADE;
DROP TABLE IF EXISTS public.quiz_settings CASCADE;
DROP TABLE IF EXISTS public.quiz_sessions CASCADE;
DROP TABLE IF EXISTS public.quiz_subjects CASCADE;
DROP TABLE IF EXISTS public.user_settings CASCADE;
DROP TABLE IF EXISTS public.legacy_sync_data CASCADE;

-- ============================================================
-- 2. Re-create user_settings table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  key text NOT NULL,
  value jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, key)
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own settings" ON public.user_settings
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- 3. Re-create legacy_sync_data table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.legacy_sync_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  storage_key text NOT NULL,
  storage_value jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, storage_key)
);

ALTER TABLE public.legacy_sync_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own legacy data" ON public.legacy_sync_data
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- 4. Re-create quiz_subjects (FK → auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.quiz_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'custom',
  is_custom BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, name)
);

ALTER TABLE public.quiz_subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own quiz_subjects" ON public.quiz_subjects
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 5. Re-create quiz_sessions (FK → auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.quiz_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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
CREATE POLICY "Users can manage own quiz_sessions" ON public.quiz_sessions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 6. Re-create quiz_questions
-- ============================================================
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
CREATE POLICY "Users can manage own quiz_questions" ON public.quiz_questions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.quiz_sessions
      WHERE quiz_sessions.id = quiz_questions.session_id
        AND quiz_sessions.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.quiz_sessions
      WHERE quiz_sessions.id = quiz_questions.session_id
        AND quiz_sessions.user_id = auth.uid()
    )
  );

-- ============================================================
-- 7. Re-create quiz_settings (FK → auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.quiz_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  show_answer_immediately BOOLEAN DEFAULT true,
  auto_submit_on_enter BOOLEAN DEFAULT true,
  default_subject_id UUID,
  selected_subjects UUID[] DEFAULT '{}',
  quiz_version_preference TEXT DEFAULT 'react',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.quiz_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own quiz_settings" ON public.quiz_settings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 8. Indexes for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_user_id ON public.quiz_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_started_at ON public.quiz_sessions(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_session_id ON public.quiz_questions(session_id);
CREATE INDEX IF NOT EXISTS idx_user_settings_user_key ON public.user_settings(user_id, key);
CREATE INDEX IF NOT EXISTS idx_legacy_sync_user_key ON public.legacy_sync_data(user_id, storage_key);

-- ============================================================
-- 9. Function to seed default AI config for new users
-- Note: apiKey is empty by default — users must configure their own or rely on CLOUD_LLM_* env vars (server-side)
-- ============================================================
CREATE OR REPLACE FUNCTION public.seed_default_ai_config()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_settings (user_id, key, value)
  VALUES (
    NEW.id,
    'ai_config',
    '{
      "baseUrl": "",
      "apiKey": "",
      "model": "",
      "provider": "custom"
    }'::jsonb
  )
  ON CONFLICT (user_id, key) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Drop existing trigger if exists, then create new one
DROP TRIGGER IF EXISTS on_auth_user_created_seed_ai ON auth.users;
CREATE TRIGGER on_auth_user_created_seed_ai
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.seed_default_ai_config();

-- ============================================================
-- 10. Update existing users to have default empty AI config (only if they don't have one already)
-- ============================================================
INSERT INTO public.user_settings (user_id, key, value)
SELECT
  id,
  'ai_config',
  '{
    "baseUrl": "",
    "apiKey": "",
    "model": "",
    "provider": "custom"
  }'::jsonb
FROM auth.users
ON CONFLICT (user_id, key) DO NOTHING;
