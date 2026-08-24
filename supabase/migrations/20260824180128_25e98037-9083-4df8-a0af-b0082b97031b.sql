-- 1. Glicko-2 fields on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS rating_deviation NUMERIC NOT NULL DEFAULT 350,
  ADD COLUMN IF NOT EXISTS volatility NUMERIC NOT NULL DEFAULT 0.06,
  ADD COLUMN IF NOT EXISTS peak_rating INTEGER NOT NULL DEFAULT 1200,
  ADD COLUMN IF NOT EXISTS last_rated_at TIMESTAMPTZ;

-- 2. Core Glicko-2 single-game update, returns new (rating, rd, volatility)
CREATE OR REPLACE FUNCTION public.glicko2_update(
  _rating NUMERIC, _rd NUMERIC, _sigma NUMERIC,
  _opp_rating NUMERIC, _opp_rd NUMERIC, _score NUMERIC
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  q CONSTANT NUMERIC := 173.7178;
  tau CONSTANT NUMERIC := 0.5;
  mu NUMERIC; phi NUMERIC; mu_j NUMERIC; phi_j NUMERIC;
  g_j NUMERIC; e_j NUMERIC; vv NUMERIC; v_inv NUMERIC; dlt NUMERIC;
  anchor NUMERIC; lo NUMERIC; hi NUMERIC; mid NUMERIC;
  f_lo NUMERIC; f_hi NUMERIC; f_mid NUMERIC;
  k INTEGER := 1; guard INTEGER := 0;
  sigma_p NUMERIC; phi_star NUMERIC; phi_p NUMERIC; mu_p NUMERIC;
BEGIN
  mu := (_rating - 1200) / q;
  phi := _rd / q;
  mu_j := (_opp_rating - 1200) / q;
  phi_j := _opp_rd / q;

  g_j := 1 / sqrt(1 + 3 * phi_j * phi_j / (pi() * pi()));
  e_j := 1 / (1 + exp(-g_j * (mu - mu_j)));
  v_inv := g_j * g_j * e_j * (1 - e_j);
  IF v_inv <= 0 THEN v_inv := 1e-9; END IF;
  vv := 1 / v_inv;
  dlt := vv * g_j * (_score - e_j);

  anchor := ln(_sigma * _sigma);
  lo := anchor;
  IF dlt * dlt > phi * phi + vv THEN
    hi := ln(dlt * dlt - phi * phi - vv);
  ELSE
    LOOP
      hi := anchor - k * tau;
      EXIT WHEN (exp(hi) * (dlt*dlt - phi*phi - vv - exp(hi)) / (2 * power(phi*phi + vv + exp(hi), 2)) - (hi - anchor) / (tau*tau)) >= 0 OR k > 60;
      k := k + 1;
    END LOOP;
  END IF;

  f_lo := exp(lo) * (dlt*dlt - phi*phi - vv - exp(lo)) / (2 * power(phi*phi + vv + exp(lo), 2)) - (lo - anchor) / (tau*tau);
  f_hi := exp(hi) * (dlt*dlt - phi*phi - vv - exp(hi)) / (2 * power(phi*phi + vv + exp(hi), 2)) - (hi - anchor) / (tau*tau);

  WHILE abs(hi - lo) > 0.000001 AND guard < 100 LOOP
    IF f_hi = f_lo THEN EXIT; END IF;
    mid := lo + (lo - hi) * f_lo / (f_hi - f_lo);
    f_mid := exp(mid) * (dlt*dlt - phi*phi - vv - exp(mid)) / (2 * power(phi*phi + vv + exp(mid), 2)) - (mid - anchor) / (tau*tau);
    IF f_mid * f_hi <= 0 THEN
      lo := hi; f_lo := f_hi;
    ELSE
      f_lo := f_lo / 2;
    END IF;
    hi := mid; f_hi := f_mid;
    guard := guard + 1;
  END LOOP;

  sigma_p := exp(lo / 2);
  phi_star := sqrt(phi * phi + sigma_p * sigma_p);
  phi_p := 1 / sqrt(1 / (phi_star * phi_star) + v_inv);
  mu_p := mu + phi_p * phi_p * g_j * (_score - e_j);

  RETURN jsonb_build_object(
    'rating', round((mu_p * q + 1200)::numeric, 2),
    'rd', round(least(350, phi_p * q)::numeric, 2),
    'volatility', round(sigma_p::numeric, 6)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.glicko2_update(NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.glicko2_update(NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC) TO authenticated, service_role;

-- 3. Apply Glicko-2 after a finished game (replaces fixed-K Elo)
CREATE OR REPLACE FUNCTION public.apply_glicko2(_game_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g public.games%ROWTYPE;
  wp public.profiles%ROWTYPE;
  bp public.profiles%ROWTYPE;
  w_score NUMERIC; b_score NUMERIC;
  w_new jsonb; b_new jsonb;
BEGIN
  SELECT * INTO g FROM public.games WHERE id = _game_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;
  IF g.result = '*' THEN RETURN; END IF;

  SELECT * INTO wp FROM public.profiles WHERE id = g.white_id;
  SELECT * INTO bp FROM public.profiles WHERE id = g.black_id;
  IF wp.id IS NULL OR bp.id IS NULL THEN RETURN; END IF;

  w_score := CASE g.result WHEN '1-0' THEN 1 WHEN '0-1' THEN 0 ELSE 0.5 END;
  b_score := 1 - w_score;

  w_new := public.glicko2_update(wp.rating, wp.rating_deviation, wp.volatility, bp.rating, bp.rating_deviation, w_score);
  b_new := public.glicko2_update(bp.rating, bp.rating_deviation, bp.volatility, wp.rating, wp.rating_deviation, b_score);

  UPDATE public.profiles SET
    rating = round((w_new->>'rating')::numeric),
    rating_deviation = (w_new->>'rd')::numeric,
    volatility = (w_new->>'volatility')::numeric,
    peak_rating = greatest(peak_rating, round((w_new->>'rating')::numeric)::int),
    games_played = games_played + 1,
    wins = wins + CASE WHEN w_score = 1 THEN 1 ELSE 0 END,
    losses = losses + CASE WHEN w_score = 0 THEN 1 ELSE 0 END,
    draws = draws + CASE WHEN w_score = 0.5 THEN 1 ELSE 0 END,
    last_rated_at = now(),
    updated_at = now()
  WHERE id = g.white_id;

  UPDATE public.profiles SET
    rating = round((b_new->>'rating')::numeric),
    rating_deviation = (b_new->>'rd')::numeric,
    volatility = (b_new->>'volatility')::numeric,
    peak_rating = greatest(peak_rating, round((b_new->>'rating')::numeric)::int),
    games_played = games_played + 1,
    wins = wins + CASE WHEN b_score = 1 THEN 1 ELSE 0 END,
    losses = losses + CASE WHEN b_score = 0 THEN 1 ELSE 0 END,
    draws = draws + CASE WHEN b_score = 0.5 THEN 1 ELSE 0 END,
    last_rated_at = now(),
    updated_at = now()
  WHERE id = g.black_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_glicko2(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_glicko2(UUID) TO authenticated, service_role;

-- 4. Priority-scored matchmaking
CREATE OR REPLACE FUNCTION public.find_match(_queue_id UUID)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me public.matchmaking_queue%ROWTYPE;
  my_rd NUMERIC;
  wait_sec NUMERIC;
  window_size NUMERIC;
  best uuid;
BEGIN
  SELECT * INTO me FROM public.matchmaking_queue WHERE id = _queue_id AND status = 'waiting';
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT coalesce(rating_deviation, 350) INTO my_rd FROM public.profiles WHERE id = me.user_id;
  wait_sec := extract(epoch FROM (now() - me.created_at));
  window_size := least(400, 80 + floor(wait_sec / 5) * 40);

  SELECT q.id INTO best
  FROM public.matchmaking_queue q
  JOIN public.profiles p ON p.id = q.user_id
  WHERE q.status = 'waiting'
    AND q.user_id <> me.user_id
    AND q.variant = me.variant
    AND q.time_control = me.time_control
    AND abs(q.rating - me.rating) <= window_size
    AND NOT EXISTS (
      SELECT 1 FROM (
        SELECT gg.white_id, gg.black_id FROM public.games gg
        WHERE me.user_id IN (gg.white_id, gg.black_id)
        ORDER BY gg.created_at DESC LIMIT 2
      ) recent
      WHERE q.user_id IN (recent.white_id, recent.black_id)
    )
  ORDER BY
    abs(q.rating - me.rating) * 1.0
    + abs(coalesce(p.rating_deviation, 350) - my_rd) * 0.25
    - extract(epoch FROM (now() - q.created_at)) * 2.0
  LIMIT 1;

  RETURN best;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.find_match(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_match(UUID) TO authenticated, service_role;

-- 5. Puzzles generated from the player's own games
CREATE TABLE IF NOT EXISTS public.puzzles (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fen TEXT NOT NULL,
  solution TEXT NOT NULL,
  solution_san TEXT,
  color TEXT NOT NULL DEFAULT 'w',
  themes JSONB NOT NULL DEFAULT '[]'::jsonb,
  rating INTEGER NOT NULL DEFAULT 1200,
  source_game_id TEXT,
  ply INTEGER NOT NULL DEFAULT 0,
  swing NUMERIC NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  solved INTEGER NOT NULL DEFAULT 0,
  srs JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.puzzles TO authenticated;
GRANT ALL ON public.puzzles TO service_role;
ALTER TABLE public.puzzles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own puzzles"
ON public.puzzles FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS puzzles_user_idx ON public.puzzles(user_id, created_at DESC);

CREATE TRIGGER puzzles_set_updated_at
BEFORE UPDATE ON public.puzzles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. Attempt log
CREATE TABLE IF NOT EXISTS public.puzzle_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  puzzle_id TEXT NOT NULL,
  grade SMALLINT NOT NULL,
  solved BOOLEAN NOT NULL DEFAULT false,
  time_ms INTEGER,
  rating_before NUMERIC,
  rating_after NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.puzzle_attempts TO authenticated;
GRANT ALL ON public.puzzle_attempts TO service_role;
ALTER TABLE public.puzzle_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own attempts"
ON public.puzzle_attempts FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users log their own attempts"
ON public.puzzle_attempts FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

-- 7. Fair-play signals per game (admin-visible only)
CREATE TABLE IF NOT EXISTS public.game_fairplay (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  engine_match NUMERIC NOT NULL DEFAULT 0,
  hard_move_match NUMERIC NOT NULL DEFAULT 0,
  time_cv NUMERIC NOT NULL DEFAULT 0,
  hard_accuracy NUMERIC NOT NULL DEFAULT 0,
  suspicion NUMERIC NOT NULL DEFAULT 0,
  flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (game_id, user_id)
);

GRANT SELECT ON public.game_fairplay TO authenticated;
GRANT ALL ON public.game_fairplay TO service_role;
ALTER TABLE public.game_fairplay ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins read fairplay reports"
ON public.game_fairplay FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));