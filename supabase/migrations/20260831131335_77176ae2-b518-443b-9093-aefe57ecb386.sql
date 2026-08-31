REVOKE ALL ON FUNCTION public.list_public_games(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.list_public_games(integer) TO authenticated, service_role;