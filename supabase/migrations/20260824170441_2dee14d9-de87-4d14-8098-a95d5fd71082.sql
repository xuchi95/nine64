-- Realtime online chess tables for Nexus Chess

CREATE TABLE public.matchmaking_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL DEFAULT 1200,
  variant TEXT NOT NULL DEFAULT 'standard',
  time_control TEXT NOT NULL DEFAULT 'blitz5m',
  status TEXT NOT NULL DEFAULT 'waiting',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.matchmaking_queue TO authenticated;
GRANT ALL ON public.matchmaking_queue TO service_role;

ALTER TABLE public.matchmaking_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own queue entries"
  ON public.matchmaking_queue
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  white_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  black_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  white_rating INTEGER NOT NULL,
  black_rating INTEGER NOT NULL,
  variant TEXT NOT NULL DEFAULT 'standard',
  time_control TEXT NOT NULL DEFAULT 'blitz5m',
  status TEXT NOT NULL DEFAULT 'pending',
  result TEXT NOT NULL DEFAULT '*',
  winner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  end_reason TEXT,
  initial_fen TEXT NOT NULL DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  current_fen TEXT NOT NULL DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  white_time_ms INTEGER NOT NULL DEFAULT 300000,
  black_time_ms INTEGER NOT NULL DEFAULT 300000,
  last_move_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.games TO authenticated;
GRANT ALL ON public.games TO service_role;

ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can view games they participate in"
  ON public.games
  FOR SELECT
  TO authenticated
  USING (auth.uid() = white_id OR auth.uid() = black_id);

CREATE POLICY "Players can update active games they participate in"
  ON public.games
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = white_id OR auth.uid() = black_id)
  WITH CHECK (auth.uid() = white_id OR auth.uid() = black_id);

CREATE TABLE public.game_moves (
  id BIGSERIAL PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  move_number INTEGER NOT NULL,
  san TEXT NOT NULL,
  uci TEXT NOT NULL,
  fen TEXT NOT NULL,
  white_time_ms INTEGER NOT NULL,
  black_time_ms INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.game_moves TO authenticated;
GRANT ALL ON public.game_moves TO service_role;

ALTER TABLE public.game_moves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can view moves of their own games"
  ON public.game_moves
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.games
      WHERE public.games.id = game_id
        AND (public.games.white_id = auth.uid() OR public.games.black_id = auth.uid())
    )
  );

CREATE POLICY "Players can add moves to their own games"
  ON public.game_moves
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.games
      WHERE public.games.id = game_id
        AND (public.games.white_id = auth.uid() OR public.games.black_id = auth.uid())
    )
  );

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own notifications"
  ON public.notifications
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Enable Realtime for these tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.matchmaking_queue;
ALTER PUBLICATION supabase_realtime ADD TABLE public.games;
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_moves;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Helper to keep updated_at fresh
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_matchmaking_queue_updated_at
  BEFORE UPDATE ON public.matchmaking_queue
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_games_updated_at
  BEFORE UPDATE ON public.games
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO service_role;
