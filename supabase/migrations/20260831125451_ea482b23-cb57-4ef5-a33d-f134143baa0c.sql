ALTER TABLE public.skill_events DROP CONSTRAINT IF EXISTS skill_events_source_check;
ALTER TABLE public.skill_events ADD CONSTRAINT skill_events_source_check
  CHECK (source IN ('review','puzzle','drill','retry','live_coach'));

CREATE TABLE IF NOT EXISTS public.coach_live_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  local_game_id text NOT NULL,
  ply_index integer NOT NULL,
  move_number integer NOT NULL,
  trigger_kind text NOT NULL CHECK (trigger_kind IN ('blunder','mistake','missed_tactic','hanging_piece','opening_principle','strategic_lesson')),
  severity text NOT NULL CHECK (severity IN ('info','major','critical')),
  skill_key text NOT NULL,
  loss_cp integer NOT NULL DEFAULT 0,
  coach_mode text NOT NULL CHECK (coach_mode IN ('quiet','normal','teaching')),
  personality text NOT NULL,
  ai_styled boolean NOT NULL DEFAULT false,
  retried boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coach_live_events_user_created_idx
  ON public.coach_live_events (user_id, created_at DESC);

GRANT SELECT, INSERT ON public.coach_live_events TO authenticated;
GRANT ALL ON public.coach_live_events TO service_role;

ALTER TABLE public.coach_live_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coach_live_events_select_own" ON public.coach_live_events
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "coach_live_events_insert_own" ON public.coach_live_events
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());