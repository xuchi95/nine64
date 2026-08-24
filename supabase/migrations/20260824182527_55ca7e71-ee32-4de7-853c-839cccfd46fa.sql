CREATE TABLE public.offline_games (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id text NOT NULL,
  played_at timestamp with time zone NOT NULL DEFAULT now(),
  mode text NOT NULL DEFAULT 'ai',
  payload jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.offline_games TO authenticated;
GRANT ALL ON public.offline_games TO service_role;

ALTER TABLE public.offline_games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own offline games"
ON public.offline_games FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX offline_games_user_played_idx ON public.offline_games (user_id, played_at DESC);

CREATE TRIGGER offline_games_set_updated_at
BEFORE UPDATE ON public.offline_games
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();