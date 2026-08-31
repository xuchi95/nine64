CREATE OR REPLACE FUNCTION public.puzzle_catalog_record_attempt(_puzzle_id text, _solved boolean)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.puzzle_catalog
     SET attempts = attempts + 1,
         solved = solved + CASE WHEN _solved THEN 1 ELSE 0 END,
         popularity = popularity + 1,
         updated_at = now()
   WHERE id = _puzzle_id;
$$;

REVOKE ALL ON FUNCTION public.puzzle_catalog_record_attempt(text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.puzzle_catalog_record_attempt(text, boolean) TO service_role;