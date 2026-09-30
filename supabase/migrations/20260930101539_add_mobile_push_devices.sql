-- Registered mobile devices that receive internal staff notifications.
-- The FCM registration token is sensitive operational data, so this table is
-- private and reachable only through the server's service-role client.
create table if not exists public.mobile_push_devices (
  id uuid primary key default gen_random_uuid(),
  account_username text not null,
  token text not null unique,
  platform text not null default 'android',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mobile_push_devices_active_idx
  on public.mobile_push_devices (active, updated_at desc);

alter table public.mobile_push_devices enable row level security;
revoke all on public.mobile_push_devices from anon, authenticated;
