-- ============ EVENTS ============
CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  location text,
  time_zone text NOT NULL DEFAULT 'UTC',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  status text NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming','live','finished','cancelled')),
  tour text,
  official_url text,
  image_url text,
  rounds_total integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT false,
  featured boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.events TO anon, authenticated;
GRANT ALL ON public.events TO service_role;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "events_public_read" ON public.events FOR SELECT TO anon, authenticated USING (is_published = true);

CREATE INDEX events_starts_at_idx ON public.events (starts_at DESC);
CREATE INDEX events_status_idx ON public.events (status);

CREATE TABLE public.event_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  number integer NOT NULL,
  name text,
  starts_at timestamptz,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','finished')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, number)
);
GRANT SELECT ON public.event_rounds TO anon, authenticated;
GRANT ALL ON public.event_rounds TO service_role;
ALTER TABLE public.event_rounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "event_rounds_public_read" ON public.event_rounds FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.is_published));

CREATE TABLE public.event_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  title text,
  federation text,
  rating integer,
  fide_id text,
  avatar_url text,
  bio text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, slug)
);
GRANT SELECT ON public.event_players TO anon, authenticated;
GRANT ALL ON public.event_players TO service_role;
ALTER TABLE public.event_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "event_players_public_read" ON public.event_players FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.is_published));
CREATE INDEX event_players_slug_idx ON public.event_players (slug);

CREATE TABLE public.broadcast_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'pgn_push' CHECK (kind IN ('pgn_push','pgn_url','manual')),
  url text,
  token_hash text,
  poll_interval_seconds integer NOT NULL DEFAULT 30,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','error')),
  last_success_at timestamptz,
  last_attempt_at timestamptz,
  last_error text,
  consecutive_failures integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.broadcast_sources TO service_role;
ALTER TABLE public.broadcast_sources ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.event_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  round_id uuid REFERENCES public.event_rounds(id) ON DELETE SET NULL,
  source_id uuid REFERENCES public.broadcast_sources(id) ON DELETE SET NULL,
  external_id text NOT NULL,
  board integer NOT NULL DEFAULT 1,
  white_name text NOT NULL DEFAULT 'White',
  black_name text NOT NULL DEFAULT 'Black',
  white_player_id uuid REFERENCES public.event_players(id) ON DELETE SET NULL,
  black_player_id uuid REFERENCES public.event_players(id) ON DELETE SET NULL,
  white_title text,
  black_title text,
  white_rating integer,
  black_rating integer,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','finished')),
  result text NOT NULL DEFAULT '*',
  termination text,
  start_fen text,
  current_fen text NOT NULL DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  ply_count integer NOT NULL DEFAULT 0,
  moves jsonb NOT NULL DEFAULT '[]'::jsonb,
  pgn text,
  eco text,
  opening_name text,
  white_clock_ms integer,
  black_clock_ms integer,
  eval_cp integer,
  eval_mate integer,
  started_at timestamptz,
  last_move_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, external_id)
);
GRANT SELECT ON public.event_games TO anon, authenticated;
GRANT ALL ON public.event_games TO service_role;
ALTER TABLE public.event_games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "event_games_public_read" ON public.event_games FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.is_published));
CREATE INDEX event_games_event_idx ON public.event_games (event_id, board);
CREATE INDEX event_games_status_idx ON public.event_games (status, last_move_at DESC);

-- ============ NEWS ============
CREATE TABLE public.news_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'rss' CHECK (kind IN ('rss','manual')),
  feed_url text,
  homepage_url text,
  allowed_hosts text[] NOT NULL DEFAULT '{}',
  language text NOT NULL DEFAULT 'en',
  enabled boolean NOT NULL DEFAULT true,
  last_fetched_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  consecutive_failures integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.news_sources TO anon, authenticated;
GRANT ALL ON public.news_sources TO service_role;
ALTER TABLE public.news_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "news_sources_public_read" ON public.news_sources FOR SELECT TO anon, authenticated USING (enabled = true);

CREATE TABLE public.news_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  source_id uuid REFERENCES public.news_sources(id) ON DELETE SET NULL,
  source_name text NOT NULL DEFAULT 'Nine64',
  title text NOT NULL,
  summary text,
  content_html text,
  image_url text,
  external_url text,
  author text,
  language text NOT NULL DEFAULT 'vi',
  tags text[] NOT NULL DEFAULT '{}',
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','rejected')),
  published_at timestamptz,
  external_guid text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.news_articles TO anon, authenticated;
GRANT ALL ON public.news_articles TO service_role;
ALTER TABLE public.news_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "news_articles_public_read" ON public.news_articles FOR SELECT TO anon, authenticated
  USING (status = 'published' AND published_at IS NOT NULL AND published_at <= now());
CREATE INDEX news_articles_published_idx ON public.news_articles (published_at DESC);

-- ============ INGESTION JOBS ============
CREATE TABLE public.ingestion_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('broadcast','news')),
  source_id uuid,
  source_name text,
  status text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','failed')),
  items_processed integer NOT NULL DEFAULT 0,
  duration_ms integer,
  error text,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ingestion_jobs TO service_role;
ALTER TABLE public.ingestion_jobs ENABLE ROW LEVEL SECURITY;
CREATE INDEX ingestion_jobs_created_idx ON public.ingestion_jobs (created_at DESC);

-- updated_at triggers
CREATE TRIGGER events_updated_at BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER event_rounds_updated_at BEFORE UPDATE ON public.event_rounds FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER event_players_updated_at BEFORE UPDATE ON public.event_players FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER event_games_updated_at BEFORE UPDATE ON public.event_games FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER broadcast_sources_updated_at BEFORE UPDATE ON public.broadcast_sources FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER news_sources_updated_at BEFORE UPDATE ON public.news_sources FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER news_articles_updated_at BEFORE UPDATE ON public.news_articles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- realtime for live boards
ALTER TABLE public.event_games REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.event_games;