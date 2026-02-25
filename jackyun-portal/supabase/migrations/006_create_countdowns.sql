-- 006_create_countdowns.sql
-- Create countdowns table

CREATE TABLE IF NOT EXISTS public.countdowns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  target_date TIMESTAMPTZ NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#4285F4',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.countdowns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own countdowns"
  ON public.countdowns FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own countdowns"
  ON public.countdowns FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own countdowns"
  ON public.countdowns FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own countdowns"
  ON public.countdowns FOR DELETE
  USING (auth.uid() = user_id);
