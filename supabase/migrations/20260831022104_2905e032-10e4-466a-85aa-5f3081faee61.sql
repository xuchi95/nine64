-- 1) Ledger table
CREATE TABLE IF NOT EXISTS public.rating_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL UNIQUE REFERENCES public.games(id) ON DELETE CASCADE,
  white_id uuid NOT NULL,
  black_id uuid NOT NULL,
  result text NOT NULL,
  white_rating_before integer NOT NULL,
  white_rd_before numeric NOT NULL,
  white_volatility_before numeric NOT NULL,
  white_rating_after integer NOT NULL,
  white_rd_after numeric NOT NULL,
  white_volatility_after numeric NOT NULL,
  white_delta integer NOT NULL,
  black_rating_before integer NOT NULL,
  black_rd_before numeric NOT NULL,
  black_volatility_before numeric NOT NULL,
  black_rating_after integer NOT NULL,
  black_rd_after numeric NOT NULL,
  black_volatility_after numeric NOT NULL,
  black_delta integer NOT NULL,
  algorithm text NOT NULL DEFAULT 'glicko2',
  algorithm_version integer NOT NULL DEFAULT 1,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS rating_events_idempotency_key_idx
  ON public.rating_events (idempotency_key);
CREATE INDEX IF NOT EXISTS rating_events_white_idx ON public.rating_events (white_id, created_at DESC);
CREATE INDEX IF NOT EXISTS rating_events_black_idx ON public.rating_events (black_id, created_at DESC);

GRANT SELECT ON public.rating_events TO authenticated;
GRANT ALL ON public.rating_events TO service_role;

ALTER TABLE public.rating_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants can read rating events" ON public.rating_events;
CREATE POLICY "Participants can read rating events"
ON public.rating_events FOR SELECT TO authenticated
USING (auth.uid() = white_id OR auth.uid() = black_id OR public.has_role(auth.uid(), 'admin'));

-- 2) Marker on games
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS rating_applied_at timestamptz;

-- 3) Single idempotent rating orchestration
CREATE OR REPLACE FUNCTION public.apply_rating_once(_game_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  g public.games%ROWTYPE;
  existing public.rating_events%ROWTYPE;
  first_id uuid;
  second_id uuid;
  w public.profiles%ROWTYPE;
  b public.profiles%ROWTYPE;
  w_new jsonb;
  b_new jsonb;
  w_score numeric;
  b_score numeric;
  w_after integer;
  b_after integer;
  locked boolean;
  ev public.rating_events%ROWTYPE;
BEGIN
  IF _game_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT');
  END IF;

  -- Fast path: ledger already exists -> return canonical prior result.
  SELECT * INTO existing FROM public.rating_events WHERE game_id = _game_id;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'code', 'ALREADY_APPLIED', 'event', to_jsonb(existing));
  END IF;

  SELECT * INTO g FROM public.games WHERE id = _game_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND');
  END IF;

  -- Re-check under the row lock (a concurrent tx may have just applied it).
  SELECT * INTO existing FROM public.rating_events WHERE game_id = _game_id;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'code', 'ALREADY_APPLIED', 'event', to_jsonb(existing));
  END IF;

  IF g.status <> 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_COMPLETED');
  END IF;
  IF COALESCE(g.rated, true) = false THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_RATED');
  END IF;
  IF g.result NOT IN ('1-0', '0-1', '1/2-1/2') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_DECISIVE_RESULT');
  END IF;
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

  -- Deterministic lock order by UUID to avoid deadlocks.
  first_id := LEAST(g.white_id, g.black_id);
  second_id := GREATEST(g.white_id, g.black_id);
  PERFORM 1 FROM public.profiles WHERE id = first_id FOR UPDATE;
  PERFORM 1 FROM public.profiles WHERE id = second_id FOR UPDATE;

  SELECT * INTO w FROM public.profiles WHERE id = g.white_id;
  SELECT * INTO b FROM public.profiles WHERE id = g.black_id;
  IF w.id IS NULL OR b.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PROFILE_NOT_FOUND');
  END IF;

  w_score := CASE g.result WHEN '1-0' THEN 1 WHEN '0-1' THEN 0 ELSE 0.5 END;
  b_score := 1 - w_score;

  w_new := public.glicko2_update(w.rating, w.rating_deviation, w.volatility, b.rating, b.rating_deviation, w_score);
  b_new := public.glicko2_update(b.rating, b.rating_deviation, b.volatility, w.rating, w.rating_deviation, b_score);

  w_after := ROUND((w_new->>'rating')::numeric);
  b_after := ROUND((b_new->>'rating')::numeric);

  UPDATE public.profiles SET
    rating = w_after,
    rating_deviation = (w_new->>'rd')::numeric,
    volatility = (w_new->>'volatility')::numeric,
    peak_rating = GREATEST(peak_rating, w_after),
    games_played = games_played + 1,
    wins = wins + CASE WHEN g.result = '1-0' THEN 1 ELSE 0 END,
    losses = losses + CASE WHEN g.result = '0-1' THEN 1 ELSE 0 END,
    draws = draws + CASE WHEN g.result = '1/2-1/2' THEN 1 ELSE 0 END,
    last_rated_at = now(),
    updated_at = now()
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
    last_rated_at = now(),
    updated_at = now()
  WHERE id = g.black_id;

  INSERT INTO public.rating_events (
    game_id, white_id, black_id, result,
    white_rating_before, white_rd_before, white_volatility_before,
    white_rating_after, white_rd_after, white_volatility_after, white_delta,
    black_rating_before, black_rd_before, black_volatility_before,
    black_rating_after, black_rd_after, black_volatility_after, black_delta,
    algorithm, algorithm_version, idempotency_key
  ) VALUES (
    g.id, g.white_id, g.black_id, g.result,
    w.rating, w.rating_deviation, w.volatility,
    w_after, (w_new->>'rd')::numeric, (w_new->>'volatility')::numeric, w_after - w.rating,
    b.rating, b.rating_deviation, b.volatility,
    b_after, (b_new->>'rd')::numeric, (b_new->>'volatility')::numeric, b_after - b.rating,
    'glicko2', 1, 'rating:' || g.id::text || ':v1'
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

-- 4) Single orchestration path: legacy entry point delegates and stays idempotent.
CREATE OR REPLACE FUNCTION public.apply_glicko2(_game_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.apply_rating_once(_game_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_glicko2(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_glicko2(uuid) TO service_role;

-- 5) Backfill marker for games already rated before the ledger existed, so the
-- ledger does not double-apply historical completed games.
INSERT INTO public.rating_events (
  game_id, white_id, black_id, result,
  white_rating_before, white_rd_before, white_volatility_before,
  white_rating_after, white_rd_after, white_volatility_after, white_delta,
  black_rating_before, black_rd_before, black_volatility_before,
  black_rating_after, black_rd_after, black_volatility_after, black_delta,
  algorithm, algorithm_version, idempotency_key, created_at
)
SELECT g.id, g.white_id, g.black_id, g.result,
       g.white_rating, 350, 0.06, g.white_rating, 350, 0.06, 0,
       g.black_rating, 350, 0.06, g.black_rating, 350, 0.06, 0,
       'legacy', 0, 'rating:' || g.id::text || ':v1', COALESCE(g.updated_at, now())
FROM public.games g
WHERE g.status = 'completed'
  AND g.result IN ('1-0','0-1','1/2-1/2')
  AND g.white_id <> g.black_id
ON CONFLICT (game_id) DO NOTHING;

UPDATE public.games g
SET rating_applied_at = COALESCE(g.rating_applied_at, e.created_at)
FROM public.rating_events e
WHERE e.game_id = g.id AND g.rating_applied_at IS NULL;