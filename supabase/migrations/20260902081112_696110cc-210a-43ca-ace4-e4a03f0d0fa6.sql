CREATE OR REPLACE FUNCTION public.enqueue_notification(_event_type text, _event_key text, _recipient uuid, _game_id uuid, _actor_id uuid, _payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _recipient IS NULL OR _event_type IS NULL OR _event_key IS NULL THEN
    RETURN;
  END IF;

  -- AI opponents are not people: never queue notifications for them.
  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _recipient AND p.is_ai) THEN
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
$function$;

CREATE OR REPLACE FUNCTION public.games_enqueue_fairplay_job()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Games against a Nine64 AI opponent are engine games by design; running
  -- cheat detection on them would only produce meaningless signals.
  IF COALESCE(NEW.ai_game, false) THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
    INSERT INTO public.fairplay_jobs (game_id, analyzer_version)
    VALUES (NEW.id, public.fairplay_analyzer_version())
    ON CONFLICT (game_id, analyzer_version) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;