-- Nine64 Academy: versioned course/lesson CMS + learner progress

CREATE TABLE public.learn_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  kind text NOT NULL DEFAULT 'course' CHECK (kind IN ('course','endgame')),
  track text,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  version integer NOT NULL DEFAULT 0,
  draft jsonb NOT NULL DEFAULT '{}'::jsonb,
  published jsonb,
  published_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.learn_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  course_id uuid NOT NULL REFERENCES public.learn_courses(id) ON DELETE CASCADE,
  chapter_id text NOT NULL DEFAULT 'main',
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  version integer NOT NULL DEFAULT 0,
  draft jsonb NOT NULL DEFAULT '{}'::jsonb,
  published jsonb,
  published_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX learn_lessons_course_idx ON public.learn_lessons (course_id, sort_order);

CREATE TABLE public.learn_content_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity text NOT NULL CHECK (entity IN ('course','lesson')),
  entity_id uuid NOT NULL,
  version integer NOT NULL,
  doc jsonb NOT NULL,
  note text,
  actor uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX learn_content_versions_entity_idx ON public.learn_content_versions (entity, entity_id, version DESC);

CREATE TABLE public.learn_progress (
  user_id uuid NOT NULL,
  lesson_id uuid NOT NULL REFERENCES public.learn_lessons(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('not_started','in_progress','completed')),
  attempts integer NOT NULL DEFAULT 0,
  mastery numeric(5,2) NOT NULL DEFAULT 0,
  best_score numeric(5,2) NOT NULL DEFAULT 0,
  last_score numeric(5,2) NOT NULL DEFAULT 0,
  last_studied_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, lesson_id)
);

CREATE TABLE public.learn_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lesson_id uuid NOT NULL REFERENCES public.learn_lessons(id) ON DELETE CASCADE,
  step_id text NOT NULL,
  difficulty numeric(6,3) NOT NULL DEFAULT 5.6,
  stability numeric(8,3) NOT NULL DEFAULT 0,
  reps integer NOT NULL DEFAULT 0,
  lapses integer NOT NULL DEFAULT 0,
  due_at timestamptz NOT NULL DEFAULT now(),
  last_review timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, lesson_id, step_id)
);
CREATE INDEX learn_cards_due_idx ON public.learn_cards (user_id, due_at);

-- Grants: published content is world-readable column-by-column (drafts stay private)
GRANT SELECT (id, slug, kind, track, sort_order, status, version, published, published_at, updated_at)
  ON public.learn_courses TO anon, authenticated;
GRANT ALL ON public.learn_courses TO service_role;

GRANT SELECT (id, slug, course_id, chapter_id, sort_order, status, version, published, published_at, updated_at)
  ON public.learn_lessons TO anon, authenticated;
GRANT ALL ON public.learn_lessons TO service_role;

GRANT ALL ON public.learn_content_versions TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.learn_progress TO authenticated;
GRANT ALL ON public.learn_progress TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.learn_cards TO authenticated;
GRANT ALL ON public.learn_cards TO service_role;

ALTER TABLE public.learn_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learn_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learn_content_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learn_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learn_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published courses are readable"
  ON public.learn_courses FOR SELECT TO anon, authenticated
  USING (status = 'published');

CREATE POLICY "Published lessons are readable"
  ON public.learn_lessons FOR SELECT TO anon, authenticated
  USING (status = 'published');

CREATE POLICY "Version history is admin/service only"
  ON public.learn_content_versions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Learners manage their own lesson progress"
  ON public.learn_progress FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Learners manage their own review cards"
  ON public.learn_cards FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER learn_courses_updated_at BEFORE UPDATE ON public.learn_courses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER learn_lessons_updated_at BEFORE UPDATE ON public.learn_lessons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER learn_progress_updated_at BEFORE UPDATE ON public.learn_progress
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER learn_cards_updated_at BEFORE UPDATE ON public.learn_cards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();