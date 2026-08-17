-- Companion sync, cloud navigation preferences, and encrypted per-user secrets.

CREATE TABLE public.companion_devices (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 80),
  platform text NOT NULL DEFAULT 'chromium' CHECK (platform IN ('chrome', 'edge', 'chromium', 'other')),
  browser_version text,
  extension_version text NOT NULL CHECK (char_length(extension_version) <= 32),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id)
);

CREATE TABLE public.companion_activity_daily (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES public.companion_devices(id) ON DELETE CASCADE,
  activity_date date NOT NULL,
  resource_key text NOT NULL CHECK (resource_key ~ '^[a-z0-9][a-z0-9._-]{0,159}$'),
  hostname text NOT NULL CHECK (hostname ~ '^[a-z0-9][a-z0-9.-]{0,252}$'),
  category text NOT NULL CHECK (char_length(category) BETWEEN 1 AND 40),
  active_seconds integer NOT NULL DEFAULT 0 CHECK (active_seconds BETWEEN 0 AND 86400),
  visits integer NOT NULL DEFAULT 0 CHECK (visits BETWEEN 0 AND 10000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, device_id, activity_date, resource_key)
);

CREATE TABLE public.companion_learning_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url text NOT NULL CHECK (char_length(url) BETWEEN 8 AND 2048),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 300),
  hostname text NOT NULL CHECK (hostname ~ '^[a-z0-9][a-z0-9.-]{0,252}$'),
  category text NOT NULL DEFAULT '其他' CHECK (char_length(category) BETWEEN 1 AND 40),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 2000),
  status text NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'in_progress', 'done', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.navigation_usage_daily (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_date date NOT NULL,
  nav_item_id text NOT NULL CHECK (nav_item_id ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  opens integer NOT NULL DEFAULT 0 CHECK (opens BETWEEN 0 AND 10000),
  last_opened_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, activity_date, nav_item_id)
);

-- Ciphertext only. Encryption and decryption happen in authenticated server actions.
CREATE TABLE public.user_secrets (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key text NOT NULL CHECK (key IN ('ai_api_key')),
  encrypted_value text NOT NULL,
  key_version smallint NOT NULL DEFAULT 1 CHECK (key_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

ALTER TABLE public.focus_sessions
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'portal' CHECK (source IN ('portal', 'companion')),
  ADD COLUMN IF NOT EXISTS device_id uuid REFERENCES public.companion_devices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS resource_key text;

CREATE INDEX companion_devices_user_seen_idx ON public.companion_devices(user_id, last_seen_at DESC);
CREATE INDEX companion_activity_user_date_idx ON public.companion_activity_daily(user_id, activity_date DESC);
CREATE INDEX companion_queue_user_status_idx ON public.companion_learning_queue(user_id, status, created_at DESC);
CREATE INDEX navigation_usage_user_date_idx ON public.navigation_usage_daily(user_id, activity_date DESC);

ALTER TABLE public.companion_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companion_activity_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companion_learning_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.navigation_usage_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own companion devices" ON public.companion_devices
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users manage own companion activity" ON public.companion_activity_daily
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users manage own learning queue" ON public.companion_learning_queue
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users manage own navigation usage" ON public.navigation_usage_daily
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users manage own encrypted secrets" ON public.user_secrets
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- Replace the original broad policy with the current explicit authenticated policy.
DROP POLICY IF EXISTS "Users can manage own settings" ON public.user_settings;
CREATE POLICY "Users manage own settings" ON public.user_settings
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.companion_devices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companion_activity_daily TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companion_learning_queue TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.navigation_usage_daily TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_secrets TO authenticated;

CREATE OR REPLACE FUNCTION public.increment_navigation_usage(p_nav_item_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE current_user_id uuid := (select auth.uid());
BEGIN
  IF current_user_id IS NULL OR p_nav_item_id !~ '^[a-z0-9][a-z0-9-]{0,79}$' THEN
    RAISE EXCEPTION 'Invalid navigation event';
  END IF;
  INSERT INTO public.navigation_usage_daily (user_id, activity_date, nav_item_id, opens, last_opened_at, updated_at)
  VALUES (current_user_id, current_date, p_nav_item_id, 1, now(), now())
  ON CONFLICT (user_id, activity_date, nav_item_id)
  DO UPDATE SET opens = LEAST(10000, public.navigation_usage_daily.opens + 1), last_opened_at = now(), updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.increment_navigation_usage(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_navigation_usage(text) TO authenticated;
