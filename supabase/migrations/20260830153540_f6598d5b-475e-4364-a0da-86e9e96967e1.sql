-- ============ P0.3: least-privilege grants, RLS and safe RPCs ============

-- 1) Reset all grants in the exposed schema, then re-grant explicitly.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- Public-facing writes: contact form only.
GRANT INSERT, SELECT ON public.contact_requests TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- Read-only surfaces for signed-in users (RLS still scopes the rows).
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.games TO authenticated;
GRANT SELECT ON public.game_moves TO authenticated;
GRANT SELECT ON public.matchmaking_queue TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT SELECT ON public.admin_audit_log TO authenticated;
GRANT SELECT ON public.security_events TO authenticated;
GRANT SELECT ON public.fairplay_status TO authenticated;
GRANT SELECT ON public.fairplay_reports TO authenticated;
GRANT SELECT ON public.fairplay_actions TO authenticated;
GRANT SELECT ON public.game_fairplay TO authenticated;

-- Owner-managed data.
GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.fairplay_signals TO authenticated;
GRANT SELECT, INSERT ON public.puzzle_attempts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.puzzles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.offline_games TO authenticated;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- 2) profiles: no direct UPDATE path at all.
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE OR REPLACE FUNCTION public.update_my_profile(_display_name text DEFAULT NULL, _avatar_url text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  recent integer;
  new_name text;
  new_avatar text;
  clear_avatar boolean := false;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  END IF;

  -- Rate limit: 20 profile writes per rolling hour, tracked in security_events.
  SELECT count(*) INTO recent
  FROM public.security_events e
  WHERE e.user_id = uid
    AND e.kind = 'profile_update'
    AND e.created_at > now() - interval '1 hour';
  IF recent >= 20 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RATE_LIMITED');
  END IF;

  IF _display_name IS NOT NULL THEN
    new_name := btrim(_display_name);
    IF char_length(new_name) < 1 OR char_length(new_name) > 32 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INVALID_DISPLAY_NAME');
    END IF;
    IF new_name !~ '^[[:alnum:] ._-]+$' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INVALID_DISPLAY_NAME');
    END IF;
  END IF;

  IF _avatar_url IS NOT NULL THEN
    new_avatar := btrim(_avatar_url);
    IF new_avatar = '' THEN
      clear_avatar := true;
      new_avatar := NULL;
    ELSIF char_length(new_avatar) > 1024 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INVALID_AVATAR');
    ELSIF new_avatar ~ '^https://[A-Za-z0-9._~:/?#%@!$&''()*+,;=-]+$' THEN
      NULL;
    ELSIF new_avatar ~ ('^' || uid::text || '/[A-Za-z0-9._-]{1,200}$') THEN
      NULL; -- own storage object path
    ELSE
      RETURN jsonb_build_object('ok', false, 'code', 'INVALID_AVATAR');
    END IF;
  END IF;

  -- Allowlist: only these two columns are ever written. Everything else the
  -- caller might send is ignored by construction.
  UPDATE public.profiles p
  SET display_name = COALESCE(new_name, p.display_name),
      avatar_url = CASE
        WHEN clear_avatar THEN NULL
        WHEN new_avatar IS NOT NULL THEN new_avatar
        ELSE p.avatar_url END,
      updated_at = now()
  WHERE p.id = uid;

  PERFORM public.log_security_event('profile_update', 'profiles', 'update', NULL, 'Profile updated via RPC');

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 3) games / moves: read-only for participants, writes only through trusted commands.
DROP POLICY IF EXISTS "Players can update active games they participate in" ON public.games;

-- 4) matchmaking queue: read own rows only; join/leave/heartbeat through RPCs.
DROP POLICY IF EXISTS "Users can manage their own queue entries" ON public.matchmaking_queue;
CREATE POLICY "Users read their own queue entries"
  ON public.matchmaking_queue FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE UNIQUE INDEX IF NOT EXISTS matchmaking_queue_one_waiting_per_user
  ON public.matchmaking_queue (user_id) WHERE status = 'waiting';

CREATE OR REPLACE FUNCTION public.queue_join(_variant text, _time_control text)
RETURNS public.matchmaking_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  my_rating integer;
  entry public.matchmaking_queue%ROWTYPE;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _variant IS NULL OR _variant NOT IN ('standard', 'chess960') THEN
    RAISE EXCEPTION 'Invalid variant';
  END IF;
  IF _time_control IS NULL OR _time_control NOT IN
     ('blitz1m','blitz3m','blitz5m','rapid10m','rapid15m','rapid30m') THEN
    RAISE EXCEPTION 'Invalid time control';
  END IF;

  UPDATE public.matchmaking_queue
  SET status = 'cancelled', updated_at = now()
  WHERE user_id = uid AND status = 'waiting';

  SELECT COALESCE(rating, 1200) INTO my_rating FROM public.profiles WHERE id = uid;

  INSERT INTO public.matchmaking_queue (user_id, rating, variant, time_control, status)
  VALUES (uid, COALESCE(my_rating, 1200), _variant, _time_control, 'waiting')
  RETURNING * INTO entry;

  RETURN entry;
END;
$$;

CREATE OR REPLACE FUNCTION public.queue_leave()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  UPDATE public.matchmaking_queue
  SET status = 'cancelled', updated_at = now()
  WHERE user_id = uid AND status = 'waiting';
END;
$$;

CREATE OR REPLACE FUNCTION public.queue_heartbeat(_queue_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  UPDATE public.matchmaking_queue
  SET updated_at = now()
  WHERE id = _queue_id AND user_id = uid AND status = 'waiting';
END;
$$;

-- 5) notifications: owner reads / marks read / deletes. No client inserts.
DROP POLICY IF EXISTS "Users can manage their own notifications" ON public.notifications;
CREATE POLICY "Owners read their notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Owners update their notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owners delete their notifications"
  ON public.notifications FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- 6) Every exposed table keeps RLS explicitly enabled.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname);
  END LOOP;
END $$;

-- 7) Function execution: deny by default, then grant per role.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.prokind = 'f'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- Caller-facing functions (all derive identity from auth.uid()).
GRANT EXECUTE ON FUNCTION public.update_my_profile(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.queue_join(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.queue_leave() TO authenticated;
GRANT EXECUTE ON FUNCTION public.queue_heartbeat(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_security_event(text, text, text, text, text, text, text, jsonb) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.security_probe_alerts(integer, integer) TO authenticated;

-- Internal/trusted-only functions stay service_role-only:
--   commit_move_internal, create_online_match, apply_glicko2, update_ratings_after_game,
--   finalize_game_timeout, finalize_expired_games, find_match, glicko2_update,
--   tc_increment_ms, clock_lag_grace_ms.