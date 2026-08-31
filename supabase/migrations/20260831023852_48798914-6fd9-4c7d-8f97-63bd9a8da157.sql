-- ===== P0.7: server-authoritative fair play evidence =====

CREATE OR REPLACE FUNCTION public.fairplay_analyzer_version()
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$ SELECT 'nine64-fairplay-1'::text $$;

CREATE TABLE IF NOT EXISTS public.fairplay_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  analyzer_version text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','succeeded','failed')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  last_error text,
  engine_version text,
  depth integer,
  time_budget_ms integer,
  claimed_by text,
  lease_until timestamptz,
  queued_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, analyzer_version)
);

GRANT SELECT ON public.fairplay_jobs TO authenticated;
GRANT ALL ON public.fairplay_jobs TO service_role;
ALTER TABLE public.fairplay_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read fairplay jobs" ON public.fairplay_jobs;
CREATE POLICY "Admins read fairplay jobs"
ON public.fairplay_jobs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

CREATE INDEX IF NOT EXISTS fairplay_jobs_pending_idx
  ON public.fairplay_jobs (status, queued_at);

CREATE TRIGGER fairplay_jobs_updated_at
BEFORE UPDATE ON public.fairplay_jobs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enqueue on game completion. The queue is the only entry point for analysis.
CREATE OR REPLACE FUNCTION public.games_enqueue_fairplay_job()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
    INSERT INTO public.fairplay_jobs (game_id, analyzer_version)
    VALUES (NEW.id, public.fairplay_analyzer_version())
    ON CONFLICT (game_id, analyzer_version) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS games_enqueue_fairplay_job ON public.games;
CREATE TRIGGER games_enqueue_fairplay_job
AFTER UPDATE ON public.games
FOR EACH ROW EXECUTE FUNCTION public.games_enqueue_fairplay_job();

-- ---- Player complaints (never a verdict) --------------------------------
CREATE TABLE IF NOT EXISTS public.player_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('engine_assistance','sandbagging','stalling','abuse','other')),
  note text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','dismissed')),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT player_reports_not_self CHECK (reporter_id <> subject_id),
  UNIQUE (reporter_id, game_id)
);

GRANT SELECT ON public.player_reports TO authenticated;
GRANT ALL ON public.player_reports TO service_role;
ALTER TABLE public.player_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Reporters read own complaints" ON public.player_reports;
CREATE POLICY "Reporters read own complaints"
ON public.player_reports FOR SELECT TO authenticated
USING (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "Admins read complaints" ON public.player_reports;
CREATE POLICY "Admins read complaints"
ON public.player_reports FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

CREATE INDEX IF NOT EXISTS player_reports_subject_idx ON public.player_reports (subject_id, created_at DESC);

-- Complaint submission: identity and subject are derived server-side.
CREATE OR REPLACE FUNCTION public.submit_player_report(_game_id uuid, _reason text, _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  g public.games%ROWTYPE;
  subject uuid;
  recent integer;
  row public.player_reports%ROWTYPE;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  END IF;
  IF _reason IS NULL OR _reason NOT IN ('engine_assistance','sandbagging','stalling','abuse','other') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_REASON');
  END IF;
  IF _note IS NOT NULL AND char_length(_note) > 1000 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOTE_TOO_LONG');
  END IF;

  SELECT * INTO g FROM public.games WHERE id = _game_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND'); END IF;

  IF g.white_id <> uid AND g.black_id <> uid THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_A_PARTICIPANT');
  END IF;

  -- The subject is always the opponent; the reporter cannot choose a target.
  subject := CASE WHEN g.white_id = uid THEN g.black_id ELSE g.white_id END;

  SELECT count(*) INTO recent FROM public.player_reports
  WHERE reporter_id = uid AND created_at > now() - interval '1 hour';
  IF recent >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RATE_LIMITED');
  END IF;

  INSERT INTO public.player_reports (reporter_id, subject_id, game_id, reason, note)
  VALUES (uid, subject, _game_id, _reason, NULLIF(btrim(coalesce(_note, '')), ''))
  ON CONFLICT (reporter_id, game_id) DO NOTHING
  RETURNING * INTO row;

  IF row.id IS NULL THEN
    SELECT * INTO row FROM public.player_reports WHERE reporter_id = uid AND game_id = _game_id;
    RETURN jsonb_build_object('ok', true, 'code', 'ALREADY_REPORTED', 'report', to_jsonb(row));
  END IF;

  RETURN jsonb_build_object('ok', true, 'code', 'REPORTED', 'report', to_jsonb(row));
END;
$$;

REVOKE ALL ON FUNCTION public.submit_player_report(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_player_report(uuid, text, text) TO authenticated, service_role;

-- ---- Worker queue commands (service role only) --------------------------
CREATE OR REPLACE FUNCTION public.fairplay_claim_jobs(_worker text, _limit integer DEFAULT 5, _lease_seconds integer DEFAULT 300)
RETURNS SETOF public.fairplay_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT j.id FROM public.fairplay_jobs j
    WHERE (j.status = 'queued'
           OR (j.status = 'running' AND j.lease_until IS NOT NULL AND j.lease_until < now()))
      AND j.attempts < j.max_attempts
    ORDER BY j.queued_at ASC
    LIMIT GREATEST(1, LEAST(_limit, 20))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.fairplay_jobs j
  SET status = 'running',
      attempts = j.attempts + 1,
      claimed_by = left(coalesce(_worker, 'worker'), 100),
      lease_until = now() + make_interval(secs => GREATEST(30, LEAST(_lease_seconds, 1800))),
      started_at = now()
  FROM picked
  WHERE j.id = picked.id
  RETURNING j.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.fairplay_fail_job(_job_id uuid, _error text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE j public.fairplay_jobs%ROWTYPE;
BEGIN
  UPDATE public.fairplay_jobs
  SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'queued' END,
      last_error = left(coalesce(_error, 'unknown'), 1000),
      lease_until = NULL,
      finished_at = CASE WHEN attempts >= max_attempts THEN now() ELSE NULL END
  WHERE id = _job_id
  RETURNING * INTO j;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'JOB_NOT_FOUND'); END IF;
  RETURN jsonb_build_object('ok', true, 'code', 'RECORDED', 'job', to_jsonb(j));
END;
$$;

/*
 * Idempotent verdict write. Retrying a job overwrites the same (game, subject)
 * report instead of creating a second verdict, and the automatic action is
 * capped at 'review_required' — the worker can never ban or lock by itself.
 */
CREATE OR REPLACE FUNCTION public.fairplay_submit_analysis(
  _job_id uuid,
  _engine_version text,
  _depth integer,
  _time_budget_ms integer,
  _subjects jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  j public.fairplay_jobs%ROWTYPE;
  g public.games%ROWTYPE;
  s jsonb;
  subject uuid;
  score integer;
  action text;
  written integer := 0;
BEGIN
  SELECT * INTO j FROM public.fairplay_jobs WHERE id = _job_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'JOB_NOT_FOUND'); END IF;

  IF j.status = 'succeeded' THEN
    RETURN jsonb_build_object('ok', true, 'code', 'ALREADY_DONE', 'job', to_jsonb(j));
  END IF;

  SELECT * INTO g FROM public.games WHERE id = j.game_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND'); END IF;

  IF jsonb_typeof(_subjects) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_PAYLOAD');
  END IF;

  FOR s IN SELECT * FROM jsonb_array_elements(_subjects) LOOP
    subject := (s->>'user_id')::uuid;
    -- Only the two canonical players of this game can ever be a subject.
    IF subject IS NULL OR subject NOT IN (g.white_id, g.black_id) THEN
      CONTINUE;
    END IF;
    score := GREATEST(0, LEAST(100, COALESCE((s->>'score')::integer, 0)));
    -- Automatic outcomes are capped: no bans, no rating locks from the worker.
    action := CASE WHEN score >= 80 THEN 'review_required' ELSE 'none' END;

    INSERT INTO public.fairplay_reports (
      game_id, user_id, score, probability, confidence, action,
      features, contributions, reasons, model, eval_ms, rating
    ) VALUES (
      g.id, subject, score,
      COALESCE((s->>'probability')::numeric, 0),
      COALESCE((s->>'confidence')::numeric, 0),
      action,
      COALESCE(s->'features', '{}'::jsonb),
      COALESCE(s->'contributions', '{}'::jsonb),
      COALESCE(s->'reasons', '[]'::jsonb),
      left(coalesce(_engine_version, 'unknown'), 100),
      GREATEST(0, COALESCE((s->>'eval_ms')::integer, 0)),
      CASE WHEN subject = g.white_id THEN g.white_rating ELSE g.black_rating END
    )
    ON CONFLICT (game_id, user_id) DO UPDATE
      SET score = EXCLUDED.score,
          probability = EXCLUDED.probability,
          confidence = EXCLUDED.confidence,
          action = EXCLUDED.action,
          features = EXCLUDED.features,
          contributions = EXCLUDED.contributions,
          reasons = EXCLUDED.reasons,
          model = EXCLUDED.model,
          eval_ms = EXCLUDED.eval_ms,
          rating = EXCLUDED.rating;

    written := written + 1;
  END LOOP;

  UPDATE public.fairplay_jobs
  SET status = 'succeeded',
      engine_version = left(coalesce(_engine_version, 'unknown'), 100),
      depth = _depth,
      time_budget_ms = _time_budget_ms,
      last_error = NULL,
      lease_until = NULL,
      finished_at = now()
  WHERE id = _job_id
  RETURNING * INTO j;

  RETURN jsonb_build_object('ok', true, 'code', 'STORED', 'subjects', written, 'job', to_jsonb(j));
END;
$$;

CREATE OR REPLACE FUNCTION public.fairplay_retry_job(_job_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE j public.fairplay_jobs%ROWTYPE;
BEGIN
  UPDATE public.fairplay_jobs
  SET status = 'queued', attempts = 0, last_error = NULL,
      lease_until = NULL, finished_at = NULL, queued_at = now()
  WHERE id = _job_id RETURNING * INTO j;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'JOB_NOT_FOUND'); END IF;
  RETURN jsonb_build_object('ok', true, 'code', 'REQUEUED', 'job', to_jsonb(j));
END;
$$;

-- fairplay_reports needs a stable conflict target for idempotent writes.
CREATE UNIQUE INDEX IF NOT EXISTS fairplay_reports_game_user_key
  ON public.fairplay_reports (game_id, user_id);

REVOKE ALL ON FUNCTION public.fairplay_claim_jobs(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fairplay_fail_job(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fairplay_submit_analysis(uuid, text, integer, integer, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fairplay_retry_job(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.games_enqueue_fairplay_job() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fairplay_claim_jobs(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fairplay_fail_job(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fairplay_submit_analysis(uuid, text, integer, integer, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fairplay_retry_job(uuid) TO service_role;

-- ---- Lock down evidence tables to the trusted service identity ----------
REVOKE INSERT, UPDATE, DELETE ON public.fairplay_signals FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.fairplay_reports FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.fairplay_actions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.fairplay_status FROM anon, authenticated;

DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'fairplay_signals'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.fairplay_signals', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "Players read own fairplay signals"
ON public.fairplay_signals FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));