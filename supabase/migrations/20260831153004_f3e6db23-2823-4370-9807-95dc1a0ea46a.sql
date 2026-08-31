CREATE TABLE public.game_chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL DEFAULT '',
  author_role TEXT NOT NULL DEFAULT 'spectator' CHECK (author_role IN ('player','spectator')),
  ply INTEGER NOT NULL DEFAULT 0 CHECK (ply >= 0),
  body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 400),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX game_chat_messages_game_created_idx ON public.game_chat_messages (game_id, created_at);

GRANT SELECT, INSERT ON public.game_chat_messages TO authenticated;
GRANT ALL ON public.game_chat_messages TO service_role;

ALTER TABLE public.game_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read game chat"
  ON public.game_chat_messages FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can post their own game chat"
  ON public.game_chat_messages FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.game_chat_stamp_author()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_player BOOLEAN;
  v_name TEXT;
BEGIN
  NEW.body := btrim(NEW.body);

  SELECT EXISTS (
    SELECT 1 FROM public.games g
    WHERE g.id = NEW.game_id
      AND (g.white_id = NEW.user_id OR g.black_id = NEW.user_id)
  ) INTO v_is_player;

  NEW.author_role := CASE WHEN v_is_player THEN 'player' ELSE 'spectator' END;

  SELECT p.display_name INTO v_name FROM public.profiles p WHERE p.id = NEW.user_id;
  NEW.author_name := COALESCE(NULLIF(btrim(v_name), ''), 'Người chơi');

  RETURN NEW;
END;
$$;

CREATE TRIGGER game_chat_stamp_author_trg
  BEFORE INSERT ON public.game_chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.game_chat_stamp_author();

ALTER TABLE public.game_chat_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_chat_messages;