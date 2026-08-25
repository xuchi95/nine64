CREATE OR REPLACE FUNCTION public.create_online_match(
  _queue_id uuid,
  _user_id uuid,
  _initial_fen text,
  _white_is_requester boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  me public.matchmaking_queue%ROWTYPE;
  candidate public.matchmaking_queue%ROWTYPE;
  opponent public.matchmaking_queue%ROWTYPE;
  my_rd NUMERIC;
  wait_sec NUMERIC;
  window_size NUMERIC;
  new_game_id uuid;
  white_player uuid;
  black_player uuid;
  white_player_rating integer;
  black_player_rating integer;
  initial_ms integer;
  changed_rows integer;
  standard_fen text := 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
BEGIN
  IF _user_id IS NULL THEN
    PERFORM public.log_security_event('rpc_denied', 'create_online_match', 'execute', 'no_session', 'Unauthenticated matchmaking call');
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Read first without a row lock so simultaneous callers do not each hold
  -- their own queue row while waiting for the same pool lock.
  SELECT * INTO candidate
  FROM public.matchmaking_queue
  WHERE id = _queue_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF candidate.user_id <> _user_id THEN
    PERFORM public.log_security_event(
      'rpc_denied',
      'create_online_match',
      'execute',
      'not_owner',
      'Caller tried to run matchmaking for another user queue entry',
      NULL,
      NULL,
      jsonb_build_object('queue_id', _queue_id, 'owner_id', candidate.user_id, 'caller_id', _user_id)
    );
    RAISE EXCEPTION 'Not your queue entry';
  END IF;

  -- Serialize one matcher per variant + time-control pool. This prevents the
  -- synchronized polling deadlock/race where both accounts see each other but
  -- neither can safely create the game.
  PERFORM pg_advisory_xact_lock(
    hashtext('nine64_match_pool')::integer,
    hashtext(candidate.variant || ':' || candidate.time_control)::integer
  );

  SELECT * INTO me
  FROM public.matchmaking_queue
  WHERE id = _queue_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF me.user_id <> _user_id THEN
    PERFORM public.log_security_event(
      'rpc_denied',
      'create_online_match',
      'execute',
      'not_owner_after_lock',
      'Queue owner changed before matchmaking lock completed',
      NULL,
      NULL,
      jsonb_build_object('queue_id', _queue_id, 'owner_id', me.user_id, 'caller_id', _user_id)
    );
    RAISE EXCEPTION 'Not your queue entry';
  END IF;

  IF me.status = 'matched' THEN
    RETURN me.matched_game_id;
  END IF;

  IF me.status <> 'waiting' THEN
    RETURN NULL;
  END IF;

  IF me.variant = 'standard' AND _initial_fen <> standard_fen THEN
    RAISE EXCEPTION 'Invalid starting position';
  END IF;

  IF char_length(_initial_fen) < 10 OR char_length(_initial_fen) > 120 THEN
    RAISE EXCEPTION 'Invalid starting position';
  END IF;

  SELECT coalesce(rating_deviation, 350) INTO my_rd
  FROM public.profiles
  WHERE id = me.user_id;

  wait_sec := extract(epoch FROM (now() - me.created_at));
  window_size := least(800, 120 + floor(wait_sec / 3) * 80);

  SELECT q.* INTO opponent
  FROM public.matchmaking_queue q
  JOIN public.profiles p ON p.id = q.user_id
  WHERE q.status = 'waiting'
    AND q.id <> me.id
    AND q.user_id <> me.user_id
    AND q.variant = me.variant
    AND q.time_control = me.time_control
    AND abs(q.rating - me.rating) <= window_size
  ORDER BY
    CASE WHEN EXISTS (
      SELECT 1 FROM (
        SELECT gg.white_id, gg.black_id
        FROM public.games gg
        WHERE me.user_id IN (gg.white_id, gg.black_id)
        ORDER BY gg.created_at DESC
        LIMIT 2
      ) recent
      WHERE q.user_id IN (recent.white_id, recent.black_id)
    ) THEN 250 ELSE 0 END
    + abs(q.rating - me.rating) * 1.0
    + abs(coalesce(p.rating_deviation, 350) - coalesce(my_rd, 350)) * 0.25
    - extract(epoch FROM (now() - q.created_at)) * 2.0,
    q.created_at ASC
  LIMIT 1
  FOR UPDATE OF q;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF _white_is_requester THEN
    white_player := me.user_id;
    black_player := opponent.user_id;
    white_player_rating := me.rating;
    black_player_rating := opponent.rating;
  ELSE
    white_player := opponent.user_id;
    black_player := me.user_id;
    white_player_rating := opponent.rating;
    black_player_rating := me.rating;
  END IF;

  initial_ms := CASE me.time_control
    WHEN 'blitz1m' THEN 60000
    WHEN 'blitz3m' THEN 180000
    WHEN 'blitz5m' THEN 300000
    WHEN 'rapid10m' THEN 600000
    WHEN 'rapid15m' THEN 900000
    WHEN 'rapid30m' THEN 1800000
    ELSE 300000
  END;

  INSERT INTO public.games (
    white_id,
    black_id,
    white_rating,
    black_rating,
    variant,
    time_control,
    status,
    initial_fen,
    current_fen,
    white_time_ms,
    black_time_ms
  ) VALUES (
    white_player,
    black_player,
    white_player_rating,
    black_player_rating,
    me.variant,
    me.time_control,
    'active',
    _initial_fen,
    _initial_fen,
    initial_ms,
    initial_ms
  )
  RETURNING id INTO new_game_id;

  UPDATE public.matchmaking_queue
  SET status = 'matched', matched_game_id = new_game_id, updated_at = now()
  WHERE id IN (me.id, opponent.id)
    AND status = 'waiting';

  GET DIAGNOSTICS changed_rows = ROW_COUNT;
  IF changed_rows <> 2 THEN
    RAISE EXCEPTION 'Match race detected';
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES
    (me.user_id, 'match_found', 'Match found', 'Your game is ready.', jsonb_build_object('game_id', new_game_id)),
    (opponent.user_id, 'match_found', 'Match found', 'Your game is ready.', jsonb_build_object('game_id', new_game_id));

  RETURN new_game_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_online_match(uuid, uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_online_match(uuid, uuid, text, boolean) TO service_role;