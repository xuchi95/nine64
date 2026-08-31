CREATE TABLE public.training_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day date NOT NULL,
  budget_minutes integer NOT NULL DEFAULT 20,
  minutes_spent integer NOT NULL DEFAULT 0,
  plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  completed_blocks integer NOT NULL DEFAULT 0,
  failed_blocks integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, day)
);

GRANT SELECT, INSERT, UPDATE ON public.training_sessions TO authenticated;
GRANT ALL ON public.training_sessions TO service_role;

ALTER TABLE public.training_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "training_sessions_select_own" ON public.training_sessions
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "training_sessions_insert_own" ON public.training_sessions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "training_sessions_update_own" ON public.training_sessions
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE INDEX training_sessions_user_day_idx ON public.training_sessions (user_id, day DESC);

CREATE TRIGGER training_sessions_set_updated_at
  BEFORE UPDATE ON public.training_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();