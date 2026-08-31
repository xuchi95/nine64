-- ============================================================
-- Nine64 — Complete Online Chess foundation
-- ============================================================

-- 1) Canonical time-control spec ------------------------------
CREATE OR REPLACE FUNCTION public.tc_spec(_tc text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $fn$
DECLARE base_s integer; inc_s integer; days integer; est numeric; pool_name text;
BEGIN
  IF _tc IS NULL THEN RETURN jsonb_build_object('valid', false); END IF;

  IF _tc ~ '^daily[0-9]{1,2}$' THEN
    days := substring(_tc from 6)::integer;
    IF days NOT IN (1,2,3,7) THEN RETURN jsonb_build_object('valid', false); END IF;
    RETURN jsonb_build_object('valid', true, 'pace', 'daily', 'base_ms', 0, 'inc_ms', 0,
      'daily_move_ms', days * 86400000, 'pool', 'daily', 'label', days || 'd');
  END IF;

  base_s := CASE _tc
    WHEN 'blitz1m' THEN 60 WHEN 'blitz3m' THEN 180 WHEN 'blitz5m' THEN 300
    WHEN 'rapid10m' THEN 600 WHEN 'rapid15m' THEN 900 WHEN 'rapid30m' THEN 1800
    ELSE NULL END;

  IF base_s IS NOT NULL THEN
    inc_s := CASE _tc WHEN 'blitz3m' THEN 2 WHEN 'rapid15m' THEN 10 ELSE 0 END;
  ELSIF _tc ~ '^[0-9]{1,5}\+[0-9]{1,3}$' THEN
    base_s := split_part(_tc, '+', 1)::integer;
    inc_s := split_part(_tc, '+', 2)::integer;
  ELSE
    RETURN jsonb_build_object('valid', false);
  END IF;

  IF base_s < 15 OR base_s > 10800 OR inc_s < 0 OR inc_s > 180 THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  est := base_s + 40 * inc_s;
  pool_name := CASE WHEN est < 180 THEN 'bullet' WHEN est < 480 THEN 'blitz'
                    WHEN est < 1500 THEN 'rapid' ELSE 'classical' END;

  RETURN jsonb_build_object('valid', true, 'pace', 'realtime', 'base_ms', base_s * 1000,
    'inc_ms', inc_s * 1000, 'daily_move_ms', 0, 'pool', pool_name,
    'label', (base_s / 60) || '+' || inc_s);
END; $fn$;

CREATE OR REPLACE FUNCTION public.rating_pool(_variant text, _tc text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $fn$
DECLARE spec jsonb;
BEGIN
  IF _variant = 'chess960' THEN RETURN 'chess960'; END IF;
  spec := public.tc_spec(_tc);
  IF NOT COALESCE((spec->>'valid')::boolean, false) THEN RETURN 'blitz'; END IF;
  RETURN spec->>'pool';
END; $fn$;

CREATE OR REPLACE FUNCTION public.tc_increment_ms(_time_control text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $fn$
  SELECT COALESCE((public.tc_spec(_time_control)->>'inc_ms')::integer, 0);
$fn$;

-- 2) games: online feature columns ----------------------------
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS pace text NOT NULL DEFAULT 'realtime',
  ADD COLUMN IF NOT EXISTS pool text NOT NULL DEFAULT 'blitz',
  ADD COLUMN IF NOT EXISTS daily_move_ms bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deadline_at timestamptz,
  ADD COLUMN IF NOT EXISTS allow_takeback boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS spectate text NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS spectator_delay_seconds integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rematch_of uuid REFERENCES public.games(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS challenge_id uuid,
  ADD COLUMN IF NOT EXISTS white_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS black_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS takeback_count integer NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE public.games ADD CONSTRAINT games_pace_check CHECK (pace IN ('realtime','daily'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.games ADD CONSTRAINT games_spectate_check CHECK (spectate IN ('public','private'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.games ADD CONSTRAINT games_delay_check CHECK (spectator_delay_seconds IN (0,15,30,60));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

UPDATE public.games SET pool = public.rating_pool(variant, time_control)
WHERE pool = 'blitz' AND public.rating_pool(variant, time_control) <> 'blitz';

CREATE INDEX IF NOT EXISTS games_daily_deadline_idx
  ON public.games (deadline_at) WHERE status = 'active' AND pace = 'daily';
CREATE INDEX IF NOT EXISTS games_public_active_idx
  ON public.games (updated_at DESC) WHERE status = 'active' AND spectate = 'public';

-- 3) clock/pace defaults on insert ----------------------------
CREATE OR REPLACE FUNCTION public.games_set_clock_defaults()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE spec jsonb;
BEGIN
  spec := public.tc_spec(NEW.time_control);
  IF COALESCE((spec->>'valid')::boolean, false) THEN
    NEW.pace := spec->>'pace';
    IF NEW.increment_ms = 0 THEN NEW.increment_ms := (spec->>'inc_ms')::integer; END IF;
    IF NEW.pace = 'daily' THEN
      NEW.daily_move_ms := (spec->>'daily_move_ms')::bigint;
    END IF;
  END IF;
  NEW.pool := public.rating_pool(NEW.variant, NEW.time_control);
  NEW.turn_started_at := COALESCE(NEW.turn_started_at, now());
  NEW.clock_state := CASE WHEN NEW.status = 'active' THEN 'running' ELSE 'not_started' END;
  IF NEW.pace = 'daily' AND NEW.status = 'active' THEN
    NEW.deadline_at := COALESCE(NEW.deadline_at, now() + make_interval(secs => NEW.daily_move_ms / 1000.0));
  END IF;
  RETURN NEW;
END; $fn$;

-- 4) rating pools ---------------------------------------------
ALTER TABLE public.user_variant_ratings DROP CONSTRAINT IF EXISTS user_variant_ratings_pool_check;
ALTER TABLE public.user_variant_ratings ADD CONSTRAINT user_variant_ratings_pool_check
  CHECK (pool IN ('bullet','blitz','rapid','classical','daily','chess960'));

CREATE OR REPLACE FUNCTION public.ensure_pool_rating(_user_id uuid, _pool text)
RETURNS public.user_variant_ratings LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE r public.user_variant_ratings%ROWTYPE; p public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.user_variant_ratings
  WHERE user_id = _user_id AND pool = _pool FOR UPDATE;
  IF FOUND THEN RETURN r; END IF;

  SELECT * INTO p FROM public.profiles WHERE id = _user_id;
  INSERT INTO public.user_variant_ratings (user_id, pool, rating, rating_deviation, volatility, peak_rating)
  VALUES (
    _user_id, _pool,
    CASE WHEN _pool = 'chess960' THEN 1200 ELSE COALESCE(p.rating, 1200) END,
    CASE WHEN _pool = 'chess960' THEN 350 ELSE COALESCE(p.rating_deviation, 350) END,
    CASE WHEN _pool = 'chess960' THEN 0.06 ELSE COALESCE(p.volatility, 0.06) END,
    CASE WHEN _pool = 'chess960' THEN 1200 ELSE COALESCE(p.rating, 1200) END
  )
  ON CONFLICT (user_id, pool) DO NOTHING;

  SELECT * INTO r FROM public.user_variant_ratings
  WHERE user_id = _user_id AND pool = _pool FOR UPDATE;
  RETURN r;
END; $fn$;

CREATE OR REPLACE FUNCTION public.apply_rating_once(_game_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  g public.games%ROWTYPE; existing public.rating_events%ROWTYPE;
  first_id uuid; second_id uuid;
  wv public.user_variant_ratings%ROWTYPE; bv public.user_variant_ratings%ROWTYPE;
  pool_name text;
  w_rating integer; w_rd numeric; w_vol numeric;
  b_rating integer; b_rd numeric; b_vol numeric;
  w_new jsonb; b_new jsonb; w_score numeric; b_score numeric;
  w_after integer; b_after integer; locked boolean; ev public.rating_events%ROWTYPE;
BEGIN
  IF _game_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT'); END IF;

  SELECT * INTO existing FROM public.rating_events WHERE game_id = _game_id;
  IF FOUND THEN RETURN jsonb_build_object('ok', true, 'code', 'ALREADY_APPLIED', 'event', to_jsonb(existing)); END IF;

  SELECT * INTO g FROM public.games WHERE id = _game_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND'); END IF;

  SELECT * INTO existing FROM public.rating_events WHERE game_id = _game_id;
  IF FOUND THEN RETURN jsonb_build_object('ok', true, 'code', 'ALREADY_APPLIED', 'event', to_jsonb(existing)); END IF;

  IF g.status <> 'completed' THEN RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_COMPLETED'); END IF;
  IF COALESCE(g.rated, true) = false THEN RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_RATED'); END IF;
  IF g.result NOT IN ('1-0','0-1','1/2-1/2') THEN RETURN jsonb_build_object('ok', false, 'code', 'NO_DECISIVE_RESULT'); END IF;
  IF g.white_id IS NULL OR g.black_id IS NULL OR g.white_id = g.black_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_PLAYERS');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.fairplay_status s
    WHERE s.user_id IN (g.white_id, g.black_id) AND s.rating_locked
      AND (s.lock_expires_at IS NULL OR s.lock_expires_at > now())
  ) INTO locked;
  IF locked THEN
    UPDATE public.games SET rated = false WHERE id = _game_id;
    RETURN jsonb_build_object('ok', false, 'code', 'RATING_LOCKED');
  END IF;

  first_id := LEAST(g.white_id, g.black_id);
  second_id := GREATEST(g.white_id, g.black_id);
  PERFORM 1 FROM public.profiles WHERE id = first_id FOR UPDATE;
  PERFORM 1 FROM public.profiles WHERE id = second_id FOR UPDATE;

  pool_name := COALESCE(NULLIF(g.pool, ''), public.rating_pool(g.variant, g.time_control));

  wv := public.ensure_pool_rating(g.white_id, pool_name);
  bv := public.ensure_pool_rating(g.black_id, pool_name);
  w_rating := wv.rating; w_rd := wv.rating_deviation; w_vol := wv.volatility;
  b_rating := bv.rating; b_rd := bv.rating_deviation; b_vol := bv.volatility;

  w_score := CASE g.result WHEN '1-0' THEN 1 WHEN '0-1' THEN 0 ELSE 0.5 END;
  b_score := 1 - w_score;

  w_new := public.glicko2_update(w_rating, w_rd, w_vol, b_rating, b_rd, w_score);
  b_new := public.glicko2_update(b_rating, b_rd, b_vol, w_rating, w_rd, b_score);

  w_after := ROUND((w_new->>'rating')::numeric);
  b_after := ROUND((b_new->>'rating')::numeric);

  UPDATE public.user_variant_ratings SET
    rating = w_after,
    rating_deviation = (w_new->>'rd')::numeric,
    volatility = (w_new->>'volatility')::numeric,
    peak_rating = GREATEST(peak_rating, w_after),
    games_played = games_played + 1,
    wins = wins + CASE WHEN g.result = '1-0' THEN 1 ELSE 0 END,
    losses = losses + CASE WHEN g.result = '0-1' THEN 1 ELSE 0 END,
    draws = draws + CASE WHEN g.result = '1/2-1/2' THEN 1 ELSE 0 END,
    last_rated_at = now(), updated_at = now()
  WHERE user_id = g.white_id AND pool = pool_name;

  UPDATE public.user_variant_ratings SET
    rating = b_after,
    rating_deviation = (b_new->>'rd')::numeric,
    volatility = (b_new->>'volatility')::numeric,
    peak_rating = GREATEST(peak_rating, b_after),
    games_played = games_played + 1,
    wins = wins + CASE WHEN g.result = '0-1' THEN 1 ELSE 0 END,
    losses = losses + CASE WHEN g.result = '1-0' THEN 1 ELSE 0 END,
    draws = draws + CASE WHEN g.result = '1/2-1/2' THEN 1 ELSE 0 END,
    last_rated_at = now(), updated_at = now()
  WHERE user_id = g.black_id AND pool = pool_name;

  -- profiles keeps the site-wide display rating (realtime standard pools only)
  -- plus lifetime counters for every rated game.
  UPDATE public.profiles SET
    rating = CASE WHEN pool_name IN ('bullet','blitz','rapid','classical') THEN w_after ELSE rating END,
    rating_deviation = CASE WHEN pool_name IN ('bullet','blitz','rapid','classical')
                            THEN (w_new->>'rd')::numeric ELSE rating_deviation END,
    volatility = CASE WHEN pool_name IN ('bullet','blitz','rapid','classical')
                      THEN (w_new->>'volatility')::numeric ELSE volatility END,
    peak_rating = GREATEST(peak_rating, CASE WHEN pool_name IN ('bullet','blitz','rapid','classical') THEN w_after ELSE 0 END),
    games_played = games_played + 1,
    wins = wins + CASE WHEN g.result = '1-0' THEN 1 ELSE 0 END,
    losses = losses + CASE WHEN g.result = '0-1' THEN 1 ELSE 0 END,
    draws = draws + CASE WHEN g.result = '1/2-1/2' THEN 1 ELSE 0 END,
    last_rated_at = now(), updated_at = now()
  WHERE id = g.white_id;

  UPDATE public.profiles SET
    rating = CASE WHEN pool_name IN ('bullet','blitz','rapid','classical') THEN b_after ELSE rating END,
    rating_deviation = CASE WHEN pool_name IN ('bullet','blitz','rapid','classical')
                            THEN (b_new->>'rd')::numeric ELSE rating_deviation END,
    volatility = CASE WHEN pool_name IN ('bullet','blitz','rapid','classical')
                      THEN (b_new->>'volatility')::numeric ELSE volatility END,
    peak_rating = GREATEST(peak_rating, CASE WHEN pool_name IN ('bullet','blitz','rapid','classical') THEN b_after ELSE 0 END),
    games_played = games_played + 1,
    wins = wins + CASE WHEN g.result = '0-1' THEN 1 ELSE 0 END,
    losses = losses + CASE WHEN g.result = '1-0' THEN 1 ELSE 0 END,
    draws = draws + CASE WHEN g.result = '1/2-1/2' THEN 1 ELSE 0 END,
    last_rated_at = now(), updated_at = now()
  WHERE id = g.black_id;

  INSERT INTO public.rating_events (
    game_id, white_id, black_id, result,
    white_rating_before, white_rd_before, white_volatility_before,
    white_rating_after, white_rd_after, white_volatility_after, white_delta,
    black_rating_before, black_rd_before, black_volatility_before,
    black_rating_after, black_rd_after, black_volatility_after, black_delta,
    algorithm, algorithm_version, idempotency_key, pool
  ) VALUES (
    g.id, g.white_id, g.black_id, g.result,
    w_rating, w_rd, w_vol,
    w_after, (w_new->>'rd')::numeric, (w_new->>'volatility')::numeric, w_after - w_rating,
    b_rating, b_rd, b_vol,
    b_after, (b_new->>'rd')::numeric, (b_new->>'volatility')::numeric, b_after - b_rating,
    'glicko2', 1, 'rating:' || g.id::text || ':v1', pool_name
  ) RETURNING * INTO ev;

  UPDATE public.games SET rating_applied_at = now() WHERE id = g.id;
  RETURN jsonb_build_object('ok', true, 'code', 'APPLIED', 'event', to_jsonb(ev));
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO existing FROM public.rating_events WHERE game_id = _game_id;
    RETURN jsonb_build_object('ok', true, 'code', 'ALREADY_APPLIED', 'event', to_jsonb(existing));
END; $fn$;

-- 5) queue join uses the spec + pool rating -------------------
CREATE OR REPLACE FUNCTION public.queue_join(_variant text, _time_control text)
RETURNS public.matchmaking_queue LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  uid uuid := auth.uid(); my_rating integer; entry public.matchmaking_queue%ROWTYPE;
  spec jsonb; pool_name text; pr public.user_variant_ratings%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _variant IS NULL OR _variant NOT IN ('standard','chess960') THEN RAISE EXCEPTION 'Invalid variant'; END IF;

  spec := public.tc_spec(_time_control);
  IF NOT COALESCE((spec->>'valid')::boolean, false) THEN RAISE EXCEPTION 'Invalid time control'; END IF;

  UPDATE public.matchmaking_queue SET status = 'cancelled', updated_at = now()
  WHERE user_id = uid AND status = 'waiting';

  pool_name := public.rating_pool(_variant, _time_control);
  pr := public.ensure_pool_rating(uid, pool_name);
  my_rating := COALESCE(pr.rating, 1200);

  INSERT INTO public.matchmaking_queue (user_id, rating, variant, time_control, status)
  VALUES (uid, my_rating, _variant, _time_control, 'waiting')
  RETURNING * INTO entry;
  RETURN entry;
END; $fn$;

-- 6) match creation honours the spec --------------------------
CREATE OR REPLACE FUNCTION public.create_online_match(
  _queue_id uuid, _user_id uuid, _initial_fen text, _white_is_requester boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  me public.matchmaking_queue%ROWTYPE; candidate public.matchmaking_queue%ROWTYPE;
  opponent public.matchmaking_queue%ROWTYPE;
  my_rd numeric; wait_sec numeric; window_size numeric;
  new_game_id uuid; white_player uuid; black_player uuid;
  white_player_rating integer; black_player_rating integer;
  spec jsonb; initial_ms integer; changed_rows integer;
  standard_fen text := 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
BEGIN
  IF _user_id IS NULL THEN
    PERFORM public.log_security_event('rpc_denied','create_online_match','execute','no_session','Unauthenticated matchmaking call');
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO candidate FROM public.matchmaking_queue WHERE id = _queue_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF candidate.user_id <> _user_id THEN
    PERFORM public.log_security_event('rpc_denied','create_online_match','execute','not_owner',
      'Caller tried to run matchmaking for another user queue entry', NULL, NULL,
      jsonb_build_object('queue_id', _queue_id, 'owner_id', candidate.user_id, 'caller_id', _user_id));
    RAISE EXCEPTION 'Not your queue entry';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('nine64_match_pool')::integer,
    hashtext(candidate.variant || ':' || candidate.time_control)::integer);

  SELECT * INTO me FROM public.matchmaking_queue WHERE id = _queue_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF me.user_id <> _user_id THEN RAISE EXCEPTION 'Not your queue entry'; END IF;
  IF me.status = 'matched' THEN RETURN me.matched_game_id; END IF;
  IF me.status <> 'waiting' THEN RETURN NULL; END IF;
  IF me.updated_at < now() - interval '20 seconds' THEN RETURN NULL; END IF;

  IF me.variant = 'standard' AND _initial_fen <> standard_fen THEN RAISE EXCEPTION 'Invalid starting position'; END IF;
  IF char_length(_initial_fen) < 10 OR char_length(_initial_fen) > 120 THEN RAISE EXCEPTION 'Invalid starting position'; END IF;

  spec := public.tc_spec(me.time_control);
  IF NOT COALESCE((spec->>'valid')::boolean, false) THEN RAISE EXCEPTION 'Invalid time control'; END IF;

  SELECT coalesce(rating_deviation, 350) INTO my_rd FROM public.profiles WHERE id = me.user_id;
  wait_sec := extract(epoch FROM (now() - me.created_at));
  window_size := least(800, 120 + floor(wait_sec / 3) * 80);

  SELECT q.* INTO opponent
  FROM public.matchmaking_queue q
  JOIN public.profiles p ON p.id = q.user_id
  WHERE q.status = 'waiting'
    AND q.updated_at >= now() - interval '20 seconds'
    AND q.id <> me.id AND q.user_id <> me.user_id
    AND q.variant = me.variant AND q.time_control = me.time_control
    AND abs(q.rating - me.rating) <= window_size
    AND NOT EXISTS (
      SELECT 1 FROM public.games active_game
      WHERE active_game.status = 'active' AND active_game.pace = 'realtime'
        AND q.user_id IN (active_game.white_id, active_game.black_id))
  ORDER BY
    CASE WHEN EXISTS (
      SELECT 1 FROM (
        SELECT gg.white_id, gg.black_id FROM public.games gg
        WHERE me.user_id IN (gg.white_id, gg.black_id)
        ORDER BY gg.created_at DESC LIMIT 2) recent
      WHERE q.user_id IN (recent.white_id, recent.black_id)) THEN 250 ELSE 0 END
    + abs(q.rating - me.rating) * 1.0
    + abs(coalesce(p.rating_deviation, 350) - coalesce(my_rd, 350)) * 0.25
    - extract(epoch FROM (now() - q.created_at)) * 2.0,
    q.created_at ASC
  LIMIT 1 FOR UPDATE OF q;

  IF NOT FOUND THEN RETURN NULL; END IF;

  IF _white_is_requester THEN
    white_player := me.user_id; black_player := opponent.user_id;
    white_player_rating := me.rating; black_player_rating := opponent.rating;
  ELSE
    white_player := opponent.user_id; black_player := me.user_id;
    white_player_rating := opponent.rating; black_player_rating := me.rating;
  END IF;

  initial_ms := GREATEST(1000, (spec->>'base_ms')::integer);

  INSERT INTO public.games (
    white_id, black_id, white_rating, black_rating, variant, time_control,
    status, initial_fen, current_fen, white_time_ms, black_time_ms, rated, spectate)
  VALUES (
    white_player, black_player, white_player_rating, black_player_rating,
    me.variant, me.time_control, 'active', _initial_fen, _initial_fen,
    initial_ms, initial_ms, true, 'public')
  RETURNING id INTO new_game_id;

  UPDATE public.matchmaking_queue
  SET status = 'matched', matched_game_id = new_game_id, updated_at = now()
  WHERE id IN (me.id, opponent.id) AND status = 'waiting';

  GET DIAGNOSTICS changed_rows = ROW_COUNT;
  IF changed_rows <> 2 THEN RAISE EXCEPTION 'Match race detected'; END IF;

  RETURN new_game_id;
END; $fn$;

-- 7) move commit: realtime clocks or daily deadlines ----------
CREATE OR REPLACE FUNCTION public.commit_move_internal(
  _game_id uuid, _user_id uuid, _expected_version integer,
  _san text, _uci text, _fen text, _outcome text, _end_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  g public.games%ROWTYPE; ts timestamptz; next_ply integer;
  mover_is_white boolean; white_to_move boolean;
  elapsed_ms bigint; remaining bigint;
  new_move public.game_moves%ROWTYPE;
  new_status text; new_result text; new_winner uuid; new_reason text;
  new_white integer; new_black integer; new_deadline timestamptz;
BEGIN
  IF _game_id IS NULL OR _user_id IS NULL OR _expected_version IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ILLEGAL_MOVE'); END IF;
  IF _san IS NULL OR length(_san) = 0 OR length(_san) > 16 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ILLEGAL_MOVE'); END IF;
  IF _uci IS NULL OR length(_uci) < 4 OR length(_uci) > 5 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ILLEGAL_MOVE'); END IF;
  IF _fen IS NULL OR length(_fen) < 10 OR length(_fen) > 120 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ILLEGAL_MOVE'); END IF;
  IF _outcome IS NULL OR _outcome NOT IN ('none','checkmate','draw') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ILLEGAL_MOVE'); END IF;

  SELECT * INTO g FROM public.games WHERE id = _game_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND'); END IF;

  ts := clock_timestamp();

  IF g.white_id <> _user_id AND g.black_id <> _user_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_A_PARTICIPANT', 'server_now', ts); END IF;
  IF g.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_ACTIVE', 'game', to_jsonb(g), 'server_now', ts); END IF;
  IF g.version <> _expected_version THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STALE_GAME_VERSION', 'game', to_jsonb(g), 'server_now', ts); END IF;

  mover_is_white := g.white_id = _user_id;
  white_to_move := split_part(g.current_fen, ' ', 2) = 'w';
  IF mover_is_white <> white_to_move THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_YOUR_TURN', 'game', to_jsonb(g), 'server_now', ts); END IF;

  IF g.pace = 'daily' THEN
    remaining := (EXTRACT(EPOCH FROM (COALESCE(g.deadline_at, ts + interval '1 minute') - ts)) * 1000)::bigint;
    new_white := g.white_time_ms; new_black := g.black_time_ms;
  ELSE
    elapsed_ms := GREATEST(0,
      (EXTRACT(EPOCH FROM (ts - COALESCE(g.turn_started_at, g.last_move_at, g.created_at))) * 1000)::bigint
      - public.clock_lag_grace_ms());
    remaining := (CASE WHEN mover_is_white THEN g.white_time_ms ELSE g.black_time_ms END) - elapsed_ms;
  END IF;

  IF remaining <= 0 THEN
    UPDATE public.games
    SET status = 'completed',
        result = CASE WHEN mover_is_white THEN '0-1' ELSE '1-0' END,
        winner_id = CASE WHEN mover_is_white THEN g.black_id ELSE g.white_id END,
        end_reason = 'timeout',
        white_time_ms = CASE WHEN g.pace = 'daily' THEN g.white_time_ms
                             WHEN mover_is_white THEN 0 ELSE g.white_time_ms END,
        black_time_ms = CASE WHEN g.pace = 'daily' THEN g.black_time_ms
                             WHEN mover_is_white THEN g.black_time_ms ELSE 0 END,
        clock_state = 'stopped', turn_started_at = NULL, deadline_at = NULL,
        version = g.version + 1, last_move_at = ts, updated_at = ts
    WHERE id = _game_id AND status = 'active'
    RETURNING * INTO g;

    PERFORM public.apply_rating_once(_game_id);
    RETURN jsonb_build_object('ok', false, 'code', 'FLAGGED', 'game', to_jsonb(g), 'server_now', ts);
  END IF;

  IF g.pace <> 'daily' THEN
    IF mover_is_white THEN
      new_white := LEAST(2147483647, remaining + g.increment_ms)::integer;
      new_black := g.black_time_ms;
    ELSE
      new_white := g.white_time_ms;
      new_black := LEAST(2147483647, remaining + g.increment_ms)::integer;
    END IF;
  END IF;

  IF _outcome = 'checkmate' THEN
    new_status := 'completed';
    new_result := CASE WHEN mover_is_white THEN '1-0' ELSE '0-1' END;
    new_winner := _user_id; new_reason := 'checkmate';
  ELSIF _outcome = 'draw' THEN
    new_status := 'completed'; new_result := '1/2-1/2'; new_winner := NULL;
    new_reason := CASE WHEN _end_reason IN ('stalemate','insufficient_material','threefold_repetition','fifty_move_rule')
                       THEN _end_reason ELSE 'other' END;
  ELSE
    new_status := 'active'; new_result := '*'; new_winner := NULL; new_reason := NULL;
  END IF;

  IF new_status = 'active' AND g.pace = 'daily' THEN
    new_deadline := ts + make_interval(secs => GREATEST(60000, g.daily_move_ms) / 1000.0);
  ELSE
    new_deadline := NULL;
  END IF;

  SELECT COALESCE(MAX(move_number), 0) + 1 INTO next_ply FROM public.game_moves WHERE game_id = _game_id;

  INSERT INTO public.game_moves (game_id, move_number, san, uci, fen, white_time_ms, black_time_ms)
  VALUES (_game_id, next_ply, _san, _uci, _fen, new_white, new_black)
  RETURNING * INTO new_move;

  UPDATE public.games
  SET current_fen = _fen, white_time_ms = new_white, black_time_ms = new_black,
      version = g.version + 1, status = new_status, result = new_result,
      winner_id = COALESCE(new_winner, winner_id),
      end_reason = COALESCE(new_reason, end_reason),
      clock_state = CASE WHEN new_status = 'active' THEN 'running' ELSE 'stopped' END,
      turn_started_at = CASE WHEN new_status = 'active' THEN ts ELSE NULL END,
      deadline_at = new_deadline,
      last_move_at = ts, updated_at = ts
  WHERE id = _game_id
  RETURNING * INTO g;

  IF new_status = 'completed' THEN PERFORM public.apply_rating_once(_game_id); END IF;

  RETURN jsonb_build_object('ok', true, 'code', 'OK', 'game', to_jsonb(g),
    'move', to_jsonb(new_move), 'server_now', ts,
    'active_side', split_part(g.current_fen, ' ', 2));
END; $fn$;

-- 8) timeout adjudication for both paces ----------------------
CREATE OR REPLACE FUNCTION public.finalize_game_timeout(_game_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  g public.games%ROWTYPE; ts timestamptz; mover_is_white boolean;
  elapsed_ms bigint; remaining bigint;
BEGIN
  SELECT * INTO g FROM public.games WHERE id = _game_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND'); END IF;

  ts := clock_timestamp();

  IF g.status <> 'active' THEN
    RETURN jsonb_build_object('ok', true, 'code', 'ALREADY_FINAL', 'finalized', false,
                              'game', to_jsonb(g), 'server_now', ts);
  END IF;

  mover_is_white := split_part(g.current_fen, ' ', 2) = 'w';

  IF g.pace = 'daily' THEN
    remaining := (EXTRACT(EPOCH FROM (COALESCE(g.deadline_at, ts + interval '1 minute') - ts)) * 1000)::bigint;
  ELSE
    elapsed_ms := GREATEST(0,
      (EXTRACT(EPOCH FROM (ts - COALESCE(g.turn_started_at, g.last_move_at, g.created_at))) * 1000)::bigint
      - public.clock_lag_grace_ms());
    remaining := (CASE WHEN mover_is_white THEN g.white_time_ms ELSE g.black_time_ms END) - elapsed_ms;
  END IF;

  IF remaining > 0 THEN
    RETURN jsonb_build_object('ok', true, 'code', 'STILL_RUNNING', 'finalized', false,
                              'game', to_jsonb(g), 'server_now', ts);
  END IF;

  UPDATE public.games
  SET status = 'completed',
      result = CASE WHEN mover_is_white THEN '0-1' ELSE '1-0' END,
      winner_id = CASE WHEN mover_is_white THEN g.black_id ELSE g.white_id END,
      end_reason = 'timeout',
      white_time_ms = CASE WHEN g.pace = 'daily' THEN g.white_time_ms
                           WHEN mover_is_white THEN 0 ELSE g.white_time_ms END,
      black_time_ms = CASE WHEN g.pace = 'daily' THEN g.black_time_ms
                           WHEN mover_is_white THEN g.black_time_ms ELSE 0 END,
      clock_state = 'stopped', turn_started_at = NULL, deadline_at = NULL,
      version = g.version + 1, last_move_at = ts, updated_at = ts
  WHERE id = _game_id AND status = 'active'
  RETURNING * INTO g;

  PERFORM public.apply_rating_once(_game_id);

  RETURN jsonb_build_object('ok', true, 'code', 'FLAGGED', 'finalized', true,
                            'game', to_jsonb(g), 'server_now', ts);
END; $fn$;

CREATE OR REPLACE FUNCTION public.finalize_expired_games(_limit integer DEFAULT 200)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE r record; finalized integer := 0; scanned integer := 0; res jsonb;
BEGIN
  FOR r IN
    SELECT id FROM public.games
    WHERE status = 'active'
      AND (
        (pace = 'daily' AND deadline_at IS NOT NULL AND deadline_at <= clock_timestamp())
        OR (pace <> 'daily' AND clock_state = 'running'
            AND COALESCE(turn_started_at, last_move_at, created_at)
                + make_interval(secs => (
                    (CASE WHEN split_part(current_fen, ' ', 2) = 'w' THEN white_time_ms ELSE black_time_ms END)
                    + public.clock_lag_grace_ms()) / 1000.0) <= clock_timestamp())
      )
    ORDER BY updated_at ASC
    LIMIT GREATEST(1, LEAST(_limit, 500))
    FOR UPDATE SKIP LOCKED
  LOOP
    scanned := scanned + 1;
    res := public.finalize_game_timeout(r.id);
    IF (res->>'finalized')::boolean THEN finalized := finalized + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('scanned', scanned, 'finalized', finalized, 'server_now', clock_timestamp());
END; $fn$;

-- 9) custom challenges & rematch ------------------------------
CREATE TABLE IF NOT EXISTS public.game_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opponent_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  variant text NOT NULL DEFAULT 'standard',
  time_control text NOT NULL,
  pace text NOT NULL DEFAULT 'realtime',
  rated boolean NOT NULL DEFAULT true,
  color text NOT NULL DEFAULT 'random',
  allow_takeback boolean NOT NULL DEFAULT false,
  spectate text NOT NULL DEFAULT 'public',
  spectator_delay_seconds integer NOT NULL DEFAULT 0,
  rematch_of uuid REFERENCES public.games(id) ON DELETE SET NULL,
  message text,
  status text NOT NULL DEFAULT 'open',
  game_id uuid REFERENCES public.games(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT game_challenges_color_check CHECK (color IN ('white','black','random')),
  CONSTRAINT game_challenges_status_check CHECK (status IN ('open','accepted','declined','cancelled','expired')),
  CONSTRAINT game_challenges_spectate_check CHECK (spectate IN ('public','private')),
  CONSTRAINT game_challenges_delay_check CHECK (spectator_delay_seconds IN (0,15,30,60)),
  CONSTRAINT game_challenges_distinct CHECK (opponent_id IS NULL OR opponent_id <> creator_id)
);

GRANT SELECT ON public.game_challenges TO authenticated;
GRANT ALL ON public.game_challenges TO service_role;
ALTER TABLE public.game_challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Challenges visible to participants and open lobby" ON public.game_challenges;
CREATE POLICY "Challenges visible to participants and open lobby"
  ON public.game_challenges FOR SELECT TO authenticated
  USING (creator_id = auth.uid() OR opponent_id = auth.uid()
         OR (opponent_id IS NULL AND status = 'open'));

CREATE INDEX IF NOT EXISTS game_challenges_open_idx
  ON public.game_challenges (created_at DESC) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS game_challenges_inbox_idx
  ON public.game_challenges (opponent_id, created_at DESC);

DROP TRIGGER IF EXISTS set_game_challenges_updated_at ON public.game_challenges;
CREATE TRIGGER set_game_challenges_updated_at BEFORE UPDATE ON public.game_challenges
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.challenge_create(
  _user_id uuid, _opponent_id uuid, _variant text, _time_control text,
  _rated boolean, _color text, _allow_takeback boolean,
  _spectate text, _spectator_delay integer, _rematch_of uuid, _message text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE spec jsonb; row_out public.game_challenges%ROWTYPE; open_count integer;
BEGIN
  IF _user_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); END IF;
  IF _variant IS NULL OR _variant NOT IN ('standard','chess960') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_VARIANT'); END IF;

  spec := public.tc_spec(_time_control);
  IF NOT COALESCE((spec->>'valid')::boolean, false) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_TIME_CONTROL'); END IF;
  IF _color NOT IN ('white','black','random') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_COLOR'); END IF;
  IF _spectate NOT IN ('public','private') OR _spectator_delay NOT IN (0,15,30,60) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_SPECTATE'); END IF;
  IF _opponent_id = _user_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_OPPONENT'); END IF;
  IF _allow_takeback AND _rated THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TAKEBACK_RATED_FORBIDDEN'); END IF;

  UPDATE public.game_challenges SET status = 'expired', updated_at = now()
  WHERE status = 'open' AND expires_at <= now();

  SELECT count(*) INTO open_count FROM public.game_challenges
  WHERE creator_id = _user_id AND status = 'open';
  IF open_count >= 10 THEN RETURN jsonb_build_object('ok', false, 'code', 'TOO_MANY_OPEN'); END IF;

  INSERT INTO public.game_challenges (
    creator_id, opponent_id, variant, time_control, pace, rated, color,
    allow_takeback, spectate, spectator_delay_seconds, rematch_of, message, expires_at)
  VALUES (
    _user_id, _opponent_id, _variant, _time_control, spec->>'pace', COALESCE(_rated, true), _color,
    COALESCE(_allow_takeback, false), _spectate, _spectator_delay, _rematch_of,
    NULLIF(left(COALESCE(_message, ''), 200), ''),
    now() + CASE WHEN (spec->>'pace') = 'daily' THEN interval '3 days' ELSE interval '10 minutes' END)
  RETURNING * INTO row_out;

  IF _opponent_id IS NOT NULL THEN
    PERFORM public.enqueue_notification('challenge_received', 'challenge:' || row_out.id::text,
      _opponent_id, NULL, _user_id,
      jsonb_build_object('challenge_id', row_out.id, 'variant', _variant, 'time_control', _time_control,
                         'rated', COALESCE(_rated, true)));
  END IF;

  RETURN jsonb_build_object('ok', true, 'code', 'CREATED', 'challenge', to_jsonb(row_out));
END; $fn$;

CREATE OR REPLACE FUNCTION public.challenge_respond(_challenge_id uuid, _user_id uuid, _action text, _initial_fen text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  c public.game_challenges%ROWTYPE; spec jsonb; g public.games%ROWTYPE;
  white_player uuid; black_player uuid; creator_is_white boolean;
  initial_ms integer; w_rating integer; b_rating integer;
  pool_name text; wr public.user_variant_ratings%ROWTYPE; br public.user_variant_ratings%ROWTYPE;
  fen text; standard_fen text := 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
BEGIN
  IF _user_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); END IF;
  IF _action NOT IN ('accept','decline','cancel') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ACTION'); END IF;

  SELECT * INTO c FROM public.game_challenges WHERE id = _challenge_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'CHALLENGE_NOT_FOUND'); END IF;

  IF c.status <> 'open' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CHALLENGE_NOT_OPEN', 'challenge', to_jsonb(c)); END IF;
  IF c.expires_at <= now() THEN
    UPDATE public.game_challenges SET status = 'expired', updated_at = now() WHERE id = c.id RETURNING * INTO c;
    RETURN jsonb_build_object('ok', false, 'code', 'CHALLENGE_EXPIRED', 'challenge', to_jsonb(c)); END IF;

  IF _action = 'cancel' THEN
    IF c.creator_id <> _user_id THEN RETURN jsonb_build_object('ok', false, 'code', 'NOT_CHALLENGE_OWNER'); END IF;
    UPDATE public.game_challenges SET status = 'cancelled', updated_at = now() WHERE id = c.id RETURNING * INTO c;
    RETURN jsonb_build_object('ok', true, 'code', 'CANCELLED', 'challenge', to_jsonb(c));
  END IF;

  IF c.creator_id = _user_id THEN RETURN jsonb_build_object('ok', false, 'code', 'CANNOT_ANSWER_OWN'); END IF;
  IF c.opponent_id IS NOT NULL AND c.opponent_id <> _user_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_CHALLENGE_RECIPIENT'); END IF;

  IF _action = 'decline' THEN
    UPDATE public.game_challenges SET status = 'declined', updated_at = now() WHERE id = c.id RETURNING * INTO c;
    PERFORM public.enqueue_notification('challenge_declined', 'challenge_declined:' || c.id::text,
      c.creator_id, NULL, _user_id, jsonb_build_object('challenge_id', c.id));
    RETURN jsonb_build_object('ok', true, 'code', 'DECLINED', 'challenge', to_jsonb(c));
  END IF;

  spec := public.tc_spec(c.time_control);
  IF NOT COALESCE((spec->>'valid')::boolean, false) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_TIME_CONTROL'); END IF;

  fen := COALESCE(NULLIF(_initial_fen, ''), standard_fen);
  IF c.variant = 'standard' AND fen <> standard_fen THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_START_POSITION'); END IF;
  IF char_length(fen) < 10 OR char_length(fen) > 120 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_START_POSITION'); END IF;

  creator_is_white := CASE c.color WHEN 'white' THEN true WHEN 'black' THEN false
                                   ELSE (random() < 0.5) END;
  IF creator_is_white THEN white_player := c.creator_id; black_player := _user_id;
  ELSE white_player := _user_id; black_player := c.creator_id; END IF;

  pool_name := public.rating_pool(c.variant, c.time_control);
  wr := public.ensure_pool_rating(white_player, pool_name);
  br := public.ensure_pool_rating(black_player, pool_name);
  w_rating := COALESCE(wr.rating, 1200);
  b_rating := COALESCE(br.rating, 1200);
  initial_ms := GREATEST(1000, COALESCE((spec->>'base_ms')::integer, 300000));

  INSERT INTO public.games (
    white_id, black_id, white_rating, black_rating, variant, time_control, status,
    initial_fen, current_fen, white_time_ms, black_time_ms, rated,
    allow_takeback, spectate, spectator_delay_seconds, rematch_of, challenge_id)
  VALUES (
    white_player, black_player, w_rating, b_rating, c.variant, c.time_control, 'active',
    fen, fen, initial_ms, initial_ms, c.rated,
    c.allow_takeback, c.spectate, c.spectator_delay_seconds, c.rematch_of, c.id)
  RETURNING * INTO g;

  UPDATE public.game_challenges
  SET status = 'accepted', game_id = g.id, opponent_id = COALESCE(opponent_id, _user_id), updated_at = now()
  WHERE id = c.id RETURNING * INTO c;

  PERFORM public.enqueue_notification('challenge_accepted', 'challenge_accepted:' || c.id::text,
    c.creator_id, g.id, _user_id, jsonb_build_object('challenge_id', c.id, 'game_id', g.id));

  RETURN jsonb_build_object('ok', true, 'code', 'ACCEPTED', 'challenge', to_jsonb(c), 'game', to_jsonb(g));
END; $fn$;

-- 10) takeback requests (casual games only) -------------------
CREATE TABLE IF NOT EXISTS public.game_takeback_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_to uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plies integer NOT NULL,
  game_version integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '2 minutes',
  CONSTRAINT game_takeback_status_check CHECK (status IN ('pending','accepted','declined','cancelled','expired')),
  CONSTRAINT game_takeback_plies_check CHECK (plies BETWEEN 1 AND 2),
  CONSTRAINT game_takeback_distinct CHECK (requested_by <> requested_to)
);

CREATE UNIQUE INDEX IF NOT EXISTS game_takeback_idem ON public.game_takeback_requests (idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS game_takeback_one_pending
  ON public.game_takeback_requests (game_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS game_takeback_game_idx
  ON public.game_takeback_requests (game_id, created_at DESC);

GRANT SELECT ON public.game_takeback_requests TO authenticated;
GRANT ALL ON public.game_takeback_requests TO service_role;
ALTER TABLE public.game_takeback_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Takeback requests visible to the two players" ON public.game_takeback_requests;
CREATE POLICY "Takeback requests visible to the two players"
  ON public.game_takeback_requests FOR SELECT TO authenticated
  USING (requested_by = auth.uid() OR requested_to = auth.uid());

CREATE OR REPLACE FUNCTION public.takeback_request_internal(
  _game_id uuid, _user_id uuid, _expected_version integer, _idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  g public.games%ROWTYPE; r public.game_takeback_requests%ROWTYPE;
  ply_count integer; want_plies integer; my_turn boolean; is_white boolean;
BEGIN
  IF _user_id IS NULL OR _idempotency_key IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_INPUT'); END IF;

  SELECT * INTO r FROM public.game_takeback_requests WHERE idempotency_key = _idempotency_key;
  IF FOUND THEN RETURN jsonb_build_object('ok', true, 'code', 'REQUEST_EXISTS', 'request', to_jsonb(r)); END IF;

  SELECT * INTO g FROM public.games WHERE id = _game_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND'); END IF;
  IF g.white_id <> _user_id AND g.black_id <> _user_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_A_PARTICIPANT'); END IF;
  IF g.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_ACTIVE', 'game', to_jsonb(g)); END IF;
  IF g.version <> _expected_version THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STALE_GAME_VERSION', 'game', to_jsonb(g)); END IF;
  IF g.rated OR NOT g.allow_takeback THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TAKEBACK_NOT_ALLOWED', 'game', to_jsonb(g)); END IF;

  UPDATE public.game_takeback_requests SET status = 'expired', responded_at = now()
  WHERE game_id = _game_id AND status = 'pending' AND expires_at <= now();

  IF EXISTS (SELECT 1 FROM public.game_takeback_requests
             WHERE game_id = _game_id AND status = 'pending') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REQUEST_ALREADY_PENDING'); END IF;

  SELECT COALESCE(MAX(move_number), 0) INTO ply_count FROM public.game_moves WHERE game_id = _game_id;
  IF ply_count < 1 THEN RETURN jsonb_build_object('ok', false, 'code', 'NOTHING_TO_TAKE_BACK'); END IF;

  is_white := g.white_id = _user_id;
  my_turn := (split_part(g.current_fen, ' ', 2) = 'w') = is_white;
  want_plies := CASE WHEN my_turn THEN 2 ELSE 1 END;
  IF want_plies > ply_count THEN want_plies := ply_count; END IF;

  INSERT INTO public.game_takeback_requests (game_id, requested_by, requested_to, plies, game_version, idempotency_key)
  VALUES (_game_id, _user_id,
          CASE WHEN is_white THEN g.black_id ELSE g.white_id END,
          want_plies, g.version, _idempotency_key)
  RETURNING * INTO r;

  PERFORM public.enqueue_notification('takeback_offer', 'takeback:' || r.id::text,
    r.requested_to, _game_id, _user_id, jsonb_build_object('request_id', r.id, 'plies', want_plies));

  RETURN jsonb_build_object('ok', true, 'code', 'REQUEST_CREATED', 'request', to_jsonb(r), 'game', to_jsonb(g));
END; $fn$;

CREATE OR REPLACE FUNCTION public.takeback_respond_internal(
  _game_id uuid, _request_id uuid, _user_id uuid, _action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  g public.games%ROWTYPE; r public.game_takeback_requests%ROWTYPE;
  target_ply integer; target public.game_moves%ROWTYPE; ts timestamptz;
  new_fen text; new_white integer; new_black integer; spec jsonb;
BEGIN
  IF _action NOT IN ('accept','decline','cancel') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ACTION'); END IF;

  SELECT * INTO g FROM public.games WHERE id = _game_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND'); END IF;

  SELECT * INTO r FROM public.game_takeback_requests
  WHERE id = _request_id AND game_id = _game_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'REQUEST_NOT_FOUND'); END IF;
  IF r.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REQUEST_NOT_PENDING', 'request', to_jsonb(r)); END IF;
  IF r.expires_at <= now() THEN
    UPDATE public.game_takeback_requests SET status = 'expired', responded_at = now()
    WHERE id = r.id RETURNING * INTO r;
    RETURN jsonb_build_object('ok', false, 'code', 'REQUEST_EXPIRED', 'request', to_jsonb(r)); END IF;

  IF _action = 'cancel' THEN
    IF r.requested_by <> _user_id THEN RETURN jsonb_build_object('ok', false, 'code', 'NOT_REQUEST_SENDER'); END IF;
    UPDATE public.game_takeback_requests SET status = 'cancelled', responded_at = now()
    WHERE id = r.id RETURNING * INTO r;
    RETURN jsonb_build_object('ok', true, 'code', 'CANCELLED', 'request', to_jsonb(r), 'game', to_jsonb(g));
  END IF;

  IF r.requested_to <> _user_id THEN RETURN jsonb_build_object('ok', false, 'code', 'NOT_REQUEST_RECIPIENT'); END IF;

  IF _action = 'decline' THEN
    UPDATE public.game_takeback_requests SET status = 'declined', responded_at = now()
    WHERE id = r.id RETURNING * INTO r;
    RETURN jsonb_build_object('ok', true, 'code', 'DECLINED', 'request', to_jsonb(r), 'game', to_jsonb(g));
  END IF;

  IF g.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_ACTIVE', 'game', to_jsonb(g)); END IF;
  IF g.rated OR NOT g.allow_takeback THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TAKEBACK_NOT_ALLOWED', 'game', to_jsonb(g)); END IF;

  ts := clock_timestamp();
  SELECT COALESCE(MAX(move_number), 0) - r.plies INTO target_ply FROM public.game_moves WHERE game_id = _game_id;
  IF target_ply < 0 THEN target_ply := 0; END IF;

  spec := public.tc_spec(g.time_control);

  IF target_ply = 0 THEN
    new_fen := g.initial_fen;
    new_white := GREATEST(1000, COALESCE((spec->>'base_ms')::integer, g.white_time_ms));
    new_black := new_white;
  ELSE
    SELECT * INTO target FROM public.game_moves WHERE game_id = _game_id AND move_number = target_ply;
    new_fen := target.fen; new_white := target.white_time_ms; new_black := target.black_time_ms;
  END IF;

  DELETE FROM public.game_moves WHERE game_id = _game_id AND move_number > target_ply;

  UPDATE public.games
  SET current_fen = new_fen,
      white_time_ms = CASE WHEN g.pace = 'daily' THEN g.white_time_ms ELSE new_white END,
      black_time_ms = CASE WHEN g.pace = 'daily' THEN g.black_time_ms ELSE new_black END,
      version = g.version + 1,
      turn_started_at = ts,
      deadline_at = CASE WHEN g.pace = 'daily'
                         THEN ts + make_interval(secs => GREATEST(60000, g.daily_move_ms) / 1000.0)
                         ELSE NULL END,
      takeback_count = g.takeback_count + 1,
      last_move_at = ts, updated_at = ts
  WHERE id = _game_id
  RETURNING * INTO g;

  UPDATE public.game_takeback_requests SET status = 'accepted', responded_at = now()
  WHERE id = r.id RETURNING * INTO r;

  RETURN jsonb_build_object('ok', true, 'code', 'TAKEBACK_APPLIED', 'request', to_jsonb(r),
                            'game', to_jsonb(g), 'server_now', ts);
END; $fn$;

-- 11) connection presence / lag probe -------------------------
CREATE OR REPLACE FUNCTION public.game_touch_presence(_game_id uuid, _user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE g public.games%ROWTYPE; ts timestamptz := clock_timestamp();
BEGIN
  SELECT * INTO g FROM public.games WHERE id = _game_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND'); END IF;
  IF g.white_id <> _user_id AND g.black_id <> _user_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_A_PARTICIPANT'); END IF;

  UPDATE public.games
  SET white_seen_at = CASE WHEN g.white_id = _user_id THEN ts ELSE white_seen_at END,
      black_seen_at = CASE WHEN g.black_id = _user_id THEN ts ELSE black_seen_at END
  WHERE id = _game_id
  RETURNING * INTO g;

  RETURN jsonb_build_object('ok', true, 'code', 'OK', 'server_now', ts,
    'white_seen_at', g.white_seen_at, 'black_seen_at', g.black_seen_at,
    'opponent_seen_at', CASE WHEN g.white_id = _user_id THEN g.black_seen_at ELSE g.white_seen_at END);
END; $fn$;

-- 12) spectator view (read-only, optional broadcast delay) ----
CREATE OR REPLACE FUNCTION public.game_spectator_view(_game_id uuid, _viewer uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  g public.games%ROWTYPE; cutoff timestamptz; ts timestamptz := clock_timestamp();
  moves jsonb; fen text; wname text; bname text; delayed boolean := false;
  shown_result text; shown_status text; shown_reason text;
BEGIN
  SELECT * INTO g FROM public.games WHERE id = _game_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('allowed', false, 'code', 'GAME_NOT_FOUND'); END IF;

  IF _viewer IS NOT NULL AND (_viewer = g.white_id OR _viewer = g.black_id) THEN
    RETURN jsonb_build_object('allowed', true, 'code', 'PARTICIPANT', 'is_participant', true);
  END IF;

  IF g.spectate <> 'public' THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'SPECTATE_DISABLED');
  END IF;

  cutoff := ts - make_interval(secs => g.spectator_delay_seconds);

  SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.move_number), '[]'::jsonb)
  INTO moves
  FROM public.game_moves m
  WHERE m.game_id = _game_id AND m.created_at <= cutoff;

  SELECT m.fen INTO fen FROM public.game_moves m
  WHERE m.game_id = _game_id AND m.created_at <= cutoff
  ORDER BY m.move_number DESC LIMIT 1;
  fen := COALESCE(fen, g.initial_fen);

  delayed := g.spectator_delay_seconds > 0
    AND EXISTS (SELECT 1 FROM public.game_moves m WHERE m.game_id = _game_id AND m.created_at > cutoff);

  IF g.status = 'completed' AND COALESCE(g.last_move_at, g.updated_at) <= cutoff THEN
    shown_status := g.status; shown_result := g.result; shown_reason := g.end_reason;
  ELSIF g.status = 'completed' THEN
    shown_status := 'active'; shown_result := '*'; shown_reason := NULL; delayed := true;
  ELSE
    shown_status := g.status; shown_result := g.result; shown_reason := g.end_reason;
  END IF;

  SELECT display_name INTO wname FROM public.profiles WHERE id = g.white_id;
  SELECT display_name INTO bname FROM public.profiles WHERE id = g.black_id;

  RETURN jsonb_build_object(
    'allowed', true, 'code', 'OK', 'is_participant', false, 'delayed', delayed,
    'server_now', ts, 'delay_seconds', g.spectator_delay_seconds,
    'game', jsonb_build_object(
      'id', g.id, 'variant', g.variant, 'time_control', g.time_control, 'pace', g.pace,
      'pool', g.pool, 'rated', g.rated, 'status', shown_status, 'result', shown_result,
      'end_reason', shown_reason, 'initial_fen', g.initial_fen, 'current_fen', fen,
      'white_time_ms', g.white_time_ms, 'black_time_ms', g.black_time_ms,
      'increment_ms', g.increment_ms, 'turn_started_at', g.turn_started_at,
      'clock_state', g.clock_state, 'created_at', g.created_at,
      'white_name', COALESCE(wname, 'Trắng'), 'black_name', COALESCE(bname, 'Đen'),
      'white_rating', g.white_rating, 'black_rating', g.black_rating),
    'moves', moves);
END; $fn$;

CREATE OR REPLACE FUNCTION public.list_public_games(_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE out_rows jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO out_rows
  FROM (
    SELECT g.id, g.variant, g.time_control, g.pace, g.pool, g.rated,
           g.white_rating, g.black_rating, g.created_at, g.spectator_delay_seconds,
           COALESCE(wp.display_name, 'Trắng') AS white_name,
           COALESCE(bp.display_name, 'Đen') AS black_name,
           (SELECT count(*) FROM public.game_moves m WHERE m.game_id = g.id) AS ply_count
    FROM public.games g
    LEFT JOIN public.profiles wp ON wp.id = g.white_id
    LEFT JOIN public.profiles bp ON bp.id = g.black_id
    WHERE g.status = 'active' AND g.spectate = 'public'
    ORDER BY (g.white_rating + g.black_rating) DESC, g.updated_at DESC
    LIMIT GREATEST(1, LEAST(_limit, 50))
  ) t;
  RETURN out_rows;
END; $fn$;

REVOKE ALL ON FUNCTION public.challenge_create(uuid,uuid,text,text,boolean,text,boolean,text,integer,uuid,text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.challenge_respond(uuid,uuid,text,text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.takeback_request_internal(uuid,uuid,integer,text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.takeback_respond_internal(uuid,uuid,uuid,text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.game_touch_presence(uuid,uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.game_spectator_view(uuid,uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_pool_rating(uuid,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_games(integer) TO authenticated, service_role;