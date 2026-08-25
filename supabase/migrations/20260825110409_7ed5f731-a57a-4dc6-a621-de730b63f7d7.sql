CREATE OR REPLACE FUNCTION public.find_match(_queue_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me public.matchmaking_queue%ROWTYPE;
  my_rd NUMERIC;
  wait_sec NUMERIC;
  window_size NUMERIC;
  best uuid;
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO me FROM public.matchmaking_queue WHERE id = _queue_id AND status = 'waiting';
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Callers may only run matchmaking for their own queue entry.
  IF me.user_id <> uid THEN
    RAISE EXCEPTION 'Not your queue entry';
  END IF;

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
$function$;

REVOKE ALL ON FUNCTION public.find_match(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.commit_move(uuid, text, text, text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_match(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.commit_move(uuid, text, text, text, text, integer, integer) TO authenticated, service_role;