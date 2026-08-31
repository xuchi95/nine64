ALTER TABLE public.bot_sessions
  ADD COLUMN IF NOT EXISTS variant text NOT NULL DEFAULT 'standard';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bot_sessions_variant_check') THEN
    ALTER TABLE public.bot_sessions
      ADD CONSTRAINT bot_sessions_variant_check CHECK (variant IN ('standard', 'chess960'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.is_valid_chess960_start(_fen text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  placement text; side text; castling text; ranks text[];
  black text; white text; king int; rook_lo int; rook_hi int; b1 int; b2 int;
  ch text; files text := 'abcdefgh';
  has_white boolean := false; has_black boolean := false; i int;
BEGIN
  IF _fen IS NULL THEN RETURN false; END IF;
  placement := split_part(_fen, ' ', 1);
  side := split_part(_fen, ' ', 2);
  castling := split_part(_fen, ' ', 3);
  IF side <> 'w' OR castling IS NULL OR castling = '' OR castling = '-' THEN RETURN false; END IF;

  ranks := string_to_array(placement, '/');
  IF array_length(ranks, 1) <> 8 THEN RETURN false; END IF;
  IF ranks[2] <> 'pppppppp' OR ranks[7] <> 'PPPPPPPP' THEN RETURN false; END IF;
  IF ranks[3] <> '8' OR ranks[4] <> '8' OR ranks[5] <> '8' OR ranks[6] <> '8' THEN RETURN false; END IF;

  black := ranks[1];
  white := ranks[8];
  IF black !~ '^[rnbqk]{8}$' THEN RETURN false; END IF;
  IF lower(white) <> black THEN RETURN false; END IF;

  IF (length(black) - length(replace(black, 'k', ''))) <> 1 THEN RETURN false; END IF;
  IF (length(black) - length(replace(black, 'q', ''))) <> 1 THEN RETURN false; END IF;
  IF (length(black) - length(replace(black, 'r', ''))) <> 2 THEN RETURN false; END IF;
  IF (length(black) - length(replace(black, 'b', ''))) <> 2 THEN RETURN false; END IF;
  IF (length(black) - length(replace(black, 'n', ''))) <> 2 THEN RETURN false; END IF;

  b1 := position('b' in black);
  b2 := b1 + position('b' in substr(black, b1 + 1));
  IF (b2 - b1) % 2 = 0 THEN RETURN false; END IF;

  rook_lo := position('r' in black);
  rook_hi := rook_lo + position('r' in substr(black, rook_lo + 1));
  king := position('k' in black);
  IF NOT (rook_lo < king AND king < rook_hi) THEN RETURN false; END IF;

  FOR i IN 1..length(castling) LOOP
    ch := substr(castling, i, 1);
    IF ch = upper(ch) THEN has_white := true; ELSE has_black := true; END IF;
    IF lower(ch) IN ('k', 'q') THEN CONTINUE; END IF;
    IF lower(ch) !~ '^[a-h]$' THEN RETURN false; END IF;
    IF position(lower(ch) in files) NOT IN (rook_lo, rook_hi) THEN RETURN false; END IF;
  END LOOP;

  RETURN has_white AND has_black;
END;
$$;

REVOKE ALL ON FUNCTION public.is_valid_chess960_start(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_valid_chess960_start(text) TO service_role;

CREATE TABLE IF NOT EXISTS public.user_variant_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pool text NOT NULL CHECK (pool IN ('chess960')),
  rating integer NOT NULL DEFAULT 1200,
  rating_deviation numeric NOT NULL DEFAULT 350,
  volatility numeric NOT NULL DEFAULT 0.06,
  peak_rating integer NOT NULL DEFAULT 1200,
  games_played integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  draws integer NOT NULL DEFAULT 0,
  last_rated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, pool)
);

GRANT SELECT ON public.user_variant_ratings TO authenticated;
GRANT ALL ON public.user_variant_ratings TO service_role;
ALTER TABLE public.user_variant_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Variant ratings are readable by signed-in users" ON public.user_variant_ratings;
CREATE POLICY "Variant ratings are readable by signed-in users"
  ON public.user_variant_ratings FOR SELECT TO authenticated USING (true);

ALTER TABLE public.rating_events ADD COLUMN IF NOT EXISTS pool text NOT NULL DEFAULT 'standard';

CREATE OR REPLACE FUNCTION public.ensure_variant_rating(_user_id uuid, _pool text)
RETURNS public.user_variant_ratings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.user_variant_ratings%ROWTYPE;
BEGIN
  INSERT INTO public.user_variant_ratings (user_id, pool)
  VALUES (_user_id, _pool)
  ON CONFLICT (user_id, pool) DO NOTHING;
  SELECT * INTO r FROM public.user_variant_ratings
  WHERE user_id = _user_id AND pool = _pool FOR UPDATE;
  RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_variant_rating(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_variant_rating(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_rating_once(_game_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  g public.games%ROWTYPE;
  existing public.rating_events%ROWTYPE;
  first_id uuid; second_id uuid;
  w public.profiles%ROWTYPE; b public.profiles%ROWTYPE;
  wv public.user_variant_ratings%ROWTYPE; bv public.user_variant_ratings%ROWTYPE;
  pool_name text;
  w_rating integer; w_rd numeric; w_vol numeric;
  b_rating integer; b_rd numeric; b_vol numeric;
  w_new jsonb; b_new jsonb; w_score numeric; b_score numeric;
  w_after integer; b_after integer; locked boolean; ev public.rating_events%ROWTYPE;
BEGIN
  IF _game_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT');
  END IF;

  SELECT * INTO existing FROM public.rating_events WHERE game_id = _game_id;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'code', 'ALREADY_APPLIED', 'event', to_jsonb(existing));
  END IF;

  SELECT * INTO g FROM public.games WHERE id = _game_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND'); END IF;

  SELECT * INTO existing FROM public.rating_events WHERE game_id = _game_id;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'code', 'ALREADY_APPLIED', 'event', to_jsonb(existing));
  END IF;

  IF g.status <> 'completed' THEN RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_COMPLETED'); END IF;
  IF COALESCE(g.rated, true) = false THEN RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_RATED'); END IF;
  IF g.result NOT IN ('1-0', '0-1', '1/2-1/2') THEN RETURN jsonb_build_object('ok', false, 'code', 'NO_DECISIVE_RESULT'); END IF;
  IF g.white_id IS NULL OR g.black_id IS NULL OR g.white_id = g.black_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_PLAYERS');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.fairplay_status s
    WHERE s.user_id IN (g.white_id, g.black_id)
      AND s.rating_locked
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

  SELECT * INTO w FROM public.profiles WHERE id = g.white_id;
  SELECT * INTO b FROM public.profiles WHERE id = g.black_id;
  IF w.id IS NULL OR b.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'PROFILE_NOT_FOUND'); END IF;

  pool_name := CASE WHEN g.variant = 'chess960' THEN 'chess960' ELSE 'standard' END;

  IF pool_name = 'chess960' THEN
    wv := public.ensure_variant_rating(g.white_id, 'chess960');
    bv := public.ensure_variant_rating(g.black_id, 'chess960');
    w_rating := wv.rating; w_rd := wv.rating_deviation; w_vol := wv.volatility;
    b_rating := bv.rating; b_rd := bv.rating_deviation; b_vol := bv.volatility;
  ELSE
    w_rating := w.rating; w_rd := w.rating_deviation; w_vol := w.volatility;
    b_rating := b.rating; b_rd := b.rating_deviation; b_vol := b.volatility;
  END IF;

  w_score := CASE g.result WHEN '1-0' THEN 1 WHEN '0-1' THEN 0 ELSE 0.5 END;
  b_score := 1 - w_score;

  w_new := public.glicko2_update(w_rating, w_rd, w_vol, b_rating, b_rd, w_score);
  b_new := public.glicko2_update(b_rating, b_rd, b_vol, w_rating, w_rd, b_score);

  w_after := ROUND((w_new->>'rating')::numeric);
  b_after := ROUND((b_new->>'rating')::numeric);

  IF pool_name = 'chess960' THEN
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
    WHERE user_id = g.white_id AND pool = 'chess960';

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
    WHERE user_id = g.black_id AND pool = 'chess960';
  ELSE
    UPDATE public.profiles SET
      rating = w_after,
      rating_deviation = (w_new->>'rd')::numeric,
      volatility = (w_new->>'volatility')::numeric,
      peak_rating = GREATEST(peak_rating, w_after),
      games_played = games_played + 1,
      wins = wins + CASE WHEN g.result = '1-0' THEN 1 ELSE 0 END,
      losses = losses + CASE WHEN g.result = '0-1' THEN 1 ELSE 0 END,
      draws = draws + CASE WHEN g.result = '1/2-1/2' THEN 1 ELSE 0 END,
      last_rated_at = now(), updated_at = now()
    WHERE id = g.white_id;

    UPDATE public.profiles SET
      rating = b_after,
      rating_deviation = (b_new->>'rd')::numeric,
      volatility = (b_new->>'volatility')::numeric,
      peak_rating = GREATEST(peak_rating, b_after),
      games_played = games_played + 1,
      wins = wins + CASE WHEN g.result = '0-1' THEN 1 ELSE 0 END,
      losses = losses + CASE WHEN g.result = '1-0' THEN 1 ELSE 0 END,
      draws = draws + CASE WHEN g.result = '1/2-1/2' THEN 1 ELSE 0 END,
      last_rated_at = now(), updated_at = now()
    WHERE id = g.black_id;
  END IF;

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
  )
  RETURNING * INTO ev;

  UPDATE public.games SET rating_applied_at = now() WHERE id = g.id;

  RETURN jsonb_build_object('ok', true, 'code', 'APPLIED', 'event', to_jsonb(ev));
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO existing FROM public.rating_events WHERE game_id = _game_id;
    RETURN jsonb_build_object('ok', true, 'code', 'ALREADY_APPLIED', 'event', to_jsonb(existing));
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_rating_once(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_rating_once(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.queue_join(_variant text, _time_control text)
RETURNS public.matchmaking_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  my_rating integer;
  entry public.matchmaking_queue%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _variant IS NULL OR _variant NOT IN ('standard', 'chess960') THEN RAISE EXCEPTION 'Invalid variant'; END IF;
  IF _time_control IS NULL OR _time_control NOT IN
     ('blitz1m','blitz3m','blitz5m','rapid10m','rapid15m','rapid30m') THEN
    RAISE EXCEPTION 'Invalid time control';
  END IF;

  UPDATE public.matchmaking_queue
  SET status = 'cancelled', updated_at = now()
  WHERE user_id = uid AND status = 'waiting';

  IF _variant = 'chess960' THEN
    SELECT rating INTO my_rating FROM public.user_variant_ratings
    WHERE user_id = uid AND pool = 'chess960';
    my_rating := COALESCE(my_rating, 1200);
  ELSE
    SELECT COALESCE(rating, 1200) INTO my_rating FROM public.profiles WHERE id = uid;
  END IF;

  INSERT INTO public.matchmaking_queue (user_id, rating, variant, time_control, status)
  VALUES (uid, COALESCE(my_rating, 1200), _variant, _time_control, 'waiting')
  RETURNING * INTO entry;

  RETURN entry;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_join(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_join(text, text) TO authenticated, service_role;