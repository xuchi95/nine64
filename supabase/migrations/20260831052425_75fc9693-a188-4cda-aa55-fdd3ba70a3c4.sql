CREATE TABLE IF NOT EXISTS public.titan_usage_daily (
  user_id uuid NOT NULL,
  day date NOT NULL,
  moves integer NOT NULL DEFAULT 0,
  engine_ms bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);

CREATE TABLE IF NOT EXISTS public.titan_move_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  day date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS titan_move_charges_user_day_idx ON public.titan_move_charges (user_id, day);

GRANT ALL ON public.titan_usage_daily TO service_role;
GRANT ALL ON public.titan_move_charges TO service_role;

ALTER TABLE public.titan_usage_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.titan_move_charges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "titan_usage_daily_no_client_access" ON public.titan_usage_daily;
CREATE POLICY "titan_usage_daily_no_client_access" ON public.titan_usage_daily
  FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "titan_move_charges_no_client_access" ON public.titan_move_charges;
CREATE POLICY "titan_move_charges_no_client_access" ON public.titan_move_charges
  FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.titan_consume_move(
  _user_id uuid,
  _session_id uuid,
  _idempotency_key text,
  _limit integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _day date := (now() AT TIME ZONE 'utc')::date;
  _used integer;
BEGIN
  IF _limit IS NULL OR _limit < 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_LIMIT');
  END IF;

  INSERT INTO public.titan_usage_daily (user_id, day, moves)
  VALUES (_user_id, _day, 0)
  ON CONFLICT (user_id, day) DO NOTHING;

  SELECT moves INTO _used
  FROM public.titan_usage_daily
  WHERE user_id = _user_id AND day = _day
  FOR UPDATE;

  IF EXISTS (
    SELECT 1 FROM public.titan_move_charges
    WHERE session_id = _session_id AND idempotency_key = _idempotency_key
  ) THEN
    RETURN jsonb_build_object('ok', true, 'replayed', true, 'used', _used, 'limit', _limit);
  END IF;

  IF _used >= _limit THEN
    RETURN jsonb_build_object('ok', false, 'code', 'QUOTA_EXCEEDED', 'used', _used, 'limit', _limit);
  END IF;

  INSERT INTO public.titan_move_charges (user_id, session_id, idempotency_key, day)
  VALUES (_user_id, _session_id, _idempotency_key, _day);

  UPDATE public.titan_usage_daily
  SET moves = moves + 1, updated_at = now()
  WHERE user_id = _user_id AND day = _day
  RETURNING moves INTO _used;

  RETURN jsonb_build_object('ok', true, 'replayed', false, 'used', _used, 'limit', _limit);
END;
$$;

CREATE OR REPLACE FUNCTION public.titan_record_engine_ms(
  _user_id uuid,
  _ms integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _day date := (now() AT TIME ZONE 'utc')::date;
BEGIN
  IF _ms IS NULL OR _ms <= 0 THEN
    RETURN;
  END IF;
  INSERT INTO public.titan_usage_daily (user_id, day, moves, engine_ms)
  VALUES (_user_id, _day, 0, _ms)
  ON CONFLICT (user_id, day)
  DO UPDATE SET engine_ms = public.titan_usage_daily.engine_ms + EXCLUDED.engine_ms, updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.titan_consume_move(uuid, uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.titan_record_engine_ms(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.titan_consume_move(uuid, uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.titan_record_engine_ms(uuid, integer) TO service_role;