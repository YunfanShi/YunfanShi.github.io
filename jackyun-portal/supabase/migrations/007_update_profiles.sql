-- 007_update_profiles.sql
-- Add username, email, and linked_providers columns to profiles

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS linked_providers TEXT[] NOT NULL DEFAULT '{}';

-- Allow service role to insert/update profiles (for syncProfile action)
CREATE POLICY "Service role can manage profiles"
  ON public.profiles FOR ALL
  USING (auth.role() = 'service_role');
