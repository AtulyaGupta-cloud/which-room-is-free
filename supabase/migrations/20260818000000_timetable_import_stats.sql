create table if not exists public.app_timetable_import_devices (
  visitor_hash text primary key,
  first_imported_at timestamptz not null default now(),
  last_imported_at timestamptz not null default now(),
  import_count integer not null default 1
);

alter table public.app_timetable_import_devices enable row level security;
revoke all on public.app_timetable_import_devices from anon, authenticated;

