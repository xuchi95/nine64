ALTER TABLE public.engine_benchmarks ADD COLUMN IF NOT EXISTS config_signature text;

CREATE INDEX IF NOT EXISTS engine_benchmarks_readiness_idx
  ON public.engine_benchmarks (profile_slug, kind, created_at DESC);

CREATE INDEX IF NOT EXISTS engine_benchmarks_config_signature_idx
  ON public.engine_benchmarks (profile_slug, config_signature, kind, created_at DESC);