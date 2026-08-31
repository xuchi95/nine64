-- Forward-only: harden admin_audit_log for the Admin Center.

-- 1. Allowlist of admin actions (NOT VALID so historical rows are untouched).
ALTER TABLE public.admin_audit_log
  DROP CONSTRAINT IF EXISTS admin_audit_log_action_allowed;

ALTER TABLE public.admin_audit_log
  ADD CONSTRAINT admin_audit_log_action_allowed CHECK (
    action IN (
      'case_list_view','case_view','metrics_view','decision_log_view','audit_log_view',
      'rating_hold','clear_warning','unlock','fairplay_job_retry',
      'system_console_view','ratelimit_reset',
      'dashboard_view','user_list_view','user_view','user_suspend','user_unsuspend',
      'user_role_change','user_force_logout','user_anonymize_request','rating_adjustment',
      'system_setting_publish','system_setting_rollback','maintenance_change','feature_flag_change',
      'engine_profile_publish','engine_profile_rollback','engine_benchmark_run',
      'ai_prompt_publish','ai_prompt_rollback'
    )
  ) NOT VALID;

-- 2. Mutating actions must carry a non-empty reason.
CREATE OR REPLACE FUNCTION public.admin_audit_require_reason()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.action IN (
    'rating_hold','clear_warning','unlock','fairplay_job_retry','ratelimit_reset',
    'user_suspend','user_unsuspend','user_role_change','user_force_logout',
    'user_anonymize_request','rating_adjustment','system_setting_publish',
    'system_setting_rollback','maintenance_change','feature_flag_change',
    'engine_profile_publish','engine_profile_rollback','engine_benchmark_run',
    'ai_prompt_publish','ai_prompt_rollback'
  ) AND (NEW.note IS NULL OR btrim(NEW.note) = '') THEN
    RAISE EXCEPTION 'AUDIT_REASON_REQUIRED for action %', NEW.action;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_audit_require_reason() FROM PUBLIC;

DROP TRIGGER IF EXISTS admin_audit_require_reason_trg ON public.admin_audit_log;
CREATE TRIGGER admin_audit_require_reason_trg
  BEFORE INSERT ON public.admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.admin_audit_require_reason();

-- 3. Grants: no direct writes from the app; admin reads go through RLS.
REVOKE INSERT, UPDATE, DELETE ON public.admin_audit_log FROM anon, authenticated;
REVOKE ALL ON public.admin_audit_log FROM anon;
GRANT SELECT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read audit log" ON public.admin_audit_log;
CREATE POLICY "Admins read audit log"
  ON public.admin_audit_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

-- 4. Roles are never self-assignable from the client.
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM anon, authenticated;