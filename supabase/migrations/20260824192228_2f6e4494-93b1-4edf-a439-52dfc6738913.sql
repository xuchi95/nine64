ALTER TABLE public.games ADD COLUMN IF NOT EXISTS rated boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.fairplay_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  turns jsonb NOT NULL DEFAULT '[]'::jsonb,
  client_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, user_id)
);

GRANT SELECT, INSERT, UPDATE ON public.fairplay_signals TO authenticated;
GRANT ALL ON public.fairplay_signals TO service_role;
ALTER TABLE public.fairplay_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players submit their own raw signals"
ON public.fairplay_signals FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Players update their own raw signals"
ON public.fairplay_signals FOR UPDATE TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Only admins read raw signals"
ON public.fairplay_signals FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.fairplay_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score integer NOT NULL DEFAULT 0,
  probability numeric NOT NULL DEFAULT 0,
  confidence numeric NOT NULL DEFAULT 0,
  action text NOT NULL DEFAULT 'none',
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  contributions jsonb NOT NULL DEFAULT '[]'::jsonb,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text NOT NULL DEFAULT 'nexus-fp-1',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, user_id)
);

GRANT SELECT ON public.fairplay_reports TO authenticated;
GRANT ALL ON public.fairplay_reports TO service_role;
ALTER TABLE public.fairplay_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins read fairplay reports v2"
ON public.fairplay_reports FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.fairplay_status (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  score integer NOT NULL DEFAULT 0,
  action text NOT NULL DEFAULT 'none',
  sprt_llr numeric NOT NULL DEFAULT 0,
  sprt_decision text NOT NULL DEFAULT 'undecided',
  boosting_score integer NOT NULL DEFAULT 0,
  sandbagging_score integer NOT NULL DEFAULT 0,
  rating_locked boolean NOT NULL DEFAULT false,
  games_reviewed integer NOT NULL DEFAULT 0,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.fairplay_status TO authenticated;
GRANT ALL ON public.fairplay_status TO service_role;
ALTER TABLE public.fairplay_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players read their own fairplay status"
ON public.fairplay_status FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.fairplay_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_id uuid REFERENCES public.games(id) ON DELETE SET NULL,
  action text NOT NULL,
  score integer NOT NULL DEFAULT 0,
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  automatic boolean NOT NULL DEFAULT true,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.fairplay_actions TO authenticated;
GRANT ALL ON public.fairplay_actions TO service_role;
ALTER TABLE public.fairplay_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins read fairplay actions"
ON public.fairplay_actions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS fairplay_reports_user_created_idx
  ON public.fairplay_reports (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS fairplay_actions_user_created_idx
  ON public.fairplay_actions (user_id, created_at DESC);