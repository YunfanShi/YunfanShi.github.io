CREATE TABLE IF NOT EXISTS public.relax_chat (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.relax_chat ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own relax_chat" ON public.relax_chat FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.relax_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  water_count INTEGER NOT NULL DEFAULT 0,
  water_date TEXT,
  theme TEXT NOT NULL DEFAULT 'default',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.relax_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own relax_state" ON public.relax_state FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
