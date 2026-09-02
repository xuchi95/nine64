ALTER TABLE public.engine_benchmarks ADD COLUMN IF NOT EXISTS suite_version text;
CREATE INDEX IF NOT EXISTS engine_benchmarks_suite_idx
  ON public.engine_benchmarks (profile_slug, config_signature, suite_version, kind, created_at DESC);