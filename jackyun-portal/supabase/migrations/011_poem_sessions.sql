-- 011_poem_sessions.sql
-- Add session tracking for poem recitation

CREATE TABLE IF NOT EXISTS public.poem_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  poem_id UUID NOT NULL REFERENCES public.poems(id) ON DELETE CASCADE,
  time_seconds INTEGER NOT NULL DEFAULT 0,
  retreats INTEGER NOT NULL DEFAULT 0,
  study_mode_used BOOLEAN NOT NULL DEFAULT false,
  completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.poem_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own poem_sessions"
  ON public.poem_sessions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Add progress/stats columns to poems
ALTER TABLE public.poems ADD COLUMN IF NOT EXISTS best_time INTEGER;
ALTER TABLE public.poems ADD COLUMN IF NOT EXISTS completion_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.poems ADD COLUMN IF NOT EXISTS last_progress INTEGER NOT NULL DEFAULT 0;
