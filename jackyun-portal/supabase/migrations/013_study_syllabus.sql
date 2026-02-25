-- CAIE Syllabus storage
CREATE TABLE IF NOT EXISTS public.study_syllabus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject_name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#4285f4',
  units JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, subject_name)
);
ALTER TABLE public.study_syllabus ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own study_syllabus" ON public.study_syllabus FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.study_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  school_date TEXT,
  exam_date TEXT,
  emergency_subjects TEXT[] NOT NULL DEFAULT '{}',
  emergency_deadline TEXT,
  emergency_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.study_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own study_config" ON public.study_config FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.study_mock_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  paper TEXT,
  score INTEGER,
  max_score INTEGER,
  duration_minutes INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.study_mock_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own study_mock_records" ON public.study_mock_records FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
