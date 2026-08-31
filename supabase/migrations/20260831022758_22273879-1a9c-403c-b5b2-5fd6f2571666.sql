-- ===== P0.5: canonical game lifecycle =====

-- 1) Canonical end reasons ------------------------------------------------
UPDATE public.games SET end_reason = CASE
  WHEN end_reason IS NULL THEN NULL
  WHEN lower(end_reason) LIKE '%checkmate%' THEN 'checkmate'
  WHEN lower(end_reason) LIKE '%stalemate%' THEN 'stalemate'
  WHEN lower(end_reason) LIKE '%insufficient%' THEN 'insufficient_material'
  WHEN lower(end_reason) LIKE '%threefold%' OR lower(end_reason) LIKE '%repetition%' THEN 'threefold_repetition'
  WHEN lower(end_reason) LIKE '%fifty%' THEN 'fifty_move_rule'
  WHEN lower(end_reason) LIKE '%flag%' OR lower(end_reason) LIKE '%time%' THEN 'timeout'
  WHEN lower(end_reason) LIKE '%resign%' THEN 'resignation'
  WHEN lower(end_reason) LIKE '%declin%' THEN 'declined'
  WHEN lower(end_reason) LIKE '%abort%' THEN 'aborted'
  WHEN lower(end_reason) LIKE '%agree%' OR lower(end_reason) LIKE '%draw%' THEN 'draw_agreement'
  ELSE 'other'
END
WHERE end_reason IS NOT NULL;

UPDATE public.games SET end_reason = 'other'
WHERE status = 'completed' AND end_reason IS NULL;

ALTER TABLE public.games DROP CONSTRAINT IF EXISTS games_end_reason_check;
ALTER TABLE public.games ADD CONSTRAINT games_end_reason_check CHECK (
  end_reason IS NULL OR end_reason IN (
    'checkmate','stalemate','insufficient_material','threefold_repetition',
    'fifty_move_rule','timeout','resignation','draw_agreement',
    'aborted','declined','other'
  )
);

-- 2) State machine guard --------------------------------------------------
CREATE OR REPLACE FUNCTION public.games_enforce_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.status IN ('completed','aborted') THEN
    -- Terminal states are immutable except for post-hoc bookkeeping columns
    -- (rating_applied_at, updated_at, rated flag flips done before finalize).
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.result IS DISTINCT FROM OLD.result
       OR NEW.winner_id IS DISTINCT FROM OLD.winner_id
       OR NEW.end_reason IS DISTINCT FROM OLD.end_reason
       OR NEW.current_fen IS DISTINCT FROM OLD.current_fen
       OR NEW.white_time_ms IS DISTINCT FROM OLD.white_time_ms
       OR NEW.black_time_ms IS DISTINCT FROM OLD.black_time_ms
       OR NEW.white_id IS DISTINCT FROM OLD.white_id
       OR NEW.black_id IS DISTINCT FROM OLD.black_id THEN
      RAISE EXCEPTION 'INVALID_TRANSITION: game % is terminal (%)', OLD.id, OLD.status
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('pending','active','completed','aborted') THEN
    RAISE EXCEPTION 'INVALID_TRANSITION: unknown status %', NEW.status USING ERRCODE = '23514';
  END IF;

  -- pending -> active | aborted ; active -> completed | aborted
  IF NEW.status = 'completed' AND OLD.status <> 'active' THEN
    RAISE EXCEPTION 'INVALID_TRANSITION: % -> completed', OLD.status USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'completed' THEN
    IF NEW.result NOT IN ('1-0','0-1','1/2-1/2') THEN
      RAISE EXCEPTION 'INVALID_TRANSITION: completed game needs a decisive result'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.end_reason IS NULL THEN
      RAISE EXCEPTION 'INVALID_TRANSITION: completed game needs an end reason'
        USING ERRCODE = '23514';
    END IF;
    IF (NEW.result = '1-0' AND NEW.winner_id IS DISTINCT FROM NEW.white_id)
       OR (NEW.result = '0-1' AND NEW.winner_id IS DISTINCT FROM NEW.black_id)
       OR (NEW.result = '1/2-1/2' AND NEW.winner_id IS NOT NULL) THEN
      RAISE EXCEPTION 'INVALID_TRANSITION: winner does not match result'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS games_enforce_transition ON public.games;
CREATE TRIGGER games_enforce_transition
BEFORE UPDATE ON public.games
FOR EACH ROW EXECUTE FUNCTION public.games_enforce_transition();

-- 3) Canonical reasons inside the move commit path ------------------------
CREATE OR REPLACE FUNCTION public.commit_move_internal(_game_id uuid, _user_id uuid, _expected_version integer, _san text, _uci text, _fen text, _outcome text, _end_reason text)
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

  elapsed_ms := GREATEST(
    0,
    (EXTRACT(EPOCH FROM (ts - COALESCE(g.turn_started_at, g.last_move_at, g.created_at))) * 1000)::bigint
      - public.clock_lag_grace_ms()
  );
  remaining := (CASE WHEN mover_is_white THEN g.white_time_ms ELSE g.black_time_ms END) - elapsed_ms;

  IF remaining <= 0 THEN
    UPDATE public.games
    SET status = 'completed',
        result = CASE WHEN mover_is_white THEN '0-1' ELSE '1-0' END,
        winner_id = CASE WHEN mover_is_white THEN g.black_id ELSE g.white_id END,
        end_reason = 'timeout',
        white_time_ms = CASE WHEN mover_is_white THEN 0 ELSE g.white_time_ms END,
        black_time_ms = CASE WHEN mover_is_white THEN g.black_time_ms ELSE 0 END,
        clock_state = 'stopped',
        turn_started_at = NULL,
        version = g.version + 1,
        last_move_at = ts,
        updated_at = ts
    WHERE id = _game_id AND status = 'active'
    RETURNING * INTO g;

    PERFORM public.apply_rating_once(_game_id);

    RETURN jsonb_build_object('ok', false, 'code', 'FLAGGED',
                              'game', to_jsonb(g), 'server_now', ts);
  END IF;

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
    new_reason := 'checkmate';
  ELSIF _outcome = 'draw' THEN
    new_status := 'completed';
    new_result := '1/2-1/2';
    new_winner := NULL;
    -- Reason is a canonical code derived by the server-side rules engine.
    new_reason := CASE
      WHEN _end_reason IN ('stalemate','insufficient_material','threefold_repetition','fifty_move_rule')
        THEN _end_reason
      ELSE 'other'
    END;
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

  IF new_status = 'completed' THEN
    PERFORM public.apply_rating_once(_game_id);
  END IF;

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

-- 4) Timeout finalizer uses the canonical reason code ---------------------
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
      end_reason = 'timeout',
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

  PERFORM public.apply_rating_once(_game_id);

  RETURN jsonb_build_object('ok', true, 'code', 'FLAGGED', 'finalized', true,
                            'game', to_jsonb(g), 'server_now', ts);
END;
$function$;

-- 5) Explicit terminal commands ------------------------------------------
CREATE OR REPLACE FUNCTION public.resign_game_internal(_game_id uuid, _user_id uuid, _expected_version integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  g public.games%ROWTYPE;
  ts timestamptz;
  is_white boolean;
BEGIN
  IF _game_id IS NULL OR _user_id IS NULL OR _expected_version IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
  END IF;

  SELECT * INTO g FROM public.games WHERE id = _game_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND'); END IF;

  ts := clock_timestamp();

  IF g.white_id <> _user_id AND g.black_id <> _user_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_A_PARTICIPANT', 'server_now', ts);
  END IF;

  -- Idempotent retry: a terminal game returns its canonical snapshot.
  IF g.status IN ('completed','aborted') THEN
    RETURN jsonb_build_object('ok', true, 'code', 'ALREADY_FINAL', 'applied', false,
                              'game', to_jsonb(g), 'server_now', ts);
  END IF;

  IF g.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_ACTIVE',
                              'game', to_jsonb(g), 'server_now', ts);
  END IF;

  IF g.version <> _expected_version THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STALE_GAME_VERSION',
                              'game', to_jsonb(g), 'server_now', ts);
  END IF;

  is_white := g.white_id = _user_id;

  UPDATE public.games
  SET status = 'completed',
      result = CASE WHEN is_white THEN '0-1' ELSE '1-0' END,
      winner_id = CASE WHEN is_white THEN g.black_id ELSE g.white_id END,
      end_reason = 'resignation',
      clock_state = 'stopped',
      turn_started_at = NULL,
      version = g.version + 1,
      updated_at = ts
  WHERE id = _game_id AND status = 'active'
  RETURNING * INTO g;

  IF NOT FOUND THEN
    SELECT * INTO g FROM public.games WHERE id = _game_id;
    RETURN jsonb_build_object('ok', true, 'code', 'ALREADY_FINAL', 'applied', false,
                              'game', to_jsonb(g), 'server_now', ts);
  END IF;

  PERFORM public.apply_rating_once(_game_id);
  SELECT * INTO g FROM public.games WHERE id = _game_id;

  RETURN jsonb_build_object('ok', true, 'code', 'RESIGNED', 'applied', true,
                            'game', to_jsonb(g), 'server_now', ts);
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_timeout_internal(_game_id uuid, _user_id uuid, _expected_version integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  g public.games%ROWTYPE;
  res jsonb;
BEGIN
  SELECT * INTO g FROM public.games WHERE id = _game_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND'); END IF;

  IF g.white_id <> _user_id AND g.black_id <> _user_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_A_PARTICIPANT');
  END IF;

  IF g.status = 'active' AND g.version <> _expected_version THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STALE_GAME_VERSION',
                              'game', to_jsonb(g), 'server_now', clock_timestamp());
  END IF;

  -- The clock ruling itself lives in the canonical timeout finalizer (P0.2):
  -- it re-locks the row and derives elapsed time from the database clock.
  res := public.finalize_game_timeout(_game_id);
  RETURN res;
END;
$$;

CREATE OR REPLACE FUNCTION public.abort_game_internal(_game_id uuid, _user_id uuid, _expected_version integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  g public.games%ROWTYPE;
  ts timestamptz;
  move_count integer;
BEGIN
  SELECT * INTO g FROM public.games WHERE id = _game_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND'); END IF;

  ts := clock_timestamp();

  IF g.white_id <> _user_id AND g.black_id <> _user_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_A_PARTICIPANT', 'server_now', ts);
  END IF;

  IF g.status IN ('completed','aborted') THEN
    RETURN jsonb_build_object('ok', true, 'code', 'ALREADY_FINAL', 'applied', false,
                              'game', to_jsonb(g), 'server_now', ts);
  END IF;

  IF g.version <> _expected_version THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STALE_GAME_VERSION',
                              'game', to_jsonb(g), 'server_now', ts);
  END IF;

  SELECT count(*) INTO move_count FROM public.game_moves WHERE game_id = _game_id;
  IF move_count > 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ABORT_NOT_ALLOWED',
                              'game', to_jsonb(g), 'server_now', ts);
  END IF;

  UPDATE public.games
  SET status = 'aborted',
      result = '*',
      winner_id = NULL,
      end_reason = 'aborted',
      clock_state = 'stopped',
      turn_started_at = NULL,
      rated = false,
      version = g.version + 1,
      updated_at = ts
  WHERE id = _game_id AND status NOT IN ('completed','aborted')
  RETURNING * INTO g;

  IF NOT FOUND THEN
    SELECT * INTO g FROM public.games WHERE id = _game_id;
    RETURN jsonb_build_object('ok', true, 'code', 'ALREADY_FINAL', 'applied', false,
                              'game', to_jsonb(g), 'server_now', ts);
  END IF;

  RETURN jsonb_build_object('ok', true, 'code', 'ABORTED', 'applied', true,
                            'game', to_jsonb(g), 'server_now', ts);
END;
$$;

REVOKE ALL ON FUNCTION public.resign_game_internal(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_timeout_internal(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.abort_game_internal(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.games_enforce_transition() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resign_game_internal(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_timeout_internal(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.abort_game_internal(uuid, uuid, integer) TO service_role;