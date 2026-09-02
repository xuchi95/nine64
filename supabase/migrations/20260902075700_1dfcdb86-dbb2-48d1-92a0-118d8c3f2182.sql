-- 1. AI flag on profiles (additive, default false for every existing human)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_ai boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_is_ai ON public.profiles (id) WHERE is_ai;

-- 2. AI roster
CREATE TABLE IF NOT EXISTS public.ai_players (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  ai_key text UNIQUE NOT NULL,
  base_target_rating integer NOT NULL,
  engine_level integer NOT NULL,
  personality_id text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  standard_enabled boolean NOT NULL DEFAULT true,
  chess960_enabled boolean NOT NULL DEFAULT true,
  max_concurrent_games integer NOT NULL DEFAULT 4,
  min_think_ms integer NOT NULL DEFAULT 150,
  max_think_ms integer NOT NULL DEFAULT 900,
  last_assigned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_players_rating_range CHECK (base_target_rating BETWEEN 700 AND 3190),
  CONSTRAINT ai_players_level_range CHECK (engine_level BETWEEN 1 AND 16),
  CONSTRAINT ai_players_concurrency_range CHECK (max_concurrent_games BETWEEN 1 AND 20),
  CONSTRAINT ai_players_think_range CHECK (
    min_think_ms >= 0 AND max_think_ms >= min_think_ms AND max_think_ms <= 60000
  ),
  CONSTRAINT ai_players_key_format CHECK (ai_key ~ '^[a-z0-9_]{3,40}$')
);

GRANT ALL ON public.ai_players TO service_role;
ALTER TABLE public.ai_players ENABLE ROW LEVEL SECURITY;
-- No policies: the browser never reads or writes the roster table directly.
-- Public-safe AI metadata is served through profiles (is_ai) and server functions.

CREATE INDEX IF NOT EXISTS idx_ai_players_enabled
  ON public.ai_players (base_target_rating) WHERE enabled;

-- 3. Durable AI move jobs (exactly-once AI turns)
CREATE TABLE IF NOT EXISTS public.ai_move_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  expected_version integer NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_move_jobs_unique_turn UNIQUE (game_id, expected_version),
  CONSTRAINT ai_move_jobs_status_valid CHECK (
    status IN ('queued', 'running', 'done', 'failed', 'cancelled')
  ),
  CONSTRAINT ai_move_jobs_attempts_range CHECK (attempts BETWEEN 0 AND 20)
);

GRANT ALL ON public.ai_move_jobs TO service_role;
ALTER TABLE public.ai_move_jobs ENABLE ROW LEVEL SECURITY;
-- No policies: only trusted server code (service role) touches AI move jobs.

CREATE INDEX IF NOT EXISTS idx_ai_move_jobs_pending
  ON public.ai_move_jobs (available_at)
  WHERE status IN ('queued', 'running');

-- 4. Game-level AI metadata
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS ai_game boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_profile_id uuid REFERENCES public.profiles(id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'games_ai_metadata_consistent'
  ) THEN
    ALTER TABLE public.games ADD CONSTRAINT games_ai_metadata_consistent CHECK (
      (ai_game = false AND ai_profile_id IS NULL)
      OR (ai_game = true AND ai_profile_id IS NOT NULL
          AND ai_profile_id IN (white_id, black_id))
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_games_ai_active
  ON public.games (ai_profile_id)
  WHERE ai_game AND status = 'active';

-- 5. Keep updated_at fresh on the new tables
DROP TRIGGER IF EXISTS ai_players_touch_updated_at ON public.ai_players;
CREATE TRIGGER ai_players_touch_updated_at
  BEFORE UPDATE ON public.ai_players
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS ai_move_jobs_touch_updated_at ON public.ai_move_jobs;
CREATE TRIGGER ai_move_jobs_touch_updated_at
  BEFORE UPDATE ON public.ai_move_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();