CREATE OR REPLACE FUNCTION public.create_ai_match(
  _queue_id uuid,
  _user_id uuid,
  _initial_fen text,
  _white_is_requester boolean,
  _min_wait_ms integer DEFAULT 3000
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  me public.matchmaking_queue%ROWTYPE;
  chosen public.ai_players%ROWTYPE;
  ai_rating integer;
  new_game_id uuid;
  white_player uuid; black_player uuid;
  white_player_rating integer; black_player_rating integer;
  spec jsonb; initial_ms integer; changed_rows integer;
  standard_fen text := 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO me FROM public.matchmaking_queue WHERE id = _queue_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF me.user_id <> _user_id THEN
    PERFORM public.log_security_event('rpc_denied','create_ai_match','execute','not_owner',
      'Caller tried to run AI matchmaking for another user queue entry');
    RAISE EXCEPTION 'Not your queue entry';
  END IF;
  IF me.status = 'matched' THEN RETURN me.matched_game_id; END IF;
  IF me.status <> 'waiting' THEN RETURN NULL; END IF;
  IF me.updated_at < now() - interval '20 seconds' THEN RETURN NULL; END IF;

  -- Human-first: never assign an AI before the grace period has elapsed.
  IF extract(epoch FROM (now() - me.created_at)) * 1000 < GREATEST(0, COALESCE(_min_wait_ms, 3000)) THEN
    RETURN NULL;
  END IF;

  IF me.variant NOT IN ('standard','chess960') THEN RETURN NULL; END IF;
  IF me.variant = 'standard' AND _initial_fen <> standard_fen THEN RAISE EXCEPTION 'Invalid starting position'; END IF;
  IF char_length(_initial_fen) < 10 OR char_length(_initial_fen) > 120 THEN RAISE EXCEPTION 'Invalid starting position'; END IF;

  spec := public.tc_spec(me.time_control);
  IF NOT COALESCE((spec->>'valid')::boolean, false) THEN RAISE EXCEPTION 'Invalid time control'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('nine64_ai_pool')::integer, hashtext(me.variant)::integer);

  SELECT a.* INTO chosen
  FROM public.ai_players a
  JOIN public.profiles p ON p.id = a.profile_id
  WHERE a.enabled
    AND ((me.variant = 'standard' AND a.standard_enabled) OR (me.variant = 'chess960' AND a.chess960_enabled))
    AND a.profile_id <> me.user_id
    AND (
      SELECT count(*) FROM public.games g
      WHERE g.status = 'active' AND a.profile_id IN (g.white_id, g.black_id)
    ) < a.max_concurrent_games
  ORDER BY abs(a.base_target_rating - me.rating) ASC,
           COALESCE(a.last_assigned_at, 'epoch'::timestamptz) ASC
  LIMIT 1
  FOR UPDATE OF a SKIP LOCKED;

  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(p.rating, chosen.base_target_rating) INTO ai_rating
  FROM public.profiles p WHERE p.id = chosen.profile_id;

  IF _white_is_requester THEN
    white_player := me.user_id; black_player := chosen.profile_id;
    white_player_rating := me.rating; black_player_rating := ai_rating;
  ELSE
    white_player := chosen.profile_id; black_player := me.user_id;
    white_player_rating := ai_rating; black_player_rating := me.rating;
  END IF;

  initial_ms := GREATEST(1000, (spec->>'base_ms')::integer);

  INSERT INTO public.games (
    white_id, black_id, white_rating, black_rating, variant, time_control,
    status, initial_fen, current_fen, white_time_ms, black_time_ms, rated, spectate,
    ai_game, ai_profile_id)
  VALUES (
    white_player, black_player, white_player_rating, black_player_rating,
    me.variant, me.time_control, 'active', _initial_fen, _initial_fen,
    initial_ms, initial_ms, true, 'private',
    true, chosen.profile_id)
  RETURNING id INTO new_game_id;

  UPDATE public.matchmaking_queue
  SET status = 'matched', matched_game_id = new_game_id, updated_at = now()
  WHERE id = me.id AND status = 'waiting';

  GET DIAGNOSTICS changed_rows = ROW_COUNT;
  IF changed_rows <> 1 THEN RAISE EXCEPTION 'Match race detected'; END IF;

  UPDATE public.ai_players SET last_assigned_at = now(), updated_at = now() WHERE ai_key = chosen.ai_key;

  -- If the AI has the first move, queue its turn immediately.
  IF white_player = chosen.profile_id THEN
    INSERT INTO public.ai_move_jobs (game_id, expected_version, status)
    VALUES (new_game_id, 0, 'queued')
    ON CONFLICT (game_id, expected_version) DO NOTHING;
  END IF;

  RETURN new_game_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_ai_match(uuid, uuid, text, boolean, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_ai_match(uuid, uuid, text, boolean, integer) TO service_role;