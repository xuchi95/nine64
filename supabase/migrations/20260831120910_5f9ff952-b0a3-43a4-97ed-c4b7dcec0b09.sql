-- ============ Repertoires ============
CREATE TABLE public.repertoires (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  color text NOT NULL CHECK (color IN ('white','black')),
  name text NOT NULL DEFAULT 'My repertoire',
  description text NOT NULL DEFAULT '',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX repertoires_user_idx ON public.repertoires(user_id, color);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.repertoires TO authenticated;
GRANT ALL ON public.repertoires TO service_role;
ALTER TABLE public.repertoires ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own repertoires" ON public.repertoires FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.repertoire_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repertoire_id uuid NOT NULL REFERENCES public.repertoires(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  eco text,
  opening_name text,
  root_path text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX repertoire_lines_rep_idx ON public.repertoire_lines(repertoire_id);
CREATE UNIQUE INDEX repertoire_lines_root_idx ON public.repertoire_lines(repertoire_id, root_path);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.repertoire_lines TO authenticated;
GRANT ALL ON public.repertoire_lines TO service_role;
ALTER TABLE public.repertoire_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own repertoire lines" ON public.repertoire_lines FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.repertoire_moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id uuid NOT NULL REFERENCES public.repertoire_lines(id) ON DELETE CASCADE,
  repertoire_id uuid NOT NULL REFERENCES public.repertoires(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  path text NOT NULL,
  parent_path text NOT NULL DEFAULT '',
  ply integer NOT NULL,
  san text NOT NULL,
  uci text NOT NULL DEFAULT '',
  fen text NOT NULL,
  parent_fen text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT 'main' CHECK (kind IN ('main','alternative','avoid')),
  is_own_move boolean NOT NULL DEFAULT true,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX repertoire_moves_path_idx ON public.repertoire_moves(repertoire_id, path);
CREATE INDEX repertoire_moves_line_idx ON public.repertoire_moves(line_id);
CREATE INDEX repertoire_moves_user_idx ON public.repertoire_moves(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.repertoire_moves TO authenticated;
GRANT ALL ON public.repertoire_moves TO service_role;
ALTER TABLE public.repertoire_moves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own repertoire moves" ON public.repertoire_moves FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.repertoire_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  repertoire_id uuid NOT NULL REFERENCES public.repertoires(id) ON DELETE CASCADE,
  move_id uuid NOT NULL REFERENCES public.repertoire_moves(id) ON DELETE CASCADE,
  path text NOT NULL,
  fen text NOT NULL,
  expected_san text NOT NULL,
  color text NOT NULL CHECK (color IN ('white','black')),
  difficulty numeric NOT NULL DEFAULT 5.6,
  stability numeric NOT NULL DEFAULT 0,
  reps integer NOT NULL DEFAULT 0,
  lapses integer NOT NULL DEFAULT 0,
  due timestamptz NOT NULL DEFAULT now(),
  last_review timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX repertoire_cards_move_idx ON public.repertoire_cards(move_id);
CREATE INDEX repertoire_cards_due_idx ON public.repertoire_cards(user_id, due);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.repertoire_cards TO authenticated;
GRANT ALL ON public.repertoire_cards TO service_role;
ALTER TABLE public.repertoire_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own repertoire cards" ON public.repertoire_cards FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER repertoires_updated_at BEFORE UPDATE ON public.repertoires
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER repertoire_lines_updated_at BEFORE UPDATE ON public.repertoire_lines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER repertoire_moves_updated_at BEFORE UPDATE ON public.repertoire_moves
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER repertoire_cards_updated_at BEFORE UPDATE ON public.repertoire_cards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ Explorer cache + health ============
CREATE TABLE public.opening_explorer_cache (
  cache_key text PRIMARY KEY,
  source text NOT NULL,
  fen text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload jsonb NOT NULL,
  hits integer NOT NULL DEFAULT 0,
  latency_ms integer NOT NULL DEFAULT 0,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX opening_explorer_cache_expiry_idx ON public.opening_explorer_cache(expires_at);
GRANT ALL ON public.opening_explorer_cache TO service_role;
ALTER TABLE public.opening_explorer_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read explorer cache" ON public.opening_explorer_cache FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.opening_explorer_health (
  source text PRIMARY KEY,
  requests bigint NOT NULL DEFAULT 0,
  hits bigint NOT NULL DEFAULT 0,
  misses bigint NOT NULL DEFAULT 0,
  errors bigint NOT NULL DEFAULT 0,
  timeouts bigint NOT NULL DEFAULT 0,
  rate_limited bigint NOT NULL DEFAULT 0,
  breaker_trips bigint NOT NULL DEFAULT 0,
  consecutive_failures integer NOT NULL DEFAULT 0,
  open_until timestamptz,
  total_latency_ms bigint NOT NULL DEFAULT 0,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.opening_explorer_health TO service_role;
ALTER TABLE public.opening_explorer_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read explorer health" ON public.opening_explorer_health FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.opening_explorer_record(
  _source text,
  _outcome text,
  _latency_ms integer DEFAULT 0,
  _error text DEFAULT NULL,
  _failure_threshold integer DEFAULT 5,
  _open_seconds integer DEFAULT 60
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row public.opening_explorer_health;
  is_failure boolean := _outcome IN ('error','timeout');
BEGIN
  INSERT INTO public.opening_explorer_health(source) VALUES (_source)
  ON CONFLICT (source) DO NOTHING;

  UPDATE public.opening_explorer_health SET
    requests = requests + 1,
    hits = hits + (CASE WHEN _outcome = 'hit' THEN 1 ELSE 0 END),
    misses = misses + (CASE WHEN _outcome = 'miss' THEN 1 ELSE 0 END),
    errors = errors + (CASE WHEN _outcome = 'error' THEN 1 ELSE 0 END),
    timeouts = timeouts + (CASE WHEN _outcome = 'timeout' THEN 1 ELSE 0 END),
    rate_limited = rate_limited + (CASE WHEN _outcome = 'rate_limited' THEN 1 ELSE 0 END),
    total_latency_ms = total_latency_ms + GREATEST(COALESCE(_latency_ms, 0), 0),
    consecutive_failures = CASE WHEN is_failure THEN consecutive_failures + 1 ELSE 0 END,
    breaker_trips = breaker_trips + (
      CASE WHEN is_failure AND consecutive_failures + 1 >= _failure_threshold THEN 1 ELSE 0 END
    ),
    open_until = CASE
      WHEN is_failure AND consecutive_failures + 1 >= _failure_threshold
        THEN now() + make_interval(secs => GREATEST(_open_seconds, 1))
      WHEN is_failure THEN open_until
      ELSE NULL END,
    last_error = COALESCE(_error, CASE WHEN is_failure THEN last_error ELSE NULL END),
    updated_at = now()
  WHERE source = _source
  RETURNING * INTO row;

  RETURN to_jsonb(row);
END;
$$;

-- ============ Admin dataset management ============
CREATE TABLE public.opening_datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  source_url text NOT NULL DEFAULT '',
  license text NOT NULL DEFAULT '',
  attribution text NOT NULL DEFAULT '',
  version text NOT NULL DEFAULT '',
  eco_count integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  notes text NOT NULL DEFAULT '',
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.opening_datasets TO service_role;
GRANT SELECT ON public.opening_datasets TO authenticated;
ALTER TABLE public.opening_datasets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read opening datasets" ON public.opening_datasets FOR SELECT TO authenticated USING (true);

CREATE TABLE public.opening_import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid REFERENCES public.opening_datasets(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'eco_refresh',
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed')),
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  last_error text,
  requested_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX opening_import_jobs_created_idx ON public.opening_import_jobs(created_at DESC);
GRANT ALL ON public.opening_import_jobs TO service_role;
ALTER TABLE public.opening_import_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read import jobs" ON public.opening_import_jobs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER opening_datasets_updated_at BEFORE UPDATE ON public.opening_datasets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER opening_import_jobs_updated_at BEFORE UPDATE ON public.opening_import_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.opening_datasets (slug, name, source_url, license, attribution, version, eco_count, notes)
VALUES (
  'lichess-chess-openings',
  'Lichess chess-openings (ECO)',
  'https://github.com/lichess-org/chess-openings',
  'CC0-1.0',
  'lichess-org/chess-openings contributors',
  '2026.08',
  3810,
  'Bộ định danh ECO nguồn mở, nhúng sẵn trong ứng dụng. Không sử dụng dữ liệu độc quyền của bên thứ ba.'
), (
  'lichess-opening-explorer',
  'Lichess Opening Explorer API',
  'https://explorer.lichess.ovh',
  'ODbL-1.0',
  'Lichess.org open database',
  'live',
  0,
  'Nguồn thống kê ván đấu Masters/All players, truy cập qua proxy máy chủ có cache, timeout, circuit breaker và rate limit.'
);