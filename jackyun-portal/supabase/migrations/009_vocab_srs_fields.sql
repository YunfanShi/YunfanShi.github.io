-- 009_vocab_srs_fields.sql
-- Add SRS fields to vocab_words table and create stats/settings tables

ALTER TABLE public.vocab_words
  ADD COLUMN IF NOT EXISTS ex TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS cn TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'learning', 'review', 'mastered')),
  ADD COLUMN IF NOT EXISTS stage INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_review BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS interval_minutes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS learned_date TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT;

-- vocab_stats: per-day stats per user
CREATE TABLE IF NOT EXISTS public.vocab_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  today_time REAL NOT NULL DEFAULT 0,
  today_learned INTEGER NOT NULL DEFAULT 0,
  today_reviewed INTEGER NOT NULL DEFAULT 0,
  date TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, date)
);
ALTER TABLE public.vocab_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own vocab stats"
  ON public.vocab_stats FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- vocab_settings: per-user settings
CREATE TABLE IF NOT EXISTS public.vocab_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  tts BOOLEAN NOT NULL DEFAULT true,
  rate REAL NOT NULL DEFAULT 1.0,
  theme TEXT NOT NULL DEFAULT 'light',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.vocab_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own vocab settings"
  ON public.vocab_settings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
