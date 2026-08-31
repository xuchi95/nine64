-- =====================================================================
-- Admin Center step 3: typed system settings with draft/publish/rollback
-- =====================================================================

CREATE TABLE public.system_settings (
  key text PRIMARY KEY,
  scope text NOT NULL CHECK (scope IN ('public_runtime', 'server_only')),
  value jsonb NOT NULL,
  draft_value jsonb,
  has_draft boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  updated_by uuid REFERENCES auth.users(id),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz NOT NULL DEFAULT now(),
  draft_updated_at timestamptz
);

GRANT SELECT ON public.system_settings TO authenticated;
GRANT SELECT ON public.system_settings TO anon;
GRANT ALL ON public.system_settings TO service_role;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Everyone may read published PUBLIC settings only; the draft value and every
-- server_only row stay invisible to the app (server code uses service_role).
CREATE POLICY "public runtime settings are readable"
  ON public.system_settings FOR SELECT
  TO anon, authenticated
  USING (scope = 'public_runtime');

CREATE POLICY "admins read every setting"
  ON public.system_settings FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.system_setting_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL REFERENCES public.system_settings(key) ON DELETE CASCADE,
  version integer NOT NULL,
  value jsonb NOT NULL,
  previous_value jsonb,
  reason text NOT NULL,
  changed_by uuid REFERENCES auth.users(id),
  rollback_of integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (key, version)
);

GRANT SELECT ON public.system_setting_versions TO authenticated;
GRANT ALL ON public.system_setting_versions TO service_role;
ALTER TABLE public.system_setting_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read setting history"
  ON public.system_setting_versions FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_setting_versions_key ON public.system_setting_versions (key, version DESC);

CREATE TABLE public.system_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'degraded', 'outage')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

GRANT SELECT ON public.system_incidents TO authenticated;
GRANT SELECT ON public.system_incidents TO anon;
GRANT ALL ON public.system_incidents TO service_role;
ALTER TABLE public.system_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "incidents are public"
  ON public.system_incidents FOR SELECT
  TO anon, authenticated
  USING (true);

-- ---------------------------------------------------------------------
-- Draft write (no runtime effect)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_save_setting_draft(
  _key text,
  _scope text,
  _draft jsonb,
  _actor uuid,
  _expected_version integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur public.system_settings%ROWTYPE;
BEGIN
  SELECT * INTO cur FROM public.system_settings WHERE key = _key FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.system_settings (key, scope, value, draft_value, has_draft, updated_by, draft_updated_at)
    VALUES (_key, _scope, _draft, _draft, true, _actor, now())
    RETURNING * INTO cur;
    RETURN jsonb_build_object('ok', true, 'version', cur.version, 'created', true);
  END IF;

  IF _expected_version IS NOT NULL AND _expected_version <> cur.version THEN
    RETURN jsonb_build_object('ok', false, 'code', 'VERSION_CONFLICT', 'version', cur.version);
  END IF;

  UPDATE public.system_settings
     SET draft_value = _draft,
         has_draft = true,
         draft_updated_at = now(),
         updated_by = _actor
   WHERE key = _key;

  RETURN jsonb_build_object('ok', true, 'version', cur.version);
END;
$$;

-- ---------------------------------------------------------------------
-- Publish / rollback (records an immutable version row)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_publish_setting(
  _key text,
  _scope text,
  _value jsonb,
  _reason text,
  _actor uuid,
  _expected_version integer DEFAULT NULL,
  _rollback_of integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur public.system_settings%ROWTYPE;
  next_version integer;
  prev jsonb;
BEGIN
  IF _reason IS NULL OR length(btrim(_reason)) < 10 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REASON_TOO_SHORT');
  END IF;

  SELECT * INTO cur FROM public.system_settings WHERE key = _key FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.system_settings (key, scope, value, has_draft, updated_by, reason)
    VALUES (_key, _scope, _value, false, _actor, _reason)
    RETURNING * INTO cur;
    next_version := cur.version;
    prev := NULL;
  ELSE
    IF _expected_version IS NOT NULL AND _expected_version <> cur.version THEN
      RETURN jsonb_build_object('ok', false, 'code', 'VERSION_CONFLICT', 'version', cur.version);
    END IF;
    next_version := cur.version + 1;
    prev := cur.value;
    UPDATE public.system_settings
       SET value = _value,
           draft_value = NULL,
           has_draft = false,
           draft_updated_at = NULL,
           version = next_version,
           updated_by = _actor,
           reason = _reason,
           published_at = now()
     WHERE key = _key;
  END IF;

  INSERT INTO public.system_setting_versions (key, version, value, previous_value, reason, changed_by, rollback_of)
  VALUES (_key, next_version, _value, prev, _reason, _actor, _rollback_of);

  RETURN jsonb_build_object('ok', true, 'version', next_version, 'previous', prev);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_save_setting_draft(text, text, jsonb, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_publish_setting(text, text, jsonb, text, uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_setting_draft(text, text, jsonb, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_publish_setting(text, text, jsonb, text, uuid, integer, integer) TO service_role;