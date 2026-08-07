create table if not exists public.app_daily_visitors (
  activity_date date not null,
  visitor_hash text not null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (activity_date, visitor_hash)
);

create table if not exists public.app_daily_metrics (
  activity_date date primary key,
  peak_concurrent integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.app_daily_visitors enable row level security;
alter table public.app_daily_metrics enable row level security;

revoke all on public.app_daily_visitors from anon, authenticated;
revoke all on public.app_daily_metrics from anon, authenticated;

create or replace function public.record_app_usage(
  p_activity_date date,
  p_visitor_hash text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  active_count integer;
begin
  insert into public.app_daily_visitors (activity_date, visitor_hash)
  values (p_activity_date, p_visitor_hash)
  on conflict (activity_date, visitor_hash)
  do update set last_seen = now();

  select count(*)::integer
    into active_count
  from public.app_daily_visitors
  where activity_date = p_activity_date
    and last_seen >= now() - interval '2 minutes';

  insert into public.app_daily_metrics (activity_date, peak_concurrent, updated_at)
  values (p_activity_date, active_count, now())
  on conflict (activity_date)
  do update set
    peak_concurrent = greatest(public.app_daily_metrics.peak_concurrent, excluded.peak_concurrent),
    updated_at = now();
end;
$$;

create or replace function public.remove_app_usage(
  p_activity_date date,
  p_visitor_hash text
)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.app_daily_visitors
  where activity_date = p_activity_date
    and visitor_hash = p_visitor_hash;
$$;

revoke all on function public.record_app_usage(date, text) from public, anon, authenticated;
revoke all on function public.remove_app_usage(date, text) from public, anon, authenticated;
grant execute on function public.record_app_usage(date, text) to service_role;
grant execute on function public.remove_app_usage(date, text) to service_role;
