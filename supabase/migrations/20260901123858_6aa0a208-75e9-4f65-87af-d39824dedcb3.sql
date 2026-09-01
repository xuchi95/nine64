DROP POLICY IF EXISTS "Users read own deletion jobs" ON public.account_deletion_jobs;
CREATE POLICY "Users read own deletion jobs"
  ON public.account_deletion_jobs FOR SELECT TO authenticated
  USING (user_id = auth.uid());