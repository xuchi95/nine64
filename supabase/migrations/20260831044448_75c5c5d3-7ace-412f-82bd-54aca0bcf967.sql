-- Drafts must never be visible to the app: remove direct client reads and let
-- the trusted server return only published public_runtime values.
DROP POLICY IF EXISTS "public runtime settings are readable" ON public.system_settings;
REVOKE SELECT ON public.system_settings FROM anon, authenticated;
GRANT SELECT ON public.system_settings TO authenticated; -- admin policy still gates rows