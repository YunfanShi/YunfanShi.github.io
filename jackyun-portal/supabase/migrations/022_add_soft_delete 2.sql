-- 022_add_soft_delete.sql
-- Add soft delete capability to profiles table
-- Soft delete: set deleted_at timestamp instead of deleting data immediately

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Allow updating deleted_at (for the account deletion flow)
CREATE POLICY "Users can soft delete own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Add index for faster cleanup queries
CREATE INDEX IF NOT EXISTS idx_profiles_deleted_at ON public.profiles(deleted_at)
  WHERE deleted_at IS NOT NULL;