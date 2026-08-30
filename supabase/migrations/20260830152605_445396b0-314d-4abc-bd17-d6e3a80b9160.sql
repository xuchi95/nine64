-- lovable-cron-fallback-reviewed: 1440 runs/day; chess flag-fall must finalize within ~1 minute even when both players close the tab, and there is no row-change event to trigger on (the deadline passes with no writes).
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'nine64-finalize-expired-games',
  '* * * * *',
  $$SELECT public.finalize_expired_games(200);$$
);