-- ===== P0.6: draw offers =====

CREATE TABLE IF NOT EXISTS public.game_draw_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  offered_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  offered_to uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','declined','cancelled','expired')),
  game_version integer NOT NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '60 seconds',
  CONSTRAINT game_draw_offers_distinct_players CHECK (offered_by <> offered_to)
);

GRANT SELECT ON public.game_draw_offers TO authenticated;
GRANT ALL ON public.game_draw_offers TO service_role;

ALTER TABLE public.game_draw_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants read draw offers" ON public.game_draw_offers;
CREATE POLICY "Participants read draw offers"
ON public.game_draw_offers FOR SELECT TO authenticated
USING (auth.uid() = offered_by OR auth.uid() = offered_to);

CREATE UNIQUE INDEX IF NOT EXISTS game_draw_offers_one_pending
  ON public.game_draw_offers (game_id) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS game_draw_offers_idem
  ON public.game_draw_offers (idempotency_key);
CREATE INDEX IF NOT EXISTS game_draw_offers_game_idx
  ON public.game_draw_offers (game_id, created_at DESC);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.game_draw_offers;
EXCEPTION WHEN duplicate_object OR undefined_object THEN NULL;
END $$;

-- Expire stale pending offers lazily (called by every command).
CREATE OR REPLACE FUNCTION public.expire_draw_offers(_game_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.game_draw_offers
  SET status = 'expired', responded_at = now()
  WHERE game_id = _game_id AND status = 'pending' AND expires_at <= now();
$$;

-- A move by the *recipient* auto-declines the pending offer.
CREATE OR REPLACE FUNCTION public.game_moves_auto_decline_draw()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  g public.games%ROWTYPE;
  mover uuid;
BEGIN
  SELECT * INTO g FROM public.games WHERE id = NEW.game_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Side to move in the resulting FEN is the opponent, so the mover is the other one.
  mover := CASE WHEN split_part(NEW.fen, ' ', 2) = 'w' THEN g.black_id ELSE g.white_id END;

  UPDATE public.game_draw_offers
  SET status = 'declined', responded_at = now()
  WHERE game_id = NEW.game_id AND status = 'pending' AND offered_to = mover;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS game_moves_auto_decline_draw ON public.game_moves;
CREATE TRIGGER game_moves_auto_decline_draw
AFTER INSERT ON public.game_moves
FOR EACH ROW EXECUTE FUNCTION public.game_moves_auto_decline_draw();

-- Any terminal game kills its pending offers.
CREATE OR REPLACE FUNCTION public.games_expire_draw_offers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status IN ('completed','aborted') AND OLD.status NOT IN ('completed','aborted') THEN
    UPDATE public.game_draw_offers
    SET status = 'expired', responded_at = now()
    WHERE game_id = NEW.id AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS games_expire_draw_offers ON public.games;
CREATE TRIGGER games_expire_draw_offers
AFTER UPDATE ON public.games
FOR EACH ROW EXECUTE FUNCTION public.games_expire_draw_offers();

-- ---- Commands (service role only) --------------------------------------
CREATE OR REPLACE FUNCTION public.offer_draw_internal(_game_id uuid, _user_id uuid, _expected_version integer, _idempotency_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  g public.games%ROWTYPE;
  o public.game_draw_offers%ROWTYPE;
  last_at timestamptz;
  target uuid;
BEGIN
  IF _idempotency_key IS NULL OR length(_idempotency_key) < 8 OR length(_idempotency_key) > 100 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
  END IF;

  SELECT * INTO g FROM public.games WHERE id = _game_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND'); END IF;
  IF g.white_id <> _user_id AND g.black_id <> _user_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_A_PARTICIPANT');
  END IF;

  -- Replaying the same command must never create a second offer.
  SELECT * INTO o FROM public.game_draw_offers WHERE idempotency_key = _idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'code', 'OFFER_EXISTS', 'offer', to_jsonb(o));
  END IF;

  IF g.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_ACTIVE', 'game', to_jsonb(g));
  END IF;
  IF g.version <> _expected_version THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STALE_GAME_VERSION', 'game', to_jsonb(g));
  END IF;

  PERFORM public.expire_draw_offers(_game_id);

  SELECT * INTO o FROM public.game_draw_offers
  WHERE game_id = _game_id AND status = 'pending' FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'OFFER_ALREADY_PENDING', 'offer', to_jsonb(o));
  END IF;

  SELECT max(created_at) INTO last_at FROM public.game_draw_offers
  WHERE game_id = _game_id AND offered_by = _user_id;
  IF last_at IS NOT NULL AND last_at > now() - interval '30 seconds' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'OFFER_COOLDOWN',
                              'retry_after_ms',
                              GREATEST(0, 30000 - (EXTRACT(EPOCH FROM (now() - last_at)) * 1000)::bigint));
  END IF;

  target := CASE WHEN g.white_id = _user_id THEN g.black_id ELSE g.white_id END;

  INSERT INTO public.game_draw_offers (game_id, offered_by, offered_to, game_version, idempotency_key)
  VALUES (_game_id, _user_id, target, g.version, _idempotency_key)
  RETURNING * INTO o;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (target, 'system', 'Đề nghị hoà', 'Đối thủ đề nghị hoà ván đang chơi.',
          jsonb_build_object('game_id', _game_id, 'offer_id', o.id));

  RETURN jsonb_build_object('ok', true, 'code', 'OFFER_CREATED', 'offer', to_jsonb(o));
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_draw_internal(_game_id uuid, _offer_id uuid, _user_id uuid, _expected_version integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  g public.games%ROWTYPE;
  o public.game_draw_offers%ROWTYPE;
  ts timestamptz;
BEGIN
  SELECT * INTO g FROM public.games WHERE id = _game_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND'); END IF;

  ts := clock_timestamp();

  IF g.white_id <> _user_id AND g.black_id <> _user_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_A_PARTICIPANT');
  END IF;

  SELECT * INTO o FROM public.game_draw_offers
  WHERE id = _offer_id AND game_id = _game_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'OFFER_NOT_FOUND'); END IF;

  IF o.offered_to <> _user_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_OFFER_RECIPIENT');
  END IF;

  -- Second accept of the same offer: return the canonical terminal snapshot.
  IF o.status = 'accepted' THEN
    RETURN jsonb_build_object('ok', true, 'code', 'ALREADY_FINAL', 'applied', false,
                              'game', to_jsonb(g), 'offer', to_jsonb(o), 'server_now', ts);
  END IF;
  IF o.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'OFFER_NOT_PENDING', 'offer', to_jsonb(o));
  END IF;
  IF o.expires_at <= now() THEN
    UPDATE public.game_draw_offers SET status = 'expired', responded_at = now()
    WHERE id = o.id RETURNING * INTO o;
    RETURN jsonb_build_object('ok', false, 'code', 'OFFER_EXPIRED', 'offer', to_jsonb(o));
  END IF;

  IF g.status <> 'active' THEN
    UPDATE public.game_draw_offers SET status = 'expired', responded_at = now()
    WHERE id = o.id RETURNING * INTO o;
    RETURN jsonb_build_object('ok', true, 'code', 'ALREADY_FINAL', 'applied', false,
                              'game', to_jsonb(g), 'offer', to_jsonb(o), 'server_now', ts);
  END IF;
  IF g.version <> _expected_version THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STALE_GAME_VERSION',
                              'game', to_jsonb(g), 'offer', to_jsonb(o));
  END IF;

  UPDATE public.game_draw_offers
  SET status = 'accepted', responded_at = ts
  WHERE id = o.id RETURNING * INTO o;

  UPDATE public.games
  SET status = 'completed',
      result = '1/2-1/2',
      winner_id = NULL,
      end_reason = 'draw_agreement',
      clock_state = 'stopped',
      turn_started_at = NULL,
      version = g.version + 1,
      updated_at = ts
  WHERE id = _game_id AND status = 'active'
  RETURNING * INTO g;

  IF NOT FOUND THEN
    SELECT * INTO g FROM public.games WHERE id = _game_id;
    RETURN jsonb_build_object('ok', true, 'code', 'ALREADY_FINAL', 'applied', false,
                              'game', to_jsonb(g), 'offer', to_jsonb(o), 'server_now', ts);
  END IF;

  PERFORM public.apply_rating_once(_game_id);
  SELECT * INTO g FROM public.games WHERE id = _game_id;

  RETURN jsonb_build_object('ok', true, 'code', 'DRAW_AGREED', 'applied', true,
                            'game', to_jsonb(g), 'offer', to_jsonb(o), 'server_now', ts);
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_draw_internal(_game_id uuid, _offer_id uuid, _user_id uuid, _action text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  o public.game_draw_offers%ROWTYPE;
  new_status text;
BEGIN
  IF _action NOT IN ('decline','cancel') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
  END IF;

  SELECT * INTO o FROM public.game_draw_offers
  WHERE id = _offer_id AND game_id = _game_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'OFFER_NOT_FOUND'); END IF;

  IF _action = 'decline' AND o.offered_to <> _user_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_OFFER_RECIPIENT');
  END IF;
  IF _action = 'cancel' AND o.offered_by <> _user_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_OFFER_SENDER');
  END IF;

  IF o.status <> 'pending' THEN
    -- Idempotent retry after a network failure.
    RETURN jsonb_build_object('ok', true, 'code', 'OFFER_ALREADY_RESOLVED', 'offer', to_jsonb(o));
  END IF;

  new_status := CASE WHEN _action = 'decline' THEN 'declined' ELSE 'cancelled' END;

  UPDATE public.game_draw_offers
  SET status = new_status, responded_at = now()
  WHERE id = o.id RETURNING * INTO o;

  RETURN jsonb_build_object('ok', true, 'code', upper(new_status), 'offer', to_jsonb(o));
END;
$$;

REVOKE ALL ON FUNCTION public.offer_draw_internal(uuid, uuid, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.accept_draw_internal(uuid, uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.respond_draw_internal(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_draw_offers(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.game_moves_auto_decline_draw() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.games_expire_draw_offers() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.offer_draw_internal(uuid, uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.accept_draw_internal(uuid, uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.respond_draw_internal(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_draw_offers(uuid) TO service_role;