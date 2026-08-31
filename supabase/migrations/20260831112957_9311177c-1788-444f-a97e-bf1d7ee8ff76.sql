-- ============ datasets ============
CREATE TABLE public.puzzle_datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  source_url text NOT NULL DEFAULT '',
  license text NOT NULL,
  license_url text NOT NULL DEFAULT '',
  attribution text NOT NULL DEFAULT '',
  version text NOT NULL DEFAULT 'v1',
  imported_count integer NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.puzzle_datasets TO anon, authenticated;
GRANT ALL ON public.puzzle_datasets TO service_role;
ALTER TABLE public.puzzle_datasets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "puzzle_datasets_read" ON public.puzzle_datasets FOR SELECT TO anon, authenticated USING (true);

-- ============ themes ============
CREATE TABLE public.puzzle_themes (
  key text PRIMARY KEY,
  name_vi text NOT NULL,
  name_en text NOT NULL,
  description_vi text NOT NULL DEFAULT '',
  description_en text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'tactics',
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.puzzle_themes TO anon, authenticated;
GRANT ALL ON public.puzzle_themes TO service_role;
ALTER TABLE public.puzzle_themes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "puzzle_themes_read" ON public.puzzle_themes FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.puzzle_themes (key, name_vi, name_en, category, sort_order) VALUES
  ('fork','Đòn đôi','Fork','tactics',10),
  ('pin','Ghim quân','Pin','tactics',20),
  ('skewer','Xiên quân','Skewer','tactics',30),
  ('discovered_attack','Tấn công mở','Discovered attack','tactics',40),
  ('deflection','Đánh lạc hướng','Deflection','tactics',50),
  ('decoy','Dụ quân','Decoy','tactics',60),
  ('sacrifice','Thí quân','Sacrifice','tactics',70),
  ('mate','Chiếu hết','Mate','tactics',80),
  ('back_rank','Chiếu hàng cuối','Back rank','tactics',90),
  ('zwischenzug','Nước chen','Zwischenzug','tactics',100),
  ('removing_defender','Loại quân phòng thủ','Removing the defender','tactics',110),
  ('promotion','Phong cấp','Promotion','tactics',120),
  ('endgame','Tàn cuộc','Endgame','phase',130),
  ('defence','Phòng thủ','Defence','strategy',140),
  ('only_move','Nước duy nhất','Only move','calculation',150),
  ('quiet_move','Nước lặng','Quiet move','calculation',160),
  ('opening_tactics','Chiến thuật khai cuộc','Opening tactics','phase',170);

-- ============ catalog ============
CREATE TABLE public.puzzle_catalog (
  id text PRIMARY KEY,
  dataset_id uuid REFERENCES public.puzzle_datasets(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'global',
  source_id text,
  fen text NOT NULL,
  color text NOT NULL CHECK (color IN ('w','b')),
  rating integer NOT NULL DEFAULT 1500,
  rating_deviation numeric NOT NULL DEFAULT 120,
  popularity integer NOT NULL DEFAULT 0,
  plies integer NOT NULL DEFAULT 1,
  themes text[] NOT NULL DEFAULT '{}',
  phase text NOT NULL DEFAULT 'middlegame',
  opening text,
  game_url text,
  enabled boolean NOT NULL DEFAULT true,
  flagged boolean NOT NULL DEFAULT false,
  flag_reason text,
  attempts integer NOT NULL DEFAULT 0,
  solved integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, source_id)
);
CREATE INDEX puzzle_catalog_rating_idx ON public.puzzle_catalog (rating) WHERE enabled AND NOT flagged;
CREATE INDEX puzzle_catalog_themes_idx ON public.puzzle_catalog USING gin (themes);
CREATE INDEX puzzle_catalog_phase_idx ON public.puzzle_catalog (phase, rating);
GRANT SELECT ON public.puzzle_catalog TO anon, authenticated;
GRANT ALL ON public.puzzle_catalog TO service_role;
ALTER TABLE public.puzzle_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "puzzle_catalog_read_enabled" ON public.puzzle_catalog
  FOR SELECT TO anon, authenticated USING (enabled AND NOT flagged);

CREATE TABLE public.puzzle_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  puzzle_id text NOT NULL REFERENCES public.puzzle_catalog(id) ON DELETE CASCADE,
  line_index integer NOT NULL DEFAULT 0,
  kind text NOT NULL DEFAULT 'solution' CHECK (kind IN ('solution','alternate')),
  ply_from integer NOT NULL DEFAULT 0,
  moves jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (puzzle_id, line_index)
);
CREATE INDEX puzzle_lines_puzzle_idx ON public.puzzle_lines (puzzle_id);
GRANT SELECT ON public.puzzle_lines TO anon, authenticated;
GRANT ALL ON public.puzzle_lines TO service_role;
ALTER TABLE public.puzzle_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "puzzle_lines_read" ON public.puzzle_lines FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.puzzle_catalog c WHERE c.id = puzzle_id AND c.enabled AND NOT c.flagged));

-- ============ sessions ============
CREATE TABLE public.puzzle_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','finished','abandoned')),
  duration_seconds integer,
  lives integer,
  score integer NOT NULL DEFAULT 0,
  solved integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  hints_used integer NOT NULL DEFAULT 0,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX puzzle_sessions_user_idx ON public.puzzle_sessions (user_id, started_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.puzzle_sessions TO authenticated;
GRANT ALL ON public.puzzle_sessions TO service_role;
ALTER TABLE public.puzzle_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "puzzle_sessions_own" ON public.puzzle_sessions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "puzzle_sessions_insert_own" ON public.puzzle_sessions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "puzzle_sessions_update_own" ON public.puzzle_sessions FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============ attempts (extend existing) ============
ALTER TABLE public.puzzle_attempts
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'personal',
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'adaptive',
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES public.puzzle_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hints_used integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS themes text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS moves_played jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE INDEX IF NOT EXISTS puzzle_attempts_user_recent_idx ON public.puzzle_attempts (user_id, created_at DESC);

-- ============ puzzle ratings ============
CREATE TABLE public.puzzle_ratings (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT 'overall',
  rating integer NOT NULL DEFAULT 1200,
  rating_deviation numeric NOT NULL DEFAULT 350,
  volatility numeric NOT NULL DEFAULT 0.06,
  attempts integer NOT NULL DEFAULT 0,
  solved integer NOT NULL DEFAULT 0,
  peak_rating integer NOT NULL DEFAULT 1200,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, scope)
);
GRANT SELECT, INSERT, UPDATE ON public.puzzle_ratings TO authenticated;
GRANT ALL ON public.puzzle_ratings TO service_role;
ALTER TABLE public.puzzle_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "puzzle_ratings_own" ON public.puzzle_ratings FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "puzzle_ratings_insert_own" ON public.puzzle_ratings FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "puzzle_ratings_update_own" ON public.puzzle_ratings FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============ user stats ============
CREATE TABLE public.puzzle_user_stats (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  attempts integer NOT NULL DEFAULT 0,
  solved integer NOT NULL DEFAULT 0,
  hints_used integer NOT NULL DEFAULT 0,
  current_streak integer NOT NULL DEFAULT 0,
  best_streak integer NOT NULL DEFAULT 0,
  sprint_best integer NOT NULL DEFAULT 0,
  survival_best integer NOT NULL DEFAULT 0,
  theme_stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_solved_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.puzzle_user_stats TO authenticated;
GRANT ALL ON public.puzzle_user_stats TO service_role;
ALTER TABLE public.puzzle_user_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "puzzle_user_stats_own" ON public.puzzle_user_stats FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "puzzle_user_stats_insert_own" ON public.puzzle_user_stats FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "puzzle_user_stats_update_own" ON public.puzzle_user_stats FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============ srs cards ============
CREATE TABLE public.srs_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  puzzle_id text NOT NULL,
  source text NOT NULL DEFAULT 'global',
  difficulty numeric NOT NULL DEFAULT 5.6,
  stability numeric NOT NULL DEFAULT 0,
  reps integer NOT NULL DEFAULT 0,
  lapses integer NOT NULL DEFAULT 0,
  due timestamptz NOT NULL DEFAULT now(),
  last_review timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, puzzle_id)
);
CREATE INDEX srs_cards_due_idx ON public.srs_cards (user_id, due);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.srs_cards TO authenticated;
GRANT ALL ON public.srs_cards TO service_role;
ALTER TABLE public.srs_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "srs_cards_own" ON public.srs_cards FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TRIGGER puzzle_catalog_updated_at BEFORE UPDATE ON public.puzzle_catalog
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER srs_cards_updated_at BEFORE UPDATE ON public.srs_cards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER puzzle_sessions_updated_at BEFORE UPDATE ON public.puzzle_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER puzzle_datasets_updated_at BEFORE UPDATE ON public.puzzle_datasets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();