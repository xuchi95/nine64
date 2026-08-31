CREATE OR REPLACE FUNCTION public.sync_game_state(_game_id uuid, _since_move integer DEFAULT -1)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  g public.games%ROWTYPE;
  ts timestamptz;
  mover_is_white boolean;
  elapsed_ms bigint;
  remaining bigint;
  finalized boolean := false;
  raw jsonb;
BEGIN
  -- Lock-free read: the hot path for both players and spectators must not take
  -- a row lock, otherwise every sync serializes against commit_move_internal.
  SELECT * INTO g FROM public.games WHERE id = _game_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND');
  END IF;

  ts := clock_timestamp();

  IF g.status = 'active' THEN
    mover_is_white := split_part(g.current_fen, ' ', 2) = 'w';
    IF g.pace = 'daily' THEN
      remaining := (EXTRACT(EPOCH FROM (COALESCE(g.deadline_at, ts + interval '1 minute') - ts)) * 1000)::bigint;
    ELSE
      elapsed_ms := GREATEST(0,
        (EXTRACT(EPOCH FROM (ts - COALESCE(g.turn_started_at, g.last_move_at, g.created_at))) * 1000)::bigint
        - public.clock_lag_grace_ms());
      remaining := (CASE WHEN mover_is_white THEN g.white_time_ms ELSE g.black_time_ms END) - elapsed_ms;
    END IF;

    -- Escalate to the locking finalizer only when the flag has actually fallen.
    IF remaining <= 0 THEN
      raw := public.finalize_game_timeout(_game_id);
      IF (raw ->> 'ok')::boolean AND raw ? 'game' THEN
        SELECT * INTO g FROM public.games WHERE id = _game_id;
        finalized := COALESCE((raw ->> 'finalized')::boolean, false);
        ts := clock_timestamp();
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'game', to_jsonb(g),
    'server_now', ts,
    'finalized', finalized,
    'moves', COALESCE((
      SELECT jsonb_agg(to_jsonb(m) ORDER BY m.move_number)
      FROM public.game_moves m
      WHERE m.game_id = _game_id
        AND m.move_number > COALESCE(_since_move, -1)
    ), '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_game_state(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_game_state(uuid, integer) TO service_role;