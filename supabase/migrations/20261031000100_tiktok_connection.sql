-- Secrets and OAuth state are accessible only by the server service role.
create table public.tiktok_connection (
  id boolean primary key default true check (id),
  shop_id text not null,
  shop_cipher text not null,
  shop_name text not null,
  access_token text not null,
  refresh_token text not null,
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz not null,
  granted_scopes jsonb not null default '[]',
  refresh_lock_until timestamptz not null default '-infinity',
  last_sync_at timestamptz,
  recovery_page text not null default '',
  recovery_since bigint,
  recovery_until bigint,
  updated_at timestamptz not null default now()
);
create table public.tiktok_oauth_states (
  state_hash text primary key,
  session_token uuid not null,
  expires_at timestamptz not null
);
create table public.tiktok_webhook_events (
  id text primary key,
  shop_id text not null,
  event_type text not null,
  order_ids jsonb not null,
  state text not null default 'pending' check (state in ('pending','processing','complete')),
  attempts integer not null default 0,
  lease_until timestamptz not null default '-infinity',
  received_at timestamptz not null default now()
);
alter table public.tiktok_connection enable row level security;
alter table public.tiktok_oauth_states enable row level security;
alter table public.tiktok_webhook_events enable row level security;
revoke all on public.tiktok_connection, public.tiktok_oauth_states, public.tiktok_webhook_events from public, anon, authenticated;
grant select, insert, update, delete on public.tiktok_connection, public.tiktok_oauth_states, public.tiktok_webhook_events to service_role;

-- One worker across all server instances, serializes TT numbering and saves.
create table public.tiktok_sync_lock (id boolean primary key default true check(id), owner uuid, lease_until timestamptz not null default '-infinity');
insert into public.tiktok_sync_lock(id) values(true);
alter table public.tiktok_sync_lock enable row level security;
revoke all on public.tiktok_sync_lock from public, anon, authenticated;
grant select, update on public.tiktok_sync_lock to service_role;

create table public.tiktok_order_counter (id boolean primary key default true check(id), value bigint not null);
insert into public.tiktok_order_counter(id,value)
  select true, greatest(1026, coalesce(max(substring(order_number from '^TT([0-9]+)')::bigint),0)) from public.fulfilment_orders where order_number ~ '^TT[0-9]+';
alter table public.tiktok_order_counter enable row level security;
revoke all on public.tiktok_order_counter from public, anon, authenticated;
grant select, update on public.tiktok_order_counter to service_role;
create function public.reserve_tiktok_order_number() returns bigint language sql security invoker set search_path = '' as $$
  update public.tiktok_order_counter set value = value + 1 where id = true returning value;
$$;
revoke all on function public.reserve_tiktok_order_number() from public, anon, authenticated;
grant execute on function public.reserve_tiktok_order_number() to service_role;
