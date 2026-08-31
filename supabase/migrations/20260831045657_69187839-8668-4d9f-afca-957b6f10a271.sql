-- Service-only tables: make the "no access for users" rule explicit.
create policy "engine_move_jobs_no_client_access"
  on public.engine_move_jobs
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "rate_limit_counters_no_client_access"
  on public.rate_limit_counters
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- Trigger-only helper must never be callable as an API function.
revoke all on function public.admin_audit_require_reason() from public, anon, authenticated;