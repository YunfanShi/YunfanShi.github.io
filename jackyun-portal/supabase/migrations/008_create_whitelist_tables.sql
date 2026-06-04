-- 008_create_whitelist_tables.sql
-- Create database-driven whitelist tables

CREATE TABLE IF NOT EXISTS public.whitelist_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  note TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.whitelist_usernames (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL DEFAULT 'github',
  note TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.whitelist_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whitelist_usernames ENABLE ROW LEVEL SECURITY;

-- Only admins can manage whitelist (checked via profiles.role)
CREATE POLICY "Admins can manage whitelist_emails"
  ON public.whitelist_emails FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can manage whitelist_usernames"
  ON public.whitelist_usernames FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Service role bypass for middleware queries
CREATE POLICY "Service role can read whitelist_emails"
  ON public.whitelist_emails FOR SELECT
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role can read whitelist_usernames"
  ON public.whitelist_usernames FOR SELECT
  USING (auth.role() = 'service_role');
