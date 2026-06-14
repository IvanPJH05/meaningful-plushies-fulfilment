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

create table if not exists public.payment_processor_settings (
  processor text primary key,
  percentage numeric(8,4) not null default 0 check (percentage >= 0),
  fixed_amount numeric(12,2) not null default 0 check (fixed_amount >= 0),
  updated_at timestamptz not null default now()
);

alter table public.fulfilment_orders enable row level security;
alter table public.activity_events enable row level security;
alter table public.payment_processor_settings enable row level security;

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

drop policy if exists "shared dashboard reads processor settings" on public.payment_processor_settings;
drop policy if exists "shared dashboard inserts processor settings" on public.payment_processor_settings;
drop policy if exists "shared dashboard updates processor settings" on public.payment_processor_settings;
create policy "shared dashboard reads processor settings" on public.payment_processor_settings for select to anon, authenticated using (true);
create policy "shared dashboard inserts processor settings" on public.payment_processor_settings for insert to anon, authenticated with check (true);
create policy "shared dashboard updates processor settings" on public.payment_processor_settings for update to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on public.fulfilment_orders to anon, authenticated;
grant select, insert on public.activity_events to anon, authenticated;
grant select, insert, update on public.payment_processor_settings to anon, authenticated;

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
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'payment_processor_settings'
  ) then
    alter publication supabase_realtime add table public.payment_processor_settings;
  end if;
end $$;
