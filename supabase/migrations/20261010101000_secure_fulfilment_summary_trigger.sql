revoke all on schema internal from public;

create or replace function internal.sync_fulfilment_order_summary()
returns trigger
language plpgsql
security definer
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

revoke all on function internal.sync_fulfilment_order_summary() from public;
