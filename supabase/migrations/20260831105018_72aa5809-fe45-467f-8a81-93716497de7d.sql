-- ============ Skill Engine (Game Review 3.0) ============

CREATE TABLE public.skill_definitions (
  key text PRIMARY KEY,
  category text NOT NULL CHECK (category IN (
    'fundamentals','opening','tactics','strategy','endgame','calculation','time_management'
  )),
  name_vi text NOT NULL,
  name_en text NOT NULL,
  description_vi text NOT NULL DEFAULT '',
  description_en text NOT NULL DEFAULT '',
  xp_per_event integer NOT NULL DEFAULT 10 CHECK (xp_per_event BETWEEN 1 AND 100),
  mastery_xp integer NOT NULL DEFAULT 300 CHECK (mastery_xp BETWEEN 50 AND 100000),
  thresholds jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.skill_definitions TO authenticated;
GRANT ALL ON public.skill_definitions TO service_role;
ALTER TABLE public.skill_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "skill_definitions_read" ON public.skill_definitions
  FOR SELECT TO authenticated USING (enabled OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER skill_definitions_updated_at
  BEFORE UPDATE ON public.skill_definitions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------

CREATE TABLE public.skill_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_key text NOT NULL REFERENCES public.skill_definitions(key) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'review' CHECK (source IN ('review','puzzle','drill','retry')),
  game_id text,
  ply integer,
  outcome text NOT NULL CHECK (outcome IN ('positive','negative','neutral')),
  xp_delta integer NOT NULL DEFAULT 0,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  event_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_key)
);

CREATE INDEX skill_events_user_created_idx ON public.skill_events (user_id, created_at DESC);
CREATE INDEX skill_events_user_skill_idx ON public.skill_events (user_id, skill_key);

GRANT SELECT ON public.skill_events TO authenticated;
GRANT ALL ON public.skill_events TO service_role;
ALTER TABLE public.skill_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "skill_events_own_read" ON public.skill_events
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ---------------------------------------------------------

CREATE TABLE public.user_skill_progress (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_key text NOT NULL REFERENCES public.skill_definitions(key) ON DELETE CASCADE,
  xp integer NOT NULL DEFAULT 0 CHECK (xp >= 0),
  level integer NOT NULL DEFAULT 0 CHECK (level >= 0),
  positive_events integer NOT NULL DEFAULT 0,
  negative_events integer NOT NULL DEFAULT 0,
  last_event_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, skill_key)
);

GRANT SELECT ON public.user_skill_progress TO authenticated;
GRANT ALL ON public.user_skill_progress TO service_role;
ALTER TABLE public.user_skill_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_skill_progress_own_read" ON public.user_skill_progress
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TRIGGER user_skill_progress_updated_at
  BEFORE UPDATE ON public.user_skill_progress
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------

CREATE TABLE public.training_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fen text NOT NULL,
  solution jsonb NOT NULL DEFAULT '[]'::jsonb,
  skill_key text REFERENCES public.skill_definitions(key) ON DELETE SET NULL,
  source_game_id text,
  ply integer,
  label text NOT NULL DEFAULT '',
  srs jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, fen)
);

CREATE INDEX training_cards_user_idx ON public.training_cards (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_cards TO authenticated;
GRANT ALL ON public.training_cards TO service_role;
ALTER TABLE public.training_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "training_cards_own_all" ON public.training_cards
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TRIGGER training_cards_updated_at
  BEFORE UPDATE ON public.training_cards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------
-- Trusted writer: XP always comes from the definition row, never the client.

CREATE OR REPLACE FUNCTION public.record_skill_events(_events jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _item jsonb;
  _def public.skill_definitions%ROWTYPE;
  _outcome text;
  _xp integer;
  _inserted integer := 0;
  _skipped integer := 0;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;
  IF jsonb_typeof(_events) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD';
  END IF;
  IF jsonb_array_length(_events) > 200 THEN
    RAISE EXCEPTION 'TOO_MANY_EVENTS';
  END IF;

  FOR _item IN SELECT * FROM jsonb_array_elements(_events) LOOP
    SELECT * INTO _def FROM public.skill_definitions
      WHERE key = _item->>'skill_key' AND enabled;
    IF NOT FOUND THEN
      _skipped := _skipped + 1;
      CONTINUE;
    END IF;

    _outcome := coalesce(_item->>'outcome', 'neutral');
    IF _outcome NOT IN ('positive','negative','neutral') THEN
      _skipped := _skipped + 1;
      CONTINUE;
    END IF;

    _xp := CASE _outcome
      WHEN 'positive' THEN _def.xp_per_event
      WHEN 'negative' THEN 0
      ELSE 0
    END;

    INSERT INTO public.skill_events (
      user_id, skill_key, source, game_id, ply, outcome, xp_delta, detail, event_key
    ) VALUES (
      _uid,
      _def.key,
      coalesce(_item->>'source', 'review'),
      nullif(_item->>'game_id', ''),
      nullif(_item->>'ply', '')::integer,
      _outcome,
      _xp,
      coalesce(_item->'detail', '{}'::jsonb),
      coalesce(nullif(_item->>'event_key', ''), gen_random_uuid()::text)
    )
    ON CONFLICT (user_id, event_key) DO NOTHING;

    IF NOT FOUND THEN
      _skipped := _skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.user_skill_progress AS p (
      user_id, skill_key, xp, level, positive_events, negative_events, last_event_at
    ) VALUES (
      _uid,
      _def.key,
      _xp,
      0,
      CASE WHEN _outcome = 'positive' THEN 1 ELSE 0 END,
      CASE WHEN _outcome = 'negative' THEN 1 ELSE 0 END,
      now()
    )
    ON CONFLICT (user_id, skill_key) DO UPDATE SET
      xp = p.xp + _xp,
      positive_events = p.positive_events + CASE WHEN _outcome = 'positive' THEN 1 ELSE 0 END,
      negative_events = p.negative_events + CASE WHEN _outcome = 'negative' THEN 1 ELSE 0 END,
      level = LEAST(5, ((p.xp + _xp) * 5) / GREATEST(_def.mastery_xp, 1)),
      last_event_at = now();

    _inserted := _inserted + 1;
  END LOOP;

  RETURN jsonb_build_object('inserted', _inserted, 'skipped', _skipped);
END;
$$;

REVOKE ALL ON FUNCTION public.record_skill_events(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_skill_events(jsonb) TO authenticated;

-- ---------------------------------------------------------
-- Admin-only definition upsert (audited by the app layer).

CREATE OR REPLACE FUNCTION public.admin_upsert_skill_definition(
  _key text,
  _category text,
  _name_vi text,
  _name_en text,
  _description_vi text,
  _description_en text,
  _xp_per_event integer,
  _mastery_xp integer,
  _thresholds jsonb,
  _enabled boolean,
  _sort_order integer
)
RETURNS public.skill_definitions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.skill_definitions%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  INSERT INTO public.skill_definitions AS s (
    key, category, name_vi, name_en, description_vi, description_en,
    xp_per_event, mastery_xp, thresholds, enabled, sort_order, updated_by
  ) VALUES (
    _key, _category, _name_vi, _name_en, coalesce(_description_vi,''), coalesce(_description_en,''),
    _xp_per_event, _mastery_xp, coalesce(_thresholds,'{}'::jsonb), _enabled, _sort_order, auth.uid()
  )
  ON CONFLICT (key) DO UPDATE SET
    category = EXCLUDED.category,
    name_vi = EXCLUDED.name_vi,
    name_en = EXCLUDED.name_en,
    description_vi = EXCLUDED.description_vi,
    description_en = EXCLUDED.description_en,
    xp_per_event = EXCLUDED.xp_per_event,
    mastery_xp = EXCLUDED.mastery_xp,
    thresholds = EXCLUDED.thresholds,
    enabled = EXCLUDED.enabled,
    sort_order = EXCLUDED.sort_order,
    updated_by = auth.uid()
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_skill_definition(text,text,text,text,text,text,integer,integer,jsonb,boolean,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_upsert_skill_definition(text,text,text,text,text,text,integer,integer,jsonb,boolean,integer) TO authenticated;

-- ---------------------------------------------------------
-- Seed catalogue

INSERT INTO public.skill_definitions
  (key, category, name_vi, name_en, description_vi, description_en, xp_per_event, mastery_xp, sort_order)
VALUES
  ('development','fundamentals','Phát triển quân','Development','Đưa quân ra khỏi vị trí ban đầu sớm và hợp lý.','Bring pieces out early and purposefully.',10,300,10),
  ('king_safety','fundamentals','An toàn của vua','King safety','Nhập thành đúng lúc và giữ vua an toàn.','Castle in time and keep the king safe.',10,300,20),
  ('center_control','fundamentals','Kiểm soát trung tâm','Center control','Chiếm và giữ các ô trung tâm.','Occupy and contest the central squares.',10,300,30),
  ('piece_safety','fundamentals','Giữ quân','Piece safety','Không để quân bị bắt không công.','Avoid leaving pieces hanging.',10,300,40),
  ('opening_principles','opening','Nguyên tắc khai cuộc','Opening principles','Đi theo các nước chuẩn của khai cuộc.','Follow sound opening theory.',10,300,50),
  ('opening_repertoire','opening','Vốn khai cuộc','Opening repertoire','Nắm vững hệ thống khai cuộc thường chơi.','Know your main opening systems.',10,400,60),
  ('fork','tactics','Đòn chĩa đôi','Fork','Nhận ra và thực hiện đòn chĩa đôi.','Spot and execute forks.',12,300,70),
  ('pin','tactics','Đòn ghim','Pin','Sử dụng và hoá giải đòn ghim.','Use and break pins.',12,300,80),
  ('skewer','tactics','Đòn xiên','Skewer','Nhận ra đòn xiên.','Spot skewers.',12,300,90),
  ('discovered_attack','tactics','Đòn mở đường','Discovered attack','Khai thác đòn tấn công mở đường.','Exploit discovered attacks.',12,300,100),
  ('removing_defender','tactics','Loại bỏ quân phòng thủ','Removing the defender','Đánh bật quân đang bảo vệ.','Eliminate a key defender.',12,300,110),
  ('mating_net','tactics','Lưới chiếu hết','Mating net','Dựng lưới chiếu hết.','Build a mating net.',12,350,120),
  ('prophylaxis','strategy','Phòng ngừa','Prophylaxis','Ngăn ý đồ của đối thủ trước khi nó xảy ra.','Stop the opponent''s plan in advance.',12,400,130),
  ('rook_activity','strategy','Xe hoạt động','Rook activity','Đưa xe vào cột mở và hàng 7.','Activate rooks on open files and the 7th rank.',10,350,140),
  ('pawn_structure','strategy','Cấu trúc tốt','Pawn structure','Giữ cấu trúc tốt lành mạnh.','Maintain a healthy pawn structure.',10,350,150),
  ('passed_pawn','endgame','Tốt thông','Passed pawn','Tạo và đẩy tốt thông.','Create and push passed pawns.',12,350,160),
  ('king_opposition','endgame','Đối mặt vua','King opposition','Dùng thế đối mặt trong tàn cuộc vua–tốt.','Use opposition in king and pawn endings.',12,350,170),
  ('conversion','endgame','Chuyển hoá ưu thế','Conversion','Biến ưu thế thành chiến thắng.','Convert an advantage into a win.',12,400,180),
  ('calculation_depth','calculation','Tính toán','Calculation','Tính đủ sâu trong thế phức tạp.','Calculate accurately in sharp positions.',12,450,190),
  ('defence','calculation','Phòng thủ','Defence','Tìm nước phòng thủ tốt nhất khi bị ép.','Find the best defensive resource under pressure.',12,400,200),
  ('time_management','time_management','Quản lý thời gian','Time management','Phân bổ thời gian hợp lý cho từng nước.','Spend clock time where it matters.',10,300,210)
ON CONFLICT (key) DO NOTHING;