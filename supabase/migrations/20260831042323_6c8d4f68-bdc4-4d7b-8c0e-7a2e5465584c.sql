-- ============ user_admin_state ============
CREATE TABLE IF NOT EXISTS public.user_admin_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','restricted','suspended','pending_deletion','anonymized')),
  reason text,
  internal_note text,
  suspended_until timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.user_admin_state TO authenticated;
GRANT ALL ON public.user_admin_state TO service_role;
ALTER TABLE public.user_admin_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read user admin state" ON public.user_admin_state;
CREATE POLICY "Admins read user admin state"
  ON public.user_admin_state FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS user_admin_state_status_idx ON public.user_admin_state(status);
CREATE INDEX IF NOT EXISTS user_admin_state_suspended_until_idx ON public.user_admin_state(suspended_until);

DROP TRIGGER IF EXISTS user_admin_state_updated_at ON public.user_admin_state;
CREATE TRIGGER user_admin_state_updated_at
  BEFORE UPDATE ON public.user_admin_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ admin_rating_adjustments (immutable ledger) ============
CREATE TABLE IF NOT EXISTS public.admin_rating_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  game_id uuid REFERENCES public.games(id) ON DELETE SET NULL,
  delta integer NOT NULL,
  rating_before integer NOT NULL,
  rating_after integer NOT NULL,
  peak_before integer NOT NULL,
  peak_after integer NOT NULL,
  reason text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.admin_rating_adjustments TO authenticated;
GRANT ALL ON public.admin_rating_adjustments TO service_role;
ALTER TABLE public.admin_rating_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read rating adjustments" ON public.admin_rating_adjustments;
CREATE POLICY "Admins read rating adjustments"
  ON public.admin_rating_adjustments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS admin_rating_adjustments_user_idx
  ON public.admin_rating_adjustments(user_id, created_at DESC);

-- ============ account_deletion_jobs ============
CREATE TABLE IF NOT EXISTS public.account_deletion_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','cancelled','processing','completed','failed')),
  mode text NOT NULL DEFAULT 'anonymize' CHECK (mode IN ('anonymize','delete')),
  reason text NOT NULL,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  grace_until timestamptz NOT NULL,
  processed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS account_deletion_jobs_one_open
  ON public.account_deletion_jobs(user_id)
  WHERE status IN ('pending','processing');

GRANT SELECT ON public.account_deletion_jobs TO authenticated;
GRANT ALL ON public.account_deletion_jobs TO service_role;
ALTER TABLE public.account_deletion_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read deletion jobs" ON public.account_deletion_jobs;
CREATE POLICY "Admins read deletion jobs"
  ON public.account_deletion_jobs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS account_deletion_jobs_updated_at ON public.account_deletion_jobs;
CREATE TRIGGER account_deletion_jobs_updated_at
  BEFORE UPDATE ON public.account_deletion_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ admin_set_user_state (optimistic concurrency) ============
CREATE OR REPLACE FUNCTION public.admin_set_user_state(
  _user_id uuid,
  _status text,
  _reason text,
  _actor uuid,
  _suspended_until timestamptz DEFAULT NULL,
  _internal_note text DEFAULT NULL,
  _expected_version integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.user_admin_state;
  _before jsonb;
BEGIN
  IF _reason IS NULL OR length(btrim(_reason)) < 10 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REASON_TOO_SHORT');
  END IF;

  SELECT * INTO _row FROM public.user_admin_state WHERE user_id = _user_id FOR UPDATE;

  IF NOT FOUND THEN
    IF _expected_version IS NOT NULL AND _expected_version <> 0 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'VERSION_CONFLICT', 'version', 0);
    END IF;
    INSERT INTO public.user_admin_state(
      user_id, status, reason, internal_note, suspended_until, created_by, updated_by
    ) VALUES (
      _user_id, _status, _reason, _internal_note, _suspended_until, _actor, _actor
    ) RETURNING * INTO _row;
    RETURN jsonb_build_object('ok', true, 'state', to_jsonb(_row), 'before', NULL);
  END IF;

  IF _expected_version IS NOT NULL AND _expected_version <> _row.version THEN
    RETURN jsonb_build_object('ok', false, 'code', 'VERSION_CONFLICT', 'version', _row.version);
  END IF;

  _before := to_jsonb(_row);

  UPDATE public.user_admin_state SET
    status = _status,
    reason = _reason,
    internal_note = COALESCE(_internal_note, internal_note),
    suspended_until = _suspended_until,
    updated_by = _actor,
    version = version + 1
  WHERE user_id = _user_id
  RETURNING * INTO _row;

  RETURN jsonb_build_object('ok', true, 'state', to_jsonb(_row), 'before', _before);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_state(uuid, text, text, uuid, timestamptz, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_state(uuid, text, text, uuid, timestamptz, text, integer) TO service_role;

-- ============ admin_apply_rating_adjustment (atomic + idempotent) ============
CREATE OR REPLACE FUNCTION public.admin_apply_rating_adjustment(
  _user_id uuid,
  _target_rating integer,
  _reason text,
  _actor uuid,
  _idempotency_key text,
  _game_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _existing public.admin_rating_adjustments;
  _profile public.profiles;
  _new_peak integer;
  _row public.admin_rating_adjustments;
BEGIN
  IF _reason IS NULL OR length(btrim(_reason)) < 10 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REASON_TOO_SHORT');
  END IF;
  IF _target_rating < 100 OR _target_rating > 4000 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RATING_OUT_OF_RANGE');
  END IF;

  SELECT * INTO _existing FROM public.admin_rating_adjustments
   WHERE idempotency_key = _idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'replayed', true, 'adjustment', to_jsonb(_existing));
  END IF;

  SELECT * INTO _profile FROM public.profiles WHERE id = _user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PROFILE_NOT_FOUND');
  END IF;

  _new_peak := GREATEST(_profile.peak_rating, _target_rating);

  INSERT INTO public.admin_rating_adjustments(
    user_id, actor_id, game_id, delta, rating_before, rating_after,
    peak_before, peak_after, reason, idempotency_key
  ) VALUES (
    _user_id, _actor, _game_id, _target_rating - _profile.rating, _profile.rating, _target_rating,
    _profile.peak_rating, _new_peak, _reason, _idempotency_key
  ) RETURNING * INTO _row;

  UPDATE public.profiles
     SET rating = _target_rating,
         peak_rating = _new_peak,
         updated_at = now()
   WHERE id = _user_id;

  RETURN jsonb_build_object('ok', true, 'replayed', false, 'adjustment', to_jsonb(_row));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_apply_rating_adjustment(uuid, integer, text, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_apply_rating_adjustment(uuid, integer, text, uuid, text, uuid) TO service_role;