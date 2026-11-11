create table if not exists public.fulfilment_order_summaries (
  id text primary key references public.fulfilment_orders(id) on delete cascade,
  order_number text not null,
  status text not null,
  order_date timestamptz,
  updated_at timestamptz not null,
  data jsonb not null
);

alter table public.fulfilment_order_summaries enable row level security;

grant select, insert, update, delete on public.fulfilment_order_summaries to anon, authenticated;

create policy "shared dashboard reads order summaries"
on public.fulfilment_order_summaries for select to anon, authenticated using (true);
create policy "shared dashboard inserts order summaries"
on public.fulfilment_order_summaries for insert to anon, authenticated with check (true);
create policy "shared dashboard updates order summaries"
on public.fulfilment_order_summaries for update to anon, authenticated using (true) with check (true);
create policy "shared dashboard deletes order summaries"
on public.fulfilment_order_summaries for delete to anon, authenticated using (true);

create index if not exists fulfilment_order_summaries_order_date_idx
  on public.fulfilment_order_summaries (order_date desc nulls last);
create index if not exists fulfilment_order_summaries_updated_at_idx
  on public.fulfilment_order_summaries (updated_at asc);

create schema if not exists internal;

create or replace function internal.fulfilment_order_summary_payload(source_data jsonb)
returns jsonb
language sql
immutable
set search_path = pg_catalog
as $$
  select source_data - 'tikTokFileDataUrl' - 'photoDataUrl'
$$;

create or replace function internal.sync_fulfilment_order_summary()
returns trigger
language plpgsql
set search_path = public, internal, pg_temp
as $$
begin
  insert into public.fulfilment_order_summaries (id, order_number, status, order_date, updated_at, data)
  values (new.id, new.order_number, new.status, new.order_date, new.updated_at, internal.fulfilment_order_summary_payload(new.data))
  on conflict (id) do update set
    order_number = excluded.order_number,
    status = excluded.status,
    order_date = excluded.order_date,
    updated_at = excluded.updated_at,
    data = excluded.data;
  return new;
end;
$$;

revoke all on function internal.fulfilment_order_summary_payload(jsonb) from public;
revoke all on function internal.sync_fulfilment_order_summary() from public;

create trigger fulfilment_order_summary_sync
after insert or update on public.fulfilment_orders
for each row execute function internal.sync_fulfilment_order_summary();

insert into public.fulfilment_order_summaries (id, order_number, status, order_date, updated_at, data)
select id, order_number, status, order_date, updated_at, internal.fulfilment_order_summary_payload(data)
from public.fulfilment_orders
on conflict (id) do update set
  order_number = excluded.order_number,
  status = excluded.status,
  order_date = excluded.order_date,
  updated_at = excluded.updated_at,
  data = excluded.data;
