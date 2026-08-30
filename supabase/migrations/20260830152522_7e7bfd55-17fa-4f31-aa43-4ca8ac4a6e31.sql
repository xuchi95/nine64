-- ============================================================
-- P0.2: server-authoritative clocks
-- ============================================================

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS turn_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS clock_state text NOT NULL DEFAULT 'running',
  ADD COLUMN IF NOT EXISTS increment_ms integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'games_clock_state_check'
  ) THEN
    ALTER TABLE public.games
      ADD CONSTRAINT games_clock_state_check
      CHECK (clock_state IN ('not_started', 'running', 'stopped'));
  END IF;
END $$;

-- Canonical increment for a time control id (mirrors src/lib/chess/timeControls.ts).
CREATE OR REPLACE FUNCTION public.tc_increment_ms(_time_control text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE _time_control
    WHEN 'blitz1m' THEN 0
    WHEN 'blitz3m' THEN 2000
    WHEN 'blitz5m' THEN 0
    WHEN 'rapid10m' THEN 0
    WHEN 'rapid15m' THEN 10000
    WHEN 'rapid30m' THEN 0
    ELSE 0
  END;
$function$;

-- Fixed, server-owned latency grace. Never client supplied.
CREATE OR REPLACE FUNCTION public.clock_lag_grace_ms()
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$ SELECT 150 $function$;

-- Backfill existing rows so no active game starts from a NULL turn anchor.
UPDATE public.games
SET increment_ms = public.tc_increment_ms(time_control)
WHERE increment_ms = 0;

UPDATE public.games
SET turn_started_at = COALESCE(turn_started_at, last_move_at, created_at)
WHERE turn_started_at IS NULL;

UPDATE public.games
SET clock_state = CASE WHEN status = 'active' THEN 'running' ELSE 'stopped' END;

-- New games get a canonical server anchor immediately.
ALTER TABLE public.games ALTER COLUMN turn_started_at SET DEFAULT now();

CREATE OR REPLACE FUNCTION public.games_set_clock_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.turn_started_at := COALESCE(NEW.turn_started_at, now());
  IF NEW.increment_ms = 0 THEN
    NEW.increment_ms := public.tc_increment_ms(NEW.time_control);
  END IF;
  NEW.clock_state := CASE WHEN NEW.status = 'active' THEN 'running' ELSE 'not_started' END;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS games_clock_defaults ON public.games;
CREATE TRIGGER games_clock_defaults
BEFORE INSERT ON public.games
FOR EACH ROW EXECUTE FUNCTION public.games_set_clock_defaults();

-- ============================================================
-- Idempotent timeout finalization (single game)
-- ============================================================
CREATE OR REPLACE FUNCTION public.finalize_game_timeout(_game_id uuid)
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
BEGIN
  SELECT * INTO g FROM public.games WHERE id = _game_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND');
  END IF;

  ts := clock_timestamp();

  -- Already finished by another worker/request: idempotent no-op.
  IF g.status <> 'active' THEN
    RETURN jsonb_build_object('ok', true, 'code', 'ALREADY_FINAL', 'finalized', false,
                              'game', to_jsonb(g), 'server_now', ts);
  END IF;

  mover_is_white := split_part(g.current_fen, ' ', 2) = 'w';
  elapsed_ms := GREATEST(
    0,
    (EXTRACT(EPOCH FROM (ts - COALESCE(g.turn_started_at, g.last_move_at, g.created_at))) * 1000)::bigint
      - public.clock_lag_grace_ms()
  );
  remaining := (CASE WHEN mover_is_white THEN g.white_time_ms ELSE g.black_time_ms END) - elapsed_ms;

  IF remaining > 0 THEN
    RETURN jsonb_build_object('ok', true, 'code', 'STILL_RUNNING', 'finalized', false,
                              'game', to_jsonb(g), 'server_now', ts);
  END IF;

  UPDATE public.games
  SET status = 'completed',
      result = CASE WHEN mover_is_white THEN '0-1' ELSE '1-0' END,
      winner_id = CASE WHEN mover_is_white THEN g.black_id ELSE g.white_id END,
      end_reason = CASE WHEN mover_is_white THEN 'White flagged' ELSE 'Black flagged' END,
      white_time_ms = CASE WHEN mover_is_white THEN 0 ELSE g.white_time_ms END,
      black_time_ms = CASE WHEN mover_is_white THEN g.black_time_ms ELSE 0 END,
      clock_state = 'stopped',
      turn_started_at = NULL,
      version = g.version + 1,
      last_move_at = ts,
      updated_at = ts
  WHERE id = _game_id AND status = 'active'
  RETURNING * INTO g;

  IF NOT FOUND THEN
    SELECT * INTO g FROM public.games WHERE id = _game_id;
    RETURN jsonb_build_object('ok', true, 'code', 'ALREADY_FINAL', 'finalized', false,
                              'game', to_jsonb(g), 'server_now', ts);
  END IF;

  PERFORM public.apply_glicko2(_game_id);

  RETURN jsonb_build_object('ok', true, 'code', 'FLAGGED', 'finalized', true,
                            'game', to_jsonb(g), 'server_now', ts);
END;
$function$;

REVOKE ALL ON FUNCTION public.finalize_game_timeout(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_game_timeout(uuid) TO service_role;

-- ============================================================
-- Sweeper for abandoned games (safe for concurrent workers)
-- ============================================================
CREATE OR REPLACE FUNCTION public.finalize_expired_games(_limit integer DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  finalized integer := 0;
  scanned integer := 0;
  res jsonb;
BEGIN
  FOR r IN
    SELECT id
    FROM public.games
    WHERE status = 'active'
      AND clock_state = 'running'
      AND COALESCE(turn_started_at, last_move_at, created_at)
          + make_interval(secs => (
              (CASE WHEN split_part(current_fen, ' ', 2) = 'w' THEN white_time_ms ELSE black_time_ms END)
              + public.clock_lag_grace_ms()
            ) / 1000.0)
          <= clock_timestamp()
    ORDER BY updated_at ASC
    LIMIT GREATEST(1, LEAST(_limit, 500))
    FOR UPDATE SKIP LOCKED
  LOOP
    scanned := scanned + 1;
    res := public.finalize_game_timeout(r.id);
    IF (res->>'finalized')::boolean THEN
      finalized := finalized + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('scanned', scanned, 'finalized', finalized,
                            'server_now', clock_timestamp());
END;
$function$;

REVOKE ALL ON FUNCTION public.finalize_expired_games(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_expired_games(integer) TO service_role;

-- ============================================================
-- commit_move_internal v2: clocks derived from database time only
-- ============================================================
DROP FUNCTION IF EXISTS public.commit_move_internal(uuid, uuid, integer, text, text, text, integer, integer, text, text, uuid, text);

CREATE OR REPLACE FUNCTION public.commit_move_internal(
  _game_id uuid,
  _user_id uuid,
  _expected_version integer,
  _san text,
  _uci text,
  _fen text,
  _outcome text,
  _end_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  g public.games%ROWTYPE;
  ts timestamptz;
  next_ply integer;
  mover_is_white boolean;
  white_to_move boolean;
  elapsed_ms bigint;
  remaining bigint;
  new_move public.game_moves%ROWTYPE;
  new_status text;
  new_result text;
  new_winner uuid;
  new_reason text;
  new_white integer;
  new_black integer;
BEGIN
  IF _game_id IS NULL OR _user_id IS NULL OR _expected_version IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ILLEGAL_MOVE');
  END IF;
  IF _san IS NULL OR length(_san) = 0 OR length(_san) > 16 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ILLEGAL_MOVE');
  END IF;
  IF _uci IS NULL OR length(_uci) < 4 OR length(_uci) > 5 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ILLEGAL_MOVE');
  END IF;
  IF _fen IS NULL OR length(_fen) < 10 OR length(_fen) > 120 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ILLEGAL_MOVE');
  END IF;
  IF _outcome IS NULL OR _outcome NOT IN ('none', 'checkmate', 'draw') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ILLEGAL_MOVE');
  END IF;

  SELECT * INTO g FROM public.games WHERE id = _game_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND');
  END IF;

  ts := clock_timestamp();

  IF g.white_id <> _user_id AND g.black_id <> _user_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_A_PARTICIPANT', 'server_now', ts);
  END IF;

  IF g.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_ACTIVE',
                              'game', to_jsonb(g), 'server_now', ts);
  END IF;

  IF g.version <> _expected_version THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STALE_GAME_VERSION',
                              'game', to_jsonb(g), 'server_now', ts);
  END IF;

  mover_is_white := g.white_id = _user_id;
  white_to_move := split_part(g.current_fen, ' ', 2) = 'w';
  IF mover_is_white <> white_to_move THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_YOUR_TURN',
                              'game', to_jsonb(g), 'server_now', ts);
  END IF;

  -- Elapsed time comes from the database clock only.
  elapsed_ms := GREATEST(
    0,
    (EXTRACT(EPOCH FROM (ts - COALESCE(g.turn_started_at, g.last_move_at, g.created_at))) * 1000)::bigint
      - public.clock_lag_grace_ms()
  );
  remaining := (CASE WHEN mover_is_white THEN g.white_time_ms ELSE g.black_time_ms END) - elapsed_ms;

  -- Flag fell before this move could be committed: no move is stored.
  IF remaining <= 0 THEN
    UPDATE public.games
    SET status = 'completed',
        result = CASE WHEN mover_is_white THEN '0-1' ELSE '1-0' END,
        winner_id = CASE WHEN mover_is_white THEN g.black_id ELSE g.white_id END,
        end_reason = CASE WHEN mover_is_white THEN 'White flagged' ELSE 'Black flagged' END,
        white_time_ms = CASE WHEN mover_is_white THEN 0 ELSE g.white_time_ms END,
        black_time_ms = CASE WHEN mover_is_white THEN g.black_time_ms ELSE 0 END,
        clock_state = 'stopped',
        turn_started_at = NULL,
        version = g.version + 1,
        last_move_at = ts,
        updated_at = ts
    WHERE id = _game_id AND status = 'active'
    RETURNING * INTO g;

    PERFORM public.apply_glicko2(_game_id);

    RETURN jsonb_build_object('ok', false, 'code', 'FLAGGED',
                              'game', to_jsonb(g), 'server_now', ts);
  END IF;

  -- Increment is credited exactly once, on a committed legal move.
  IF mover_is_white THEN
    new_white := LEAST(2147483647, remaining + g.increment_ms)::integer;
    new_black := g.black_time_ms;
  ELSE
    new_white := g.white_time_ms;
    new_black := LEAST(2147483647, remaining + g.increment_ms)::integer;
  END IF;

  IF _outcome = 'checkmate' THEN
    new_status := 'completed';
    new_result := CASE WHEN mover_is_white THEN '1-0' ELSE '0-1' END;
    new_winner := _user_id;
    new_reason := COALESCE(_end_reason, 'Checkmate');
  ELSIF _outcome = 'draw' THEN
    new_status := 'completed';
    new_result := '1/2-1/2';
    new_winner := NULL;
    new_reason := COALESCE(_end_reason, 'Draw');
  ELSE
    new_status := 'active';
    new_result := '*';
    new_winner := NULL;
    new_reason := NULL;
  END IF;

  SELECT COALESCE(MAX(move_number), 0) + 1 INTO next_ply
  FROM public.game_moves WHERE game_id = _game_id;

  INSERT INTO public.game_moves (game_id, move_number, san, uci, fen, white_time_ms, black_time_ms)
  VALUES (_game_id, next_ply, _san, _uci, _fen, new_white, new_black)
  RETURNING * INTO new_move;

  UPDATE public.games
  SET current_fen = _fen,
      white_time_ms = new_white,
      black_time_ms = new_black,
      version = g.version + 1,
      status = new_status,
      result = new_result,
      winner_id = COALESCE(new_winner, winner_id),
      end_reason = COALESCE(new_reason, end_reason),
      clock_state = CASE WHEN new_status = 'active' THEN 'running' ELSE 'stopped' END,
      turn_started_at = CASE WHEN new_status = 'active' THEN ts ELSE NULL END,
      last_move_at = ts,
      updated_at = ts
  WHERE id = _game_id
  RETURNING * INTO g;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'game', to_jsonb(g),
    'move', to_jsonb(new_move),
    'server_now', ts,
    'active_side', split_part(g.current_fen, ' ', 2)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.commit_move_internal(uuid, uuid, integer, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_move_internal(uuid, uuid, integer, text, text, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.games_set_clock_defaults() FROM PUBLIC, anon, authenticated;