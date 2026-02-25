-- 002_create_vocab.sql
-- Create vocab_words table

CREATE TABLE IF NOT EXISTS public.vocab_words (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  meaning TEXT NOT NULL,
  category TEXT,
  mastered BOOLEAN NOT NULL DEFAULT FALSE,
  review_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.vocab_words ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own vocab words"
  ON public.vocab_words FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own vocab words"
  ON public.vocab_words FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own vocab words"
  ON public.vocab_words FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own vocab words"
  ON public.vocab_words FOR DELETE
  USING (auth.uid() = user_id);
