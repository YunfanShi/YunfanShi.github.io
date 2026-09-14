-- Global AI routing settings. This table is intentionally server-only because
-- the configured router is an implementation detail of managed AI requests.
CREATE TABLE public.ai_platform_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  smart_router_model_id bigint REFERENCES public.ai_model_catalog(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.ai_platform_settings(singleton) VALUES (true);

ALTER TABLE public.ai_platform_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_platform_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.ai_platform_settings TO service_role;
