-- =========================================================================
-- Engine profiles
-- =========================================================================
CREATE TABLE public.engine_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  runtime text NOT NULL CHECK (runtime IN ('browser','cloud')),
  enabled boolean NOT NULL DEFAULT false,
  is_public boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','canary','published','disabled')),
  stockfish_version text NOT NULL DEFAULT 'unknown',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  draft_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  has_draft boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  reason text,
  updated_by uuid REFERENCES auth.users(id),
  published_at timestamptz NOT NULL DEFAULT now(),
  draft_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.engine_profiles TO service_role;
GRANT SELECT ON public.engine_profiles TO authenticated;
ALTER TABLE public.engine_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read engine profiles" ON public.engine_profiles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

CREATE TABLE public.engine_profile_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.engine_profiles(id) ON DELETE CASCADE,
  slug text NOT NULL,
  version integer NOT NULL,
  status text NOT NULL,
  enabled boolean NOT NULL,
  config jsonb NOT NULL,
  stockfish_version text NOT NULL DEFAULT 'unknown',
  benchmark_id uuid,
  reason text NOT NULL,
  changed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, version)
);

GRANT ALL ON public.engine_profile_versions TO service_role;
GRANT SELECT ON public.engine_profile_versions TO authenticated;
ALTER TABLE public.engine_profile_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read engine profile history" ON public.engine_profile_versions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.engine_benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_slug text NOT NULL,
  profile_version integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('bench','speedtest','epd','positions','selfplay')),
  engine_version text NOT NULL,
  hardware jsonb NOT NULL DEFAULT '{}'::jsonb,
  nodes bigint,
  nps bigint,
  depth integer,
  score numeric,
  passed boolean NOT NULL DEFAULT false,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.engine_benchmarks TO service_role;
GRANT SELECT ON public.engine_benchmarks TO authenticated;
ALTER TABLE public.engine_benchmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read engine benchmarks" ON public.engine_benchmarks
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

CREATE INDEX idx_engine_benchmarks_slug ON public.engine_benchmarks (profile_slug, created_at DESC);

-- =========================================================================
-- Bot sessions (server-authoritative human vs engine games)
-- =========================================================================
CREATE TABLE public.bot_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_slug text NOT NULL,
  level integer NOT NULL,
  player_color text NOT NULL CHECK (player_color IN ('w','b')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','finished','aborted','expired')),
  result text,
  end_reason text,
  initial_fen text NOT NULL,
  current_fen text NOT NULL,
  moves jsonb NOT NULL DEFAULT '[]'::jsonb,
  version integer NOT NULL DEFAULT 0,
  last_idempotency_key text,
  last_snapshot jsonb,
  engine_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

GRANT ALL ON public.bot_sessions TO service_role;
GRANT SELECT ON public.bot_sessions TO authenticated;
ALTER TABLE public.bot_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own bot sessions" ON public.bot_sessions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_bot_sessions_user ON public.bot_sessions (user_id, created_at DESC);
CREATE INDEX idx_bot_sessions_active ON public.bot_sessions (status, last_activity_at);

CREATE TABLE public.engine_move_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.bot_sessions(id) ON DELETE CASCADE,
  ply integer NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed')),
  idempotency_key text NOT NULL,
  request jsonb NOT NULL DEFAULT '{}'::jsonb,
  response jsonb,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  latency_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, ply),
  UNIQUE (idempotency_key)
);

GRANT ALL ON public.engine_move_jobs TO service_role;
ALTER TABLE public.engine_move_jobs ENABLE ROW LEVEL SECURITY;
-- no client policy: trusted server only

-- =========================================================================
-- AI prompts (AI Coach / deep review) with draft + version history
-- =========================================================================
CREATE TABLE public.ai_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  body text NOT NULL DEFAULT '',
  draft_body text NOT NULL DEFAULT '',
  has_draft boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  model text NOT NULL DEFAULT 'google/gemini-2.5-flash',
  reason text,
  updated_by uuid REFERENCES auth.users(id),
  published_at timestamptz NOT NULL DEFAULT now(),
  draft_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.ai_prompts TO service_role;
GRANT SELECT ON public.ai_prompts TO authenticated;
ALTER TABLE public.ai_prompts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read ai prompts" ON public.ai_prompts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.ai_prompt_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id uuid NOT NULL REFERENCES public.ai_prompts(id) ON DELETE CASCADE,
  key text NOT NULL,
  version integer NOT NULL,
  body text NOT NULL,
  model text NOT NULL,
  reason text NOT NULL,
  changed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prompt_id, version)
);

GRANT ALL ON public.ai_prompt_versions TO service_role;
GRANT SELECT ON public.ai_prompt_versions TO authenticated;
ALTER TABLE public.ai_prompt_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read ai prompt history" ON public.ai_prompt_versions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =========================================================================
-- Trusted commit for bot sessions: atomic, replay-safe, version checked
-- =========================================================================
CREATE OR REPLACE FUNCTION public.bot_session_commit(
  _session_id uuid,
  _user_id uuid,
  _expected_version integer,
  _idempotency_key text,
  _current_fen text,
  _moves jsonb,
  _status text,
  _result text,
  _end_reason text,
  _engine_meta jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE s public.bot_sessions%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.bot_sessions WHERE id = _session_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  END IF;
  IF s.user_id <> _user_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;
  -- Replay of the same client request returns the stored snapshot instead of
  -- playing a second engine move.
  IF _idempotency_key IS NOT NULL AND s.last_idempotency_key = _idempotency_key THEN
    RETURN jsonb_build_object('ok', true, 'replayed', true, 'version', s.version,
                              'snapshot', s.last_snapshot);
  END IF;
  IF s.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_CLOSED');
  END IF;
  IF s.version <> _expected_version THEN
    RETURN jsonb_build_object('ok', false, 'code', 'VERSION_CONFLICT', 'version', s.version);
  END IF;

  UPDATE public.bot_sessions
     SET current_fen = _current_fen,
         moves = _moves,
         status = COALESCE(NULLIF(_status, ''), 'active'),
         result = _result,
         end_reason = _end_reason,
         engine_meta = COALESCE(_engine_meta, engine_meta),
         version = s.version + 1,
         last_idempotency_key = _idempotency_key,
         last_snapshot = jsonb_build_object(
           'currentFen', _current_fen, 'moves', _moves,
           'status', COALESCE(NULLIF(_status, ''), 'active'),
           'result', _result, 'endReason', _end_reason,
           'version', s.version + 1),
         updated_at = now(),
         last_activity_at = now(),
         finished_at = CASE WHEN COALESCE(NULLIF(_status,''),'active') <> 'active' THEN now() ELSE finished_at END
   WHERE id = _session_id;

  RETURN jsonb_build_object('ok', true, 'replayed', false, 'version', s.version + 1);
END;
$$;

REVOKE ALL ON FUNCTION public.bot_session_commit(uuid, uuid, integer, text, text, jsonb, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bot_session_commit(uuid, uuid, integer, text, text, jsonb, text, text, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.expire_bot_sessions(_idle_minutes integer DEFAULT 240)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  UPDATE public.bot_sessions
     SET status = 'expired', end_reason = 'session_timeout', finished_at = now(), updated_at = now()
   WHERE status = 'active'
     AND last_activity_at < now() - make_interval(mins => GREATEST(_idle_minutes, 5));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_bot_sessions(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_bot_sessions(integer) TO service_role;

CREATE TRIGGER engine_profiles_updated_at BEFORE UPDATE ON public.engine_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER ai_prompts_updated_at BEFORE UPDATE ON public.ai_prompts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER engine_move_jobs_updated_at BEFORE UPDATE ON public.engine_move_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();