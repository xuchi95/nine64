-- P0.9: distributed, atomic rate limiting shared by every server instance.
create table if not exists public.rate_limit_counters (
  bucket_key text primary key,
  window_start timestamptz not null default now(),
  window_seconds integer not null,
  count integer not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists rate_limit_counters_updated_at_idx
  on public.rate_limit_counters (updated_at);

alter table public.rate_limit_counters enable row level security;

revoke all on public.rate_limit_counters from anon, authenticated;
grant all on public.rate_limit_counters to service_role;

create or replace function public.consume_rate_limit(
  _key text,
  _window_seconds integer,
  _limit integer,
  _cost integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_row public.rate_limit_counters;
  v_reset timestamptz;
begin
  if _key is null or length(_key) = 0 then
    raise exception 'rate limit key required';
  end if;
  if _window_seconds < 1 or _limit < 0 or _cost < 0 then
    raise exception 'invalid rate limit parameters';
  end if;

  insert into public.rate_limit_counters as c (bucket_key, window_start, window_seconds, count, updated_at)
  values (_key, v_now, _window_seconds, 0, v_now)
  on conflict (bucket_key) do update
    set window_start = case
          when c.window_start + make_interval(secs => _window_seconds) <= v_now then v_now
          else c.window_start
        end,
        count = case
          when c.window_start + make_interval(secs => _window_seconds) <= v_now then 0
          else c.count
        end,
        window_seconds = _window_seconds,
        updated_at = v_now
  returning * into v_row;

  v_reset := v_row.window_start + make_interval(secs => _window_seconds);

  if v_row.count + _cost > _limit then
    return jsonb_build_object(
      'allowed', false,
      'limit', _limit,
      'remaining', greatest(_limit - v_row.count, 0),
      'reset_at', v_reset,
      'retry_after_seconds', greatest(ceil(extract(epoch from (v_reset - v_now)))::int, 1)
    );
  end if;

  update public.rate_limit_counters
     set count = v_row.count + _cost,
         updated_at = v_now
   where bucket_key = _key;

  return jsonb_build_object(
    'allowed', true,
    'limit', _limit,
    'remaining', _limit - (v_row.count + _cost),
    'reset_at', v_reset,
    'retry_after_seconds', 0
  );
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer, integer) to service_role;

create or replace function public.purge_rate_limit_counters(_older_than_hours integer default 48)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_deleted integer;
begin
  delete from public.rate_limit_counters
   where updated_at < now() - make_interval(hours => greatest(_older_than_hours, 1));
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_rate_limit_counters(integer) from public, anon, authenticated;
grant execute on function public.purge_rate_limit_counters(integer) to service_role;