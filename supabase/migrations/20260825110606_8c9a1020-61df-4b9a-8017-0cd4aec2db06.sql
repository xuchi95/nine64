-- 1. Event store
CREATE TABLE public.security_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind text NOT NULL,
  resource text,
  operation text,
  error_code text,
  message text,
  path text,
  user_agent text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.security_events TO authenticated;
GRANT ALL ON public.security_events TO service_role;

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read security events"
  ON public.security_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX security_events_created_idx ON public.security_events (created_at DESC);
CREATE INDEX security_events_user_created_idx ON public.security_events (user_id, created_at DESC);

-- 2. Write path: security definer, caller identity is derived server-side, rate capped.
CREATE OR REPLACE FUNCTION public.log_security_event(
  _kind text,
  _resource text DEFAULT NULL,
  _operation text DEFAULT NULL,
  _error_code text DEFAULT NULL,
  _message text DEFAULT NULL,
  _path text DEFAULT NULL,
  _user_agent text DEFAULT NULL,
  _detail jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  recent integer;
BEGIN
  IF _kind IS NULL OR length(_kind) = 0 OR length(_kind) > 64 THEN
    RETURN;
  END IF;

  -- Flood guard: never let a client fill the table.
  SELECT count(*) INTO recent
  FROM public.security_events e
  WHERE e.created_at > now() - interval '1 hour'
    AND (
      (uid IS NOT NULL AND e.user_id = uid)
      OR (uid IS NULL AND e.user_id IS NULL)
    );
  IF recent >= 120 THEN
    RETURN;
  END IF;

  INSERT INTO public.security_events (
    user_id, kind, resource, operation, error_code, message, path, user_agent, detail
  ) VALUES (
    uid,
    left(_kind, 64),
    left(_resource, 128),
    left(_operation, 32),
    left(_error_code, 32),
    left(_message, 500),
    left(_path, 300),
    left(_user_agent, 300),
    COALESCE(_detail, '{}'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.log_security_event(text, text, text, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_security_event(text, text, text, text, text, text, text, jsonb) TO anon, authenticated, service_role;

-- 3. Alert aggregation (admin only)
CREATE OR REPLACE FUNCTION public.security_probe_alerts(
  _window_minutes integer DEFAULT 60,
  _threshold integer DEFAULT 5
)
RETURNS TABLE (
  user_id uuid,
  events integer,
  resources integer,
  kinds text[],
  first_seen timestamptz,
  last_seen timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT e.user_id,
         count(*)::int AS events,
         count(DISTINCT e.resource)::int AS resources,
         array_agg(DISTINCT e.kind) AS kinds,
         min(e.created_at) AS first_seen,
         max(e.created_at) AS last_seen
  FROM public.security_events e
  WHERE public.has_role(auth.uid(), 'admin')
    AND e.created_at > now() - make_interval(mins => greatest(1, least(_window_minutes, 10080)))
  GROUP BY e.user_id
  HAVING count(*) >= greatest(2, _threshold)
  ORDER BY count(*) DESC;
$function$;

REVOKE ALL ON FUNCTION public.security_probe_alerts(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.security_probe_alerts(integer, integer) TO authenticated, service_role;

-- 4. Server-side gateways record their own denials.
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
    PERFORM public.log_security_event('rpc_denied', 'find_match', 'execute', 'no_session', 'Unauthenticated find_match call');
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO me FROM public.matchmaking_queue WHERE id = _queue_id AND status = 'waiting';
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF me.user_id <> uid THEN
    PERFORM public.log_security_event('rpc_denied', 'find_match', 'execute', 'not_owner',
      'Caller tried to run matchmaking for another user queue entry', NULL, NULL,
      jsonb_build_object('queue_id', _queue_id, 'owner_id', me.user_id));
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

CREATE OR REPLACE FUNCTION public.commit_move(_game_id uuid, _base_fen text, _san text, _uci text, _fen text, _white_time_ms integer, _black_time_ms integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  g public.games%ROWTYPE;
  is_white boolean;
  white_to_move boolean;
  next_ply integer;
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    PERFORM public.log_security_event('rpc_denied', 'commit_move', 'execute', 'no_session', 'Unauthenticated commit_move call');
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO g FROM public.games WHERE id = _game_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found';
  END IF;

  IF g.white_id <> uid AND g.black_id <> uid THEN
    PERFORM public.log_security_event('rpc_denied', 'commit_move', 'execute', 'not_participant',
      'Caller tried to move in a game they are not part of', NULL, NULL,
      jsonb_build_object('game_id', _game_id));
    RAISE EXCEPTION 'Not a player in this game';
  END IF;

  is_white := g.white_id = uid;

  IF g.status <> 'active' THEN
    RETURN jsonb_build_object(
      'applied', false,
      'reason', 'game_over',
      'current_fen', g.current_fen,
      'status', g.status,
      'result', g.result,
      'white_time_ms', g.white_time_ms,
      'black_time_ms', g.black_time_ms,
      'ply', (SELECT COALESCE(MAX(move_number), 0) FROM public.game_moves WHERE game_id = _game_id)
    );
  END IF;

  IF g.current_fen <> _base_fen THEN
    RETURN jsonb_build_object(
      'applied', false,
      'reason', 'stale_position',
      'current_fen', g.current_fen,
      'status', g.status,
      'result', g.result,
      'white_time_ms', g.white_time_ms,
      'black_time_ms', g.black_time_ms,
      'ply', (SELECT COALESCE(MAX(move_number), 0) FROM public.game_moves WHERE game_id = _game_id)
    );
  END IF;

  white_to_move := split_part(g.current_fen, ' ', 2) = 'w';
  IF (is_white AND NOT white_to_move) OR (NOT is_white AND white_to_move) THEN
    RETURN jsonb_build_object(
      'applied', false,
      'reason', 'not_your_turn',
      'current_fen', g.current_fen,
      'status', g.status,
      'result', g.result,
      'white_time_ms', g.white_time_ms,
      'black_time_ms', g.black_time_ms,
      'ply', (SELECT COALESCE(MAX(move_number), 0) FROM public.game_moves WHERE game_id = _game_id)
    );
  END IF;

  SELECT COALESCE(MAX(move_number), 0) + 1 INTO next_ply
  FROM public.game_moves WHERE game_id = _game_id;

  INSERT INTO public.game_moves (game_id, move_number, san, uci, fen, white_time_ms, black_time_ms)
  VALUES (_game_id, next_ply, _san, _uci, _fen, _white_time_ms, _black_time_ms);

  UPDATE public.games
  SET current_fen = _fen,
      white_time_ms = _white_time_ms,
      black_time_ms = _black_time_ms,
      last_move_at = now(),
      updated_at = now()
  WHERE id = _game_id;

  RETURN jsonb_build_object(
    'applied', true,
    'reason', 'ok',
    'current_fen', _fen,
    'status', g.status,
    'result', g.result,
    'white_time_ms', _white_time_ms,
    'black_time_ms', _black_time_ms,
    'ply', next_ply
  );
END;
$function$;