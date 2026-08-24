-- Ensure two moves can never occupy the same ply of the same game
DELETE FROM public.game_moves a
USING public.game_moves b
WHERE a.game_id = b.game_id
  AND a.move_number = b.move_number
  AND a.id > b.id;

CREATE UNIQUE INDEX IF NOT EXISTS game_moves_game_id_move_number_key
  ON public.game_moves (game_id, move_number);

-- Atomic, conflict-aware move commit.
-- Returns a row describing whether the move was applied, and the authoritative state.
CREATE OR REPLACE FUNCTION public.commit_move(
  _game_id uuid,
  _base_fen text,
  _san text,
  _uci text,
  _fen text,
  _white_time_ms integer,
  _black_time_ms integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g public.games%ROWTYPE;
  is_white boolean;
  white_to_move boolean;
  next_ply integer;
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Lock the game row so concurrent submissions serialise here
  SELECT * INTO g FROM public.games WHERE id = _game_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found';
  END IF;

  IF g.white_id <> uid AND g.black_id <> uid THEN
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

  -- Optimistic concurrency: the client must have based its move on the current position
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
$$;

REVOKE ALL ON FUNCTION public.commit_move(uuid, text, text, text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commit_move(uuid, text, text, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commit_move(uuid, text, text, text, text, integer, integer) TO service_role;