CREATE OR REPLACE FUNCTION public.update_ratings_after_game(_game_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g public.games%ROWTYPE;
  white_profile public.profiles%ROWTYPE;
  black_profile public.profiles%ROWTYPE;
  k_white INTEGER := 32;
  k_black INTEGER := 32;
  expected_white NUMERIC;
  expected_black NUMERIC;
  actual_white NUMERIC;
  actual_black NUMERIC;
  new_white_rating INTEGER;
  new_black_rating INTEGER;
BEGIN
  SELECT * INTO g FROM public.games WHERE id = _game_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found';
  END IF;

  SELECT * INTO white_profile FROM public.profiles WHERE id = g.white_id;
  SELECT * INTO black_profile FROM public.profiles WHERE id = g.black_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player profile not found';
  END IF;

  -- Lower K for higher-rated / more experienced players
  IF white_profile.games_played >= 30 THEN
    k_white := 24;
  END IF;
  IF white_profile.rating >= 2400 THEN
    k_white := 16;
  END IF;

  IF black_profile.games_played >= 30 THEN
    k_black := 24;
  END IF;
  IF black_profile.rating >= 2400 THEN
    k_black := 16;
  END IF;

  expected_white := 1 / (1 + 10 ^ ((black_profile.rating - white_profile.rating) / 400.0));
  expected_black := 1 / (1 + 10 ^ ((white_profile.rating - black_profile.rating) / 400.0));

  IF g.result = '1-0' THEN
    actual_white := 1;
    actual_black := 0;
  ELSIF g.result = '0-1' THEN
    actual_white := 0;
    actual_black := 1;
  ELSE
    actual_white := 0.5;
    actual_black := 0.5;
  END IF;

  new_white_rating := ROUND(white_profile.rating + k_white * (actual_white - expected_white));
  new_black_rating := ROUND(black_profile.rating + k_black * (actual_black - expected_black));

  UPDATE public.profiles
  SET
    rating = new_white_rating,
    games_played = games_played + 1,
    wins = wins + CASE WHEN g.result = '1-0' THEN 1 ELSE 0 END,
    losses = losses + CASE WHEN g.result = '0-1' THEN 1 ELSE 0 END,
    draws = draws + CASE WHEN g.result = '1/2-1/2' THEN 1 ELSE 0 END,
    updated_at = now()
  WHERE id = g.white_id;

  UPDATE public.profiles
  SET
    rating = new_black_rating,
    games_played = games_played + 1,
    wins = wins + CASE WHEN g.result = '0-1' THEN 1 ELSE 0 END,
    losses = losses + CASE WHEN g.result = '1-0' THEN 1 ELSE 0 END,
    draws = draws + CASE WHEN g.result = '1/2-1/2' THEN 1 ELSE 0 END,
    updated_at = now()
  WHERE id = g.black_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_ratings_after_game(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_ratings_after_game(UUID) TO service_role;
REVOKE EXECUTE ON FUNCTION public.update_ratings_after_game(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_ratings_after_game(UUID) FROM anon;
