alter table public.app_daily_metrics
add column if not exists unique_visitors integer not null default 0;

update public.app_daily_metrics metrics
set unique_visitors = totals.visitor_count
from (
  select activity_date, count(*)::integer as visitor_count
  from public.app_daily_visitors
  group by activity_date
) totals
where metrics.activity_date = totals.activity_date;

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
  daily_count integer;
begin
  insert into public.app_daily_visitors (activity_date, visitor_hash)
  values (p_activity_date, p_visitor_hash)
  on conflict (activity_date, visitor_hash)
  do update set last_seen = now();

  select count(*)::integer
    into daily_count
  from public.app_daily_visitors
  where activity_date = p_activity_date;

  select count(*)::integer
    into active_count
  from public.app_daily_visitors
  where activity_date = p_activity_date
    and last_seen >= now() - interval '2 minutes';

  insert into public.app_daily_metrics (activity_date, unique_visitors, peak_concurrent, updated_at)
  values (p_activity_date, daily_count, active_count, now())
  on conflict (activity_date)
  do update set
    unique_visitors = excluded.unique_visitors,
    peak_concurrent = greatest(public.app_daily_metrics.peak_concurrent, excluded.peak_concurrent),
    updated_at = now();
end;
$$;

create or replace function public.remove_app_usage(
  p_activity_date date,
  p_visitor_hash text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  daily_count integer;
begin
  delete from public.app_daily_visitors
  where activity_date = p_activity_date
    and visitor_hash = p_visitor_hash;

  select count(*)::integer
    into daily_count
  from public.app_daily_visitors
  where activity_date = p_activity_date;

  update public.app_daily_metrics
  set unique_visitors = daily_count,
      updated_at = now()
  where activity_date = p_activity_date;
end;
$$;

revoke all on function public.record_app_usage(date, text) from public, anon, authenticated;
revoke all on function public.remove_app_usage(date, text) from public, anon, authenticated;
grant execute on function public.record_app_usage(date, text) to service_role;
grant execute on function public.remove_app_usage(date, text) to service_role;
