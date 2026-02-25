-- 004_create_poems.sql
-- Create poems table

CREATE TABLE IF NOT EXISTS public.poems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  author TEXT,
  content TEXT NOT NULL,
  mastery_level INTEGER NOT NULL DEFAULT 0 CHECK (mastery_level BETWEEN 0 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.poems ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own poems"
  ON public.poems FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own poems"
  ON public.poems FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own poems"
  ON public.poems FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own poems"
  ON public.poems FOR DELETE
  USING (auth.uid() = user_id);
