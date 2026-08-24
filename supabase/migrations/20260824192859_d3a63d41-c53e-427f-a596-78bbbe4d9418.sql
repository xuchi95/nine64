CREATE OR REPLACE FUNCTION public.apply_glicko2(_game_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g record;
  w record;
  b record;
  w_new jsonb;
  b_new jsonb;
  w_score numeric;
  b_score numeric;
  locked boolean;
BEGIN
  SELECT * INTO g FROM public.games WHERE id = _game_id;
  IF g IS NULL OR g.status <> 'completed' OR g.result = '*' THEN
    RETURN;
  END IF;

  IF COALESCE(g.rated, true) = false THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.fairplay_status s
    WHERE s.user_id IN (g.white_id, g.black_id) AND s.rating_locked
  ) INTO locked;
  IF locked THEN
    UPDATE public.games SET rated = false WHERE id = _game_id;
    RETURN;
  END IF;

  SELECT rating, rating_deviation, volatility, peak_rating INTO w
  FROM public.profiles WHERE id = g.white_id FOR UPDATE;
  SELECT rating, rating_deviation, volatility, peak_rating INTO b
  FROM public.profiles WHERE id = g.black_id FOR UPDATE;
  IF w IS NULL OR b IS NULL THEN
    RETURN;
  END IF;

  w_score := CASE g.result WHEN '1-0' THEN 1 WHEN '0-1' THEN 0 ELSE 0.5 END;
  b_score := 1 - w_score;

  w_new := public.glicko2_update(w.rating, w.rating_deviation, w.volatility, b.rating, b.rating_deviation, w_score);
  b_new := public.glicko2_update(b.rating, b.rating_deviation, b.volatility, w.rating, w.rating_deviation, b_score);

  UPDATE public.profiles SET
    rating = ROUND((w_new->>'rating')::numeric),
    rating_deviation = (w_new->>'rd')::numeric,
    volatility = (w_new->>'sigma')::numeric,
    peak_rating = GREATEST(peak_rating, ROUND((w_new->>'rating')::numeric)),
    last_rated_at = now(),
    updated_at = now()
  WHERE id = g.white_id;

  UPDATE public.profiles SET
    rating = ROUND((b_new->>'rating')::numeric),
    rating_deviation = (b_new->>'rd')::numeric,
    volatility = (b_new->>'sigma')::numeric,
    peak_rating = GREATEST(peak_rating, ROUND((b_new->>'rating')::numeric)),
    last_rated_at = now(),
    updated_at = now()
  WHERE id = g.black_id;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_glicko2(uuid) FROM anon;