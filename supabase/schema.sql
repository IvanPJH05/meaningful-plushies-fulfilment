create extension if not exists pgcrypto;

create table if not exists public.fulfilment_orders (
  id text primary key,
  order_number text not null,
  status text not null default 'new_order',
  order_date timestamptz,
  updated_at timestamptz not null default now(),
  data jsonb not null
);

create index if not exists fulfilment_orders_number_idx
  on public.fulfilment_orders ((order_number::bigint), id);
create index if not exists fulfilment_orders_status_idx
  on public.fulfilment_orders (status);
create index if not exists fulfilment_orders_updated_idx
  on public.fulfilment_orders (updated_at desc);

create table if not exists public.activity_events (
  id text primary key,
  order_number text,
  action text not null,
  detail text not null default '',
  actor text not null default 'System',
  created_at timestamptz not null default now()
);

create index if not exists activity_events_created_idx
  on public.activity_events (created_at desc);

alter table public.fulfilment_orders enable row level security;
alter table public.activity_events enable row level security;

drop policy if exists "shared dashboard reads orders" on public.fulfilment_orders;
drop policy if exists "shared dashboard inserts orders" on public.fulfilment_orders;
drop policy if exists "shared dashboard updates orders" on public.fulfilment_orders;
drop policy if exists "shared dashboard deletes orders" on public.fulfilment_orders;
create policy "shared dashboard reads orders" on public.fulfilment_orders for select to anon, authenticated using (true);
create policy "shared dashboard inserts orders" on public.fulfilment_orders for insert to anon, authenticated with check (true);
create policy "shared dashboard updates orders" on public.fulfilment_orders for update to anon, authenticated using (true) with check (true);
create policy "shared dashboard deletes orders" on public.fulfilment_orders for delete to anon, authenticated using (true);

drop policy if exists "shared dashboard reads activity" on public.activity_events;
drop policy if exists "shared dashboard inserts activity" on public.activity_events;
create policy "shared dashboard reads activity" on public.activity_events for select to anon, authenticated using (true);
create policy "shared dashboard inserts activity" on public.activity_events for insert to anon, authenticated with check (true);

grant select, insert, update, delete on public.fulfilment_orders to anon, authenticated;
grant select, insert on public.activity_events to anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'fulfilment_orders'
  ) then
    alter publication supabase_realtime add table public.fulfilment_orders;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'activity_events'
  ) then
    alter publication supabase_realtime add table public.activity_events;
  end if;
end $$;
