-- P0.8 — notification outbox (forward-only)

-- 1. Dedupe key on the delivered notifications themselves.
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS event_key text;
CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_event_key
  ON public.notifications (user_id, event_key)
  WHERE event_key IS NOT NULL;

-- 2. Outbox.
CREATE TABLE IF NOT EXISTS public.notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  event_key text NOT NULL UNIQUE,
  schema_version integer NOT NULL DEFAULT 1,
  game_id uuid REFERENCES public.games(id) ON DELETE CASCADE,
  actor_id uuid,
  recipient_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','processing','delivered','failed')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  available_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_outbox_pending
  ON public.notification_outbox (available_at)
  WHERE status IN ('queued','processing');

-- The outbox is internal plumbing: no anon/authenticated grants at all.
GRANT ALL ON public.notification_outbox TO service_role;
ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY "outbox_admin_read" ON public.notification_outbox
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3. Enqueue helper. Called only from inside trusted SECURITY DEFINER code,
-- so it participates in the caller's transaction: a rollback discards it.
CREATE OR REPLACE FUNCTION public.enqueue_notification(
  _event_type text,
  _event_key text,
  _recipient uuid,
  _game_id uuid,
  _actor_id uuid,
  _payload jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _recipient IS NULL OR _event_type IS NULL OR _event_key IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.notification_outbox (
    event_type, event_key, recipient_id, game_id, actor_id, payload
  ) VALUES (
    _event_type,
    _event_key,
    _recipient,
    _game_id,
    _actor_id,
    COALESCE(_payload, '{}'::jsonb)
      || jsonb_build_object(
           'event_type', _event_type,
           'game_id', _game_id,
           'actor_id', _actor_id,
           'url', CASE WHEN _game_id IS NULL THEN NULL ELSE '/game/' || _game_id::text END
         )
  )
  ON CONFLICT (event_key) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_notification(text, text, uuid, uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_notification(text, text, uuid, uuid, uuid, jsonb) TO service_role;

-- 4. Canonical enqueue points — all triggers, all in the authoritative transaction.

CREATE OR REPLACE FUNCTION public.games_enqueue_start_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'active' THEN
    PERFORM public.enqueue_notification(
      'game_started', 'game_started:' || NEW.id::text || ':' || NEW.white_id::text,
      NEW.white_id, NEW.id, NULL,
      jsonb_build_object('color', 'w', 'variant', NEW.variant, 'time_control', NEW.time_control)
    );
    PERFORM public.enqueue_notification(
      'game_started', 'game_started:' || NEW.id::text || ':' || NEW.black_id::text,
      NEW.black_id, NEW.id, NULL,
      jsonb_build_object('color', 'b', 'variant', NEW.variant, 'time_control', NEW.time_control)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS games_enqueue_start_notification ON public.games;
CREATE TRIGGER games_enqueue_start_notification
AFTER INSERT ON public.games
FOR EACH ROW EXECUTE FUNCTION public.games_enqueue_start_notification();

CREATE OR REPLACE FUNCTION public.games_enqueue_end_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status IN ('completed','aborted') AND OLD.status NOT IN ('completed','aborted') THEN
    PERFORM public.enqueue_notification(
      'game_completed', 'game_completed:' || NEW.id::text || ':' || NEW.white_id::text,
      NEW.white_id, NEW.id, NULL,
      jsonb_build_object('result', NEW.result, 'end_reason', NEW.end_reason,
                         'winner_id', NEW.winner_id, 'status', NEW.status)
    );
    PERFORM public.enqueue_notification(
      'game_completed', 'game_completed:' || NEW.id::text || ':' || NEW.black_id::text,
      NEW.black_id, NEW.id, NULL,
      jsonb_build_object('result', NEW.result, 'end_reason', NEW.end_reason,
                         'winner_id', NEW.winner_id, 'status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS games_enqueue_end_notification ON public.games;
CREATE TRIGGER games_enqueue_end_notification
AFTER UPDATE ON public.games
FOR EACH ROW EXECUTE FUNCTION public.games_enqueue_end_notification();

CREATE OR REPLACE FUNCTION public.moves_enqueue_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  g public.games%ROWTYPE;
  mover uuid;
  waiting uuid;
BEGIN
  SELECT * INTO g FROM public.games WHERE id = NEW.game_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Side to move in the resulting FEN is the opponent of the mover.
  IF split_part(NEW.fen, ' ', 2) = 'w' THEN
    mover := g.black_id; waiting := g.white_id;
  ELSE
    mover := g.white_id; waiting := g.black_id;
  END IF;

  PERFORM public.enqueue_notification(
    'opponent_move',
    'opponent_move:' || NEW.game_id::text || ':' || NEW.move_number::text,
    waiting, NEW.game_id, mover,
    jsonb_build_object('san', NEW.san, 'uci', NEW.uci, 'move_number', NEW.move_number)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS moves_enqueue_notification ON public.game_moves;
CREATE TRIGGER moves_enqueue_notification
AFTER INSERT ON public.game_moves
FOR EACH ROW EXECUTE FUNCTION public.moves_enqueue_notification();

CREATE OR REPLACE FUNCTION public.draw_offers_enqueue_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.enqueue_notification(
      'draw_offered', 'draw_offered:' || NEW.id::text,
      NEW.offered_to, NEW.game_id, NEW.offered_by, '{}'::jsonb
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.status <> OLD.status
        AND NEW.status IN ('accepted','declined') THEN
    PERFORM public.enqueue_notification(
      'draw_' || NEW.status, 'draw_' || NEW.status || ':' || NEW.id::text,
      NEW.offered_by, NEW.game_id, NEW.offered_to, '{}'::jsonb
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS draw_offers_enqueue_notification ON public.game_draw_offers;
CREATE TRIGGER draw_offers_enqueue_notification
AFTER INSERT OR UPDATE ON public.game_draw_offers
FOR EACH ROW EXECUTE FUNCTION public.draw_offers_enqueue_notification();

-- 5. Trusted processor. Concurrency-safe, idempotent, retrying with backoff.
CREATE OR REPLACE FUNCTION public.process_notification_outbox(_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r public.notification_outbox%ROWTYPE;
  delivered integer := 0;
  failed integer := 0;
  claimed integer := 0;
  n_title text;
  n_body text;
BEGIN
  FOR r IN
    SELECT * FROM public.notification_outbox
    WHERE status IN ('queued','processing')
      AND available_at <= now()
      AND attempts < max_attempts
    ORDER BY available_at ASC
    LIMIT GREATEST(1, LEAST(COALESCE(_limit, 50), 200))
    FOR UPDATE SKIP LOCKED
  LOOP
    claimed := claimed + 1;
    BEGIN
      SELECT
        CASE r.event_type
          WHEN 'game_started' THEN 'Đã tìm được đối thủ'
          WHEN 'opponent_move' THEN 'Đến lượt bạn'
          WHEN 'draw_offered' THEN 'Đề nghị hoà'
          WHEN 'draw_accepted' THEN 'Đối thủ đã chấp nhận hoà'
          WHEN 'draw_declined' THEN 'Đối thủ đã từ chối hoà'
          WHEN 'game_completed' THEN
            CASE WHEN r.payload->>'result' = '1/2-1/2' THEN 'Ván đấu hoà' ELSE 'Ván đấu đã kết thúc' END
          ELSE 'Thông báo'
        END,
        CASE r.event_type
          WHEN 'game_started' THEN 'Ván đấu của bạn đã sẵn sàng.'
          WHEN 'opponent_move' THEN 'Đối thủ vừa đi ' || COALESCE(r.payload->>'san', 'một nước') || '.'
          WHEN 'draw_offered' THEN 'Đối thủ đề nghị hoà ván đang chơi.'
          WHEN 'draw_accepted' THEN 'Ván đấu kết thúc với kết quả hoà.'
          WHEN 'draw_declined' THEN 'Ván đấu tiếp tục.'
          WHEN 'game_completed' THEN 'Kết quả: ' || COALESCE(r.payload->>'result', '*') || '.'
          ELSE ''
        END
      INTO n_title, n_body;

      INSERT INTO public.notifications (user_id, type, title, body, data, event_key)
      VALUES (r.recipient_id, r.event_type, n_title, n_body, r.payload, r.event_key)
      ON CONFLICT (user_id, event_key) WHERE event_key IS NOT NULL DO NOTHING;

      UPDATE public.notification_outbox
      SET status = 'delivered', processed_at = now(), attempts = attempts + 1, last_error = NULL
      WHERE id = r.id;
      delivered := delivered + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.notification_outbox
      SET status = CASE WHEN attempts + 1 >= max_attempts THEN 'failed' ELSE 'queued' END,
          attempts = attempts + 1,
          last_error = left(SQLERRM, 500),
          available_at = now() + make_interval(secs => 15 * power(3, attempts)::numeric)
      WHERE id = r.id;
      failed := failed + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('claimed', claimed, 'delivered', delivered,
                            'failed', failed, 'server_now', clock_timestamp());
END;
$$;

REVOKE ALL ON FUNCTION public.process_notification_outbox(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_notification_outbox(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.retry_notification_event(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r public.notification_outbox%ROWTYPE;
BEGIN
  UPDATE public.notification_outbox
  SET status = 'queued', attempts = 0, available_at = now(), last_error = NULL
  WHERE id = _id AND status = 'failed'
  RETURNING * INTO r;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'NOT_RETRYABLE'); END IF;
  RETURN jsonb_build_object('ok', true, 'code', 'REQUEUED', 'event', to_jsonb(r));
END;
$$;

REVOKE ALL ON FUNCTION public.retry_notification_event(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.retry_notification_event(uuid) TO service_role;

-- 6. Stop the old in-transaction direct inserts: matchmaking and draw offers
-- now rely on the triggers above instead of writing notifications themselves.
CREATE OR REPLACE FUNCTION public.offer_draw_internal(_game_id uuid, _user_id uuid, _expected_version integer, _idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Notification is enqueued by draw_offers_enqueue_notification (P0.8 outbox).
  RETURN jsonb_build_object('ok', true, 'code', 'OFFER_CREATED', 'offer', to_jsonb(o));
END;
$function$;