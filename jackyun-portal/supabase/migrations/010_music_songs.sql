CREATE TABLE IF NOT EXISTS public.music_songs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  netease_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.music_songs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own music_songs" ON public.music_songs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.music_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  manual_offset INTEGER NOT NULL DEFAULT 0,
  interval_ms INTEGER NOT NULL DEFAULT 10000,
  play_mode TEXT NOT NULL DEFAULT 'sequence',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.music_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own music_settings" ON public.music_settings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
