-- Cloud-synced focus workspace, profile avatars, and durable notification reads.

CREATE TABLE IF NOT EXISTS public.focus_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pomodoro_min integer NOT NULL DEFAULT 25 CHECK (pomodoro_min BETWEEN 10 AND 90),
  short_break_min integer NOT NULL DEFAULT 5 CHECK (short_break_min BETWEEN 3 AND 30),
  long_break_min integer NOT NULL DEFAULT 15 CHECK (long_break_min BETWEEN 10 AND 60),
  long_break_interval integer NOT NULL DEFAULT 4 CHECK (long_break_interval BETWEEN 2 AND 8),
  sound_enabled boolean NOT NULL DEFAULT true,
  notifications_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.focus_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 140),
  estimated_pomodoros integer NOT NULL DEFAULT 1 CHECK (estimated_pomodoros BETWEEN 1 AND 99),
  completed_pomodoros integer NOT NULL DEFAULT 0 CHECK (completed_pomodoros >= 0),
  is_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.focus_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.focus_tasks(id) ON DELETE SET NULL,
  duration_seconds integer NOT NULL CHECK (duration_seconds BETWEEN 60 AND 21600),
  completed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS focus_tasks_user_created_idx ON public.focus_tasks(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS focus_sessions_user_completed_idx ON public.focus_sessions(user_id, completed_at DESC);

ALTER TABLE public.focus_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.focus_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.focus_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their focus settings" ON public.focus_settings
  FOR ALL TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users manage their focus tasks" ON public.focus_tasks
  FOR ALL TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users manage their focus sessions" ON public.focus_sessions
  FOR ALL TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- Public objects allow the selected profile avatar to be displayed without a signed URL.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

CREATE POLICY "Users upload own avatar" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (select auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "Users update own avatar" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (select auth.uid())::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'avatars' AND (select auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "Users delete own avatar" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (select auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "Avatar images are public" ON storage.objects FOR SELECT TO public USING (bucket_id = 'avatars');
