REVOKE EXECUTE ON FUNCTION public.apply_glicko2(UUID) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.find_match(UUID) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.glicko2_update(NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_ratings_after_game(UUID) FROM anon, authenticated;