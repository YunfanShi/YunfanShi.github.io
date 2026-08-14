-- Diagnostics are optional, bounded and client-side redacted before insertion.
ALTER TABLE public.bug_reports
  ADD COLUMN IF NOT EXISTS diagnostics jsonb;
