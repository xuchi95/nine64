-- =====================================================================
-- Nine64 Tournament Engine
-- Server-authoritative tournaments: arena, swiss, round robin, knockout.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  format text NOT NULL CHECK (format IN ('arena','swiss','round_robin','knockout')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','scheduled','registration','running','finished','cancelled')),
  variant text NOT NULL DEFAULT 'standard',
  time_control text NOT NULL DEFAULT '180+2',
  rated boolean NOT NULL DEFAULT true,
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','unlisted')),
  starts_at timestamptz NOT NULL DEFAULT now() + interval '1 hour',
  registration_opens_at timestamptz,
  ends_at timestamptz,
  duration_minutes integer NOT NULL DEFAULT 60 CHECK (duration_minutes BETWEEN 5 AND 1440),
  rounds_total integer NOT NULL DEFAULT 5 CHECK (rounds_total BETWEEN 1 AND 30),
  current_round integer NOT NULL DEFAULT 0,
  min_rating integer,
  max_rating integer,
  max_players integer CHECK (max_players IS NULL OR max_players BETWEEN 2 AND 512),
  late_join boolean NOT NULL DEFAULT true,
  is_daily boolean NOT NULL DEFAULT false,
  daily_recurrence text,
  scoring jsonb NOT NULL DEFAULT '{}'::jsonb,
  tiebreaks text[] NOT NULL DEFAULT ARRAY['buchholz','sonneborn_berger']::text[],
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  paused boolean NOT NULL DEFAULT false,
  scheduler_owner text,
  scheduler_lease_until timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.tournaments TO authenticated;
GRANT ALL ON public.tournaments TO service_role;
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tournaments_read" ON public.tournaments
  FOR SELECT TO authenticated
  USING (status <> 'draft' OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));

CREATE INDEX IF NOT EXISTS tournaments_status_start_idx ON public.tournaments (status, starts_at DESC);

-- players -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tournament_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  seed integer,
  rating_at_join integer NOT NULL DEFAULT 1500,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','withdrawn','removed')),
  score numeric(8,2) NOT NULL DEFAULT 0,
  games_played integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  draws integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  byes integer NOT NULL DEFAULT 0,
  streak integer NOT NULL DEFAULT 0,
  colour_balance integer NOT NULL DEFAULT 0,
  eliminated_round integer,
  tiebreak jsonb NOT NULL DEFAULT '{}'::jsonb,
  rank integer,
  joined_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, user_id)
);

GRANT SELECT ON public.tournament_players TO authenticated;
GRANT ALL ON public.tournament_players TO service_role;
ALTER TABLE public.tournament_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tournament_players_read" ON public.tournament_players
  FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS tournament_players_rank_idx
  ON public.tournament_players (tournament_id, score DESC, rank);

-- rounds ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tournament_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  number integer NOT NULL CHECK (number >= 1),
  status text NOT NULL DEFAULT 'pairing' CHECK (status IN ('pairing','running','finished')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, number)
);

GRANT SELECT ON public.tournament_rounds TO authenticated;
GRANT ALL ON public.tournament_rounds TO service_role;
ALTER TABLE public.tournament_rounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tournament_rounds_read" ON public.tournament_rounds
  FOR SELECT TO authenticated USING (true);

-- pairings -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tournament_pairings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  round_id uuid REFERENCES public.tournament_rounds(id) ON DELETE CASCADE,
  round_number integer NOT NULL DEFAULT 0,
  board integer NOT NULL,
  white_id uuid,
  black_id uuid,
  game_id uuid REFERENCES public.games(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','finished','bye','void')),
  result text CHECK (result IN ('white','black','draw','bye','void')),
  white_points numeric(6,2) NOT NULL DEFAULT 0,
  black_points numeric(6,2) NOT NULL DEFAULT 0,
  scored boolean NOT NULL DEFAULT false,
  bracket_slot integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, round_number, board)
);

GRANT SELECT ON public.tournament_pairings TO authenticated;
GRANT ALL ON public.tournament_pairings TO service_role;
ALTER TABLE public.tournament_pairings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tournament_pairings_read" ON public.tournament_pairings
  FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS tournament_pairings_round_idx
  ON public.tournament_pairings (tournament_id, round_number, board);
CREATE INDEX IF NOT EXISTS tournament_pairings_game_idx
  ON public.tournament_pairings (game_id);

-- score ledger ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tournament_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  pairing_id uuid NOT NULL REFERENCES public.tournament_pairings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  round_number integer NOT NULL DEFAULT 0,
  points numeric(6,2) NOT NULL DEFAULT 0,
  base_points numeric(6,2) NOT NULL DEFAULT 0,
  bonus_points numeric(6,2) NOT NULL DEFAULT 0,
  outcome text NOT NULL CHECK (outcome IN ('win','draw','loss','bye','void')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pairing_id, user_id)
);

GRANT SELECT ON public.tournament_scores TO authenticated;
GRANT ALL ON public.tournament_scores TO service_role;
ALTER TABLE public.tournament_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tournament_scores_read" ON public.tournament_scores
  FOR SELECT TO authenticated USING (true);

-- events ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tournament_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  type text NOT NULL,
  actor_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.tournament_events TO authenticated;
GRANT ALL ON public.tournament_events TO service_role;
ALTER TABLE public.tournament_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tournament_events_admin_read" ON public.tournament_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));

CREATE INDEX IF NOT EXISTS tournament_events_idx
  ON public.tournament_events (tournament_id, created_at DESC);

-- background jobs --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tournament_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('open_registration','start','pair_round','tick','finish')),
  dedupe_key text NOT NULL UNIQUE,
  run_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.tournament_jobs TO authenticated;
GRANT ALL ON public.tournament_jobs TO service_role;
ALTER TABLE public.tournament_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tournament_jobs_admin_read" ON public.tournament_jobs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));

CREATE INDEX IF NOT EXISTS tournament_jobs_due_idx ON public.tournament_jobs (status, run_at);

-- games linkage ----------------------------------------------------------
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS tournament_id uuid REFERENCES public.tournaments(id) ON DELETE SET NULL;
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS tournament_pairing_id uuid;
CREATE INDEX IF NOT EXISTS games_tournament_idx ON public.games (tournament_id);

-- updated_at triggers -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $fn$;

DROP TRIGGER IF EXISTS tournaments_touch ON public.tournaments;
CREATE TRIGGER tournaments_touch BEFORE UPDATE ON public.tournaments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS tournament_players_touch ON public.tournament_players;
CREATE TRIGGER tournament_players_touch BEFORE UPDATE ON public.tournament_players
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS tournament_pairings_touch ON public.tournament_pairings;
CREATE TRIGGER tournament_pairings_touch BEFORE UPDATE ON public.tournament_pairings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS tournament_jobs_touch ON public.tournament_jobs;
CREATE TRIGGER tournament_jobs_touch BEFORE UPDATE ON public.tournament_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =====================================================================
-- Player intents (server validated)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tournament_join(_tournament_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE t public.tournaments%ROWTYPE; uid uuid := auth.uid(); r integer; n integer;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'NO_SESSION'); END IF;
  SELECT * INTO t FROM public.tournaments WHERE id = _tournament_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); END IF;
  IF t.status NOT IN ('registration','running') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CLOSED');
  END IF;
  IF t.status = 'running' AND (NOT t.late_join OR t.format <> 'arena') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'LATE_JOIN_DISABLED');
  END IF;

  SELECT coalesce(rating, 1500) INTO r FROM public.profiles WHERE id = uid;
  IF t.min_rating IS NOT NULL AND r < t.min_rating THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RATING_TOO_LOW');
  END IF;
  IF t.max_rating IS NOT NULL AND r > t.max_rating THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RATING_TOO_HIGH');
  END IF;

  IF t.max_players IS NOT NULL THEN
    SELECT count(*) INTO n FROM public.tournament_players
    WHERE tournament_id = t.id AND status = 'active';
    IF n >= t.max_players THEN RETURN jsonb_build_object('ok', false, 'code', 'FULL'); END IF;
  END IF;

  INSERT INTO public.tournament_players (tournament_id, user_id, rating_at_join)
  VALUES (t.id, uid, coalesce(r, 1500))
  ON CONFLICT (tournament_id, user_id) DO UPDATE
    SET status = 'active', updated_at = now();

  INSERT INTO public.tournament_events (tournament_id, type, actor_id, payload)
  VALUES (t.id, 'player_joined', uid, jsonb_build_object('rating', r));

  RETURN jsonb_build_object('ok', true, 'code', 'JOINED');
END; $fn$;

CREATE OR REPLACE FUNCTION public.tournament_withdraw(_tournament_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE uid uuid := auth.uid(); updated integer;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'NO_SESSION'); END IF;
  UPDATE public.tournament_players SET status = 'withdrawn', updated_at = now()
  WHERE tournament_id = _tournament_id AND user_id = uid AND status = 'active';
  GET DIAGNOSTICS updated = ROW_COUNT;
  IF updated = 0 THEN RETURN jsonb_build_object('ok', false, 'code', 'NOT_PLAYING'); END IF;
  INSERT INTO public.tournament_events (tournament_id, type, actor_id, payload)
  VALUES (_tournament_id, 'player_withdrew', uid, '{}'::jsonb);
  RETURN jsonb_build_object('ok', true, 'code', 'WITHDRAWN');
END; $fn$;

REVOKE ALL ON FUNCTION public.tournament_join(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tournament_withdraw(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tournament_join(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tournament_withdraw(uuid) TO authenticated, service_role;

-- =====================================================================
-- Scheduler primitives: only one worker may drive a tournament
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tournament_acquire_lease(
  _tournament_id uuid, _owner text, _ttl_seconds integer DEFAULT 60)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE changed integer;
BEGIN
  UPDATE public.tournaments
  SET scheduler_owner = _owner,
      scheduler_lease_until = now() + make_interval(secs => greatest(5, _ttl_seconds))
  WHERE id = _tournament_id
    AND (scheduler_lease_until IS NULL OR scheduler_lease_until < now() OR scheduler_owner = _owner);
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END; $fn$;

CREATE OR REPLACE FUNCTION public.tournament_release_lease(_tournament_id uuid, _owner text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $fn$
  UPDATE public.tournaments SET scheduler_owner = NULL, scheduler_lease_until = NULL
  WHERE id = _tournament_id AND scheduler_owner = _owner;
$fn$;

-- Creates a round exactly once, whatever the number of concurrent workers.
CREATE OR REPLACE FUNCTION public.tournament_open_round(_tournament_id uuid, _number integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE rid uuid; created boolean := false;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('nine64_tournament_round')::integer,
                                hashtext(_tournament_id::text || ':' || _number::text)::integer);
  SELECT id INTO rid FROM public.tournament_rounds
  WHERE tournament_id = _tournament_id AND number = _number;
  IF rid IS NULL THEN
    INSERT INTO public.tournament_rounds (tournament_id, number, status)
    VALUES (_tournament_id, _number, 'pairing')
    ON CONFLICT (tournament_id, number) DO NOTHING
    RETURNING id INTO rid;
    created := rid IS NOT NULL;
    IF rid IS NULL THEN
      SELECT id INTO rid FROM public.tournament_rounds
      WHERE tournament_id = _tournament_id AND number = _number;
    END IF;
  END IF;
  UPDATE public.tournaments SET current_round = greatest(current_round, _number)
  WHERE id = _tournament_id;
  RETURN jsonb_build_object('ok', true, 'round_id', rid, 'created', created);
END; $fn$;

-- Applies a pairing set idempotently: re-running never duplicates a board.
CREATE OR REPLACE FUNCTION public.tournament_apply_pairings(
  _tournament_id uuid, _round_number integer, _pairings jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE rid uuid; item jsonb; inserted integer := 0; pid uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('nine64_tournament_round')::integer,
                                hashtext(_tournament_id::text || ':' || _round_number::text)::integer);
  SELECT id INTO rid FROM public.tournament_rounds
  WHERE tournament_id = _tournament_id AND number = _round_number;
  IF rid IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'NO_ROUND'); END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(_pairings) LOOP
    INSERT INTO public.tournament_pairings (
      tournament_id, round_id, round_number, board, white_id, black_id, status, result, bracket_slot)
    VALUES (
      _tournament_id, rid, _round_number, (item->>'board')::integer,
      nullif(item->>'white_id','')::uuid, nullif(item->>'black_id','')::uuid,
      coalesce(item->>'status','pending'), nullif(item->>'result',''),
      nullif(item->>'bracket_slot','')::integer)
    ON CONFLICT (tournament_id, round_number, board) DO NOTHING
    RETURNING id INTO pid;
    IF pid IS NOT NULL THEN inserted := inserted + 1; END IF;
  END LOOP;

  UPDATE public.tournament_rounds SET status = 'running' WHERE id = rid AND status = 'pairing';
  RETURN jsonb_build_object('ok', true, 'round_id', rid, 'inserted', inserted);
END; $fn$;

-- Creates the real game behind a pairing, at most once.
CREATE OR REPLACE FUNCTION public.tournament_start_pairing_game(_pairing_id uuid, _initial_fen text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE p public.tournament_pairings%ROWTYPE; t public.tournaments%ROWTYPE;
        spec jsonb; base_ms integer; gid uuid; wr integer; br integer;
BEGIN
  SELECT * INTO p FROM public.tournament_pairings WHERE id = _pairing_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); END IF;
  IF p.game_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'code', 'ALREADY', 'game_id', p.game_id);
  END IF;
  IF p.white_id IS NULL OR p.black_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BYE');
  END IF;

  SELECT * INTO t FROM public.tournaments WHERE id = p.tournament_id;
  spec := public.tc_spec(t.time_control);
  IF NOT coalesce((spec->>'valid')::boolean, false) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_TIME_CONTROL');
  END IF;
  base_ms := greatest(1000, (spec->>'base_ms')::integer);

  SELECT coalesce(rating, 1500) INTO wr FROM public.profiles WHERE id = p.white_id;
  SELECT coalesce(rating, 1500) INTO br FROM public.profiles WHERE id = p.black_id;

  INSERT INTO public.games (
    white_id, black_id, white_rating, black_rating, variant, time_control,
    status, initial_fen, current_fen, white_time_ms, black_time_ms,
    rated, spectate, tournament_id, tournament_pairing_id)
  VALUES (
    p.white_id, p.black_id, coalesce(wr,1500), coalesce(br,1500), t.variant, t.time_control,
    'active', _initial_fen, _initial_fen, base_ms, base_ms,
    t.rated, 'public', t.id, p.id)
  RETURNING id INTO gid;

  UPDATE public.tournament_pairings
  SET game_id = gid, status = 'active', updated_at = now()
  WHERE id = p.id;

  RETURN jsonb_build_object('ok', true, 'code', 'CREATED', 'game_id', gid);
END; $fn$;

-- Idempotent scoring: the unique (pairing_id, user_id) key absorbs retries.
CREATE OR REPLACE FUNCTION public.tournament_record_pairing_result(
  _pairing_id uuid, _result text, _rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE p public.tournament_pairings%ROWTYPE; row_item jsonb; wp numeric := 0; bp numeric := 0;
BEGIN
  SELECT * INTO p FROM public.tournament_pairings WHERE id = _pairing_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); END IF;
  IF p.scored THEN RETURN jsonb_build_object('ok', true, 'code', 'ALREADY'); END IF;

  FOR row_item IN SELECT * FROM jsonb_array_elements(_rows) LOOP
    INSERT INTO public.tournament_scores (
      tournament_id, pairing_id, user_id, round_number,
      points, base_points, bonus_points, outcome, reason)
    VALUES (
      p.tournament_id, p.id, (row_item->>'user_id')::uuid, p.round_number,
      (row_item->>'points')::numeric, coalesce((row_item->>'base_points')::numeric, 0),
      coalesce((row_item->>'bonus_points')::numeric, 0),
      row_item->>'outcome', row_item->>'reason')
    ON CONFLICT (pairing_id, user_id) DO NOTHING;

    IF (row_item->>'user_id')::uuid = p.white_id THEN wp := (row_item->>'points')::numeric; END IF;
    IF (row_item->>'user_id')::uuid = p.black_id THEN bp := (row_item->>'points')::numeric; END IF;
  END LOOP;

  UPDATE public.tournament_pairings
  SET status = CASE WHEN _result = 'bye' THEN 'bye' ELSE 'finished' END,
      result = _result, white_points = wp, black_points = bp, scored = true, updated_at = now()
  WHERE id = p.id;

  RETURN jsonb_build_object('ok', true, 'code', 'SCORED');
END; $fn$;

-- Fair Play / admin: void a game's tournament contribution and reopen scoring.
CREATE OR REPLACE FUNCTION public.tournament_invalidate_pairing(_pairing_id uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE p public.tournament_pairings%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.tournament_pairings WHERE id = _pairing_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); END IF;
  DELETE FROM public.tournament_scores WHERE pairing_id = p.id;
  UPDATE public.tournament_pairings
  SET status = 'void', result = 'void', white_points = 0, black_points = 0,
      scored = true, updated_at = now()
  WHERE id = p.id;
  INSERT INTO public.tournament_events (tournament_id, type, payload)
  VALUES (p.tournament_id, 'pairing_invalidated',
          jsonb_build_object('pairing_id', p.id, 'reason', _reason));
  RETURN jsonb_build_object('ok', true, 'code', 'VOIDED', 'tournament_id', p.tournament_id);
END; $fn$;

-- Standings write-back computed by the engine (score + tiebreaks + rank).
CREATE OR REPLACE FUNCTION public.tournament_set_standings(_tournament_id uuid, _rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE row_item jsonb;
BEGIN
  FOR row_item IN SELECT * FROM jsonb_array_elements(_rows) LOOP
    UPDATE public.tournament_players SET
      score = (row_item->>'score')::numeric,
      games_played = coalesce((row_item->>'games_played')::integer, games_played),
      wins = coalesce((row_item->>'wins')::integer, wins),
      draws = coalesce((row_item->>'draws')::integer, draws),
      losses = coalesce((row_item->>'losses')::integer, losses),
      byes = coalesce((row_item->>'byes')::integer, byes),
      streak = coalesce((row_item->>'streak')::integer, streak),
      colour_balance = coalesce((row_item->>'colour_balance')::integer, colour_balance),
      eliminated_round = nullif(row_item->>'eliminated_round','')::integer,
      tiebreak = coalesce(row_item->'tiebreak', '{}'::jsonb),
      rank = (row_item->>'rank')::integer,
      updated_at = now()
    WHERE tournament_id = _tournament_id AND user_id = (row_item->>'user_id')::uuid;
  END LOOP;
  RETURN jsonb_build_object('ok', true);
END; $fn$;

-- job queue -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tournament_enqueue_job(
  _tournament_id uuid, _kind text, _dedupe_key text, _run_at timestamptz DEFAULT now())
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE jid uuid;
BEGIN
  INSERT INTO public.tournament_jobs (tournament_id, kind, dedupe_key, run_at)
  VALUES (_tournament_id, _kind, _dedupe_key, _run_at)
  ON CONFLICT (dedupe_key) DO NOTHING
  RETURNING id INTO jid;
  RETURN jid;
END; $fn$;

CREATE OR REPLACE FUNCTION public.tournament_claim_jobs(_limit integer DEFAULT 10)
RETURNS SETOF public.tournament_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT id FROM public.tournament_jobs
    WHERE status = 'pending' AND run_at <= now()
    ORDER BY run_at ASC
    LIMIT greatest(1, least(50, _limit))
    FOR UPDATE SKIP LOCKED)
  UPDATE public.tournament_jobs j
  SET status = 'running', attempts = j.attempts + 1, locked_at = now(), updated_at = now()
  FROM due WHERE j.id = due.id
  RETURNING j.*;
END; $fn$;

CREATE OR REPLACE FUNCTION public.tournament_complete_job(
  _job_id uuid, _ok boolean, _error text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF _ok THEN
    UPDATE public.tournament_jobs SET status = 'done', last_error = NULL, updated_at = now()
    WHERE id = _job_id;
  ELSE
    UPDATE public.tournament_jobs
    SET status = CASE WHEN attempts >= 5 THEN 'failed' ELSE 'pending' END,
        run_at = now() + make_interval(secs => least(300, 15 * attempts)),
        last_error = left(coalesce(_error,'error'), 500), updated_at = now()
    WHERE id = _job_id;
  END IF;
END; $fn$;

REVOKE ALL ON FUNCTION public.tournament_acquire_lease(uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tournament_release_lease(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tournament_open_round(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tournament_apply_pairings(uuid, integer, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tournament_start_pairing_game(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tournament_record_pairing_result(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tournament_invalidate_pairing(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tournament_set_standings(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tournament_enqueue_job(uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tournament_claim_jobs(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tournament_complete_job(uuid, boolean, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.tournament_acquire_lease(uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.tournament_release_lease(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.tournament_open_round(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.tournament_apply_pairings(uuid, integer, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.tournament_start_pairing_game(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.tournament_record_pairing_result(uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.tournament_invalidate_pairing(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.tournament_set_standings(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.tournament_enqueue_job(uuid, text, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.tournament_claim_jobs(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.tournament_complete_job(uuid, boolean, text) TO service_role;