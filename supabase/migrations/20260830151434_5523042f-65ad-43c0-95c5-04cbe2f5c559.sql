ALTER TABLE public.games ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 0;

REVOKE EXECUTE ON FUNCTION public.commit_move(uuid, text, text, text, text, integer, integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.commit_move_internal(
  _game_id uuid,
  _user_id uuid,
  _expected_version integer,
  _san text,
  _uci text,
  _fen text,
  _white_time_ms integer,
  _black_time_ms integer,
  _status text,
  _result text,
  _winner_id uuid,
  _end_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  g public.games%ROWTYPE;
  next_ply integer;
  mover_is_white boolean;
  white_to_move boolean;
  new_move public.game_moves%ROWTYPE;
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
  IF _white_time_ms IS NULL OR _black_time_ms IS NULL
     OR _white_time_ms < 0 OR _black_time_ms < 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ILLEGAL_MOVE');
  END IF;
  IF _status NOT IN ('active', 'completed') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ILLEGAL_MOVE');
  END IF;
  IF _result NOT IN ('*', '1-0', '0-1', '1/2-1/2') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ILLEGAL_MOVE');
  END IF;

  SELECT * INTO g FROM public.games WHERE id = _game_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND');
  END IF;

  IF g.white_id <> _user_id AND g.black_id <> _user_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_A_PARTICIPANT');
  END IF;

  IF g.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_ACTIVE', 'game', to_jsonb(g));
  END IF;

  IF g.version <> _expected_version THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STALE_GAME_VERSION', 'game', to_jsonb(g));
  END IF;

  mover_is_white := g.white_id = _user_id;
  white_to_move := split_part(g.current_fen, ' ', 2) = 'w';
  IF mover_is_white <> white_to_move THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_YOUR_TURN', 'game', to_jsonb(g));
  END IF;

  SELECT COALESCE(MAX(move_number), 0) + 1 INTO next_ply
  FROM public.game_moves WHERE game_id = _game_id;

  INSERT INTO public.game_moves (game_id, move_number, san, uci, fen, white_time_ms, black_time_ms)
  VALUES (_game_id, next_ply, _san, _uci, _fen, _white_time_ms, _black_time_ms)
  RETURNING * INTO new_move;

  UPDATE public.games
  SET current_fen = _fen,
      white_time_ms = _white_time_ms,
      black_time_ms = _black_time_ms,
      version = g.version + 1,
      status = _status,
      result = _result,
      winner_id = COALESCE(_winner_id, winner_id),
      end_reason = COALESCE(_end_reason, end_reason),
      last_move_at = now(),
      updated_at = now()
  WHERE id = _game_id
  RETURNING * INTO g;

  RETURN jsonb_build_object('ok', true, 'code', 'OK', 'game', to_jsonb(g), 'move', to_jsonb(new_move));
END;
$function$;

REVOKE ALL ON FUNCTION public.commit_move_internal(uuid, uuid, integer, text, text, text, integer, integer, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_move_internal(uuid, uuid, integer, text, text, text, integer, integer, text, text, uuid, text) TO service_role;