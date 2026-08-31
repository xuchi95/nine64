CREATE TABLE public.studies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  mode text NOT NULL DEFAULT 'study' CHECK (mode IN ('game','position','annotated','study')),
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','unlisted','public')),
  revoked boolean NOT NULL DEFAULT false,
  content jsonb NOT NULL DEFAULT '{"chapters": []}'::jsonb,
  preview_fen text NOT NULL DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  white text,
  black text,
  result text,
  engine_allowed boolean NOT NULL DEFAULT true,
  view_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX studies_owner_idx ON public.studies (owner_id, updated_at DESC);
CREATE INDEX studies_public_idx ON public.studies (visibility, updated_at DESC) WHERE revoked = false;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.studies TO authenticated;
GRANT SELECT ON public.studies TO anon;
GRANT ALL ON public.studies TO service_role;

ALTER TABLE public.studies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "studies_owner_all" ON public.studies FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY "studies_public_read" ON public.studies FOR SELECT TO anon, authenticated
  USING (visibility = 'public' AND revoked = false);

CREATE TRIGGER studies_set_updated_at BEFORE UPDATE ON public.studies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.get_study_by_slug(_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(s) - 'owner_id' || jsonb_build_object(
    'owner_name', (SELECT p.display_name FROM public.profiles p WHERE p.id = s.owner_id)
  )
  FROM public.studies s
  WHERE s.slug = _slug
    AND s.revoked = false
    AND s.visibility IN ('public','unlisted');
$$;

GRANT EXECUTE ON FUNCTION public.get_study_by_slug(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.bump_study_view(_slug text)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.studies
  SET view_count = view_count + 1
  WHERE slug = _slug AND revoked = false AND visibility IN ('public','unlisted');
$$;

GRANT EXECUTE ON FUNCTION public.bump_study_view(text) TO anon, authenticated, service_role;