create table if not exists public.app_installed_devices (
  device_hash text primary key,
  platform text not null default 'unknown',
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

create table if not exists public.app_push_subscriptions (
  endpoint text primary key,
  device_hash text not null,
  subscription jsonb not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

create index if not exists app_push_subscriptions_device_hash_idx
  on public.app_push_subscriptions(device_hash);

alter table public.app_installed_devices enable row level security;
alter table public.app_push_subscriptions enable row level security;

revoke all on public.app_installed_devices from anon, authenticated;
revoke all on public.app_push_subscriptions from anon, authenticated;
grant all on public.app_installed_devices to service_role;
grant all on public.app_push_subscriptions to service_role;

