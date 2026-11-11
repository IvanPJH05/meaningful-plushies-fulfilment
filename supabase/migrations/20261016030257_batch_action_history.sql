create table public.fulfilment_batch_events (
  id bigint generated always as identity primary key,
  batch_id uuid not null references public.fulfilment_batches(id) on delete restrict,
  action text not null,
  batch_version integer,
  actor text not null,
  created_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb,
  unique(batch_id,batch_version)
);
create index fulfilment_batch_events_timeline_idx on public.fulfilment_batch_events(batch_id,id desc);
create index fulfilment_batches_active_idx on public.fulfilment_batches(number desc) where stage <> 'complete';
alter table public.fulfilment_batch_events enable row level security;
revoke all on public.fulfilment_batch_events from public,anon,authenticated;
grant select,insert on public.fulfilment_batch_events to service_role;
grant usage,select on sequence public.fulfilment_batch_events_id_seq to service_role;

-- Recover only timestamps that were already recorded. Missing historical
-- intermediate actions cannot be reconstructed and are not fabricated.
insert into public.fulfilment_batch_events(batch_id,action,actor,created_at,details)
select id,'created',created_by,created_at,'{"legacy":true}'::jsonb from public.fulfilment_batches;
insert into public.fulfilment_batch_events(batch_id,action,actor,created_at,details)
select m.batch_id,'nfc',coalesce(m.nfc_written_by,'Unknown'),m.nfc_written_at,
  jsonb_build_object('legacy',true,'orderNumbers',jsonb_build_array(o.order_number))
from public.fulfilment_batch_orders m join public.fulfilment_orders o on o.id=m.order_id where m.nfc_written_at is not null;
insert into public.fulfilment_batch_events(batch_id,action,actor,created_at,details)
select id,'completed','Unknown',completed_at,'{"legacy":true}'::jsonb from public.fulfilment_batches where completed_at is not null;

alter function public.mutate_fulfilment_batch(text,uuid,integer,jsonb,text) rename to mutate_fulfilment_batch_internal;
create function public.mutate_fulfilment_batch(p_action text,p_batch_id uuid,p_version integer,p_payload jsonb,p_actor text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare before_stage text; before_version integer; after_stage text; result uuid; numbers jsonb;
begin
  -- Lock before reading so the snapshot and mutation are one transaction.
  select stage,version into before_stage,before_version from public.fulfilment_batches where id=p_batch_id for update;
  result := public.mutate_fulfilment_batch_internal(p_action,p_batch_id,p_version,p_payload,p_actor);
  if (select version from public.fulfilment_batches where id=result) is not distinct from before_version then return result; end if;
  select stage into after_stage from public.fulfilment_batches where id=result;
  select coalesce(jsonb_agg(o.order_number order by o.order_number),'[]'::jsonb) into numbers
  from public.fulfilment_orders o where o.id in (
    select jsonb_array_elements_text(coalesce(p_payload->'orderIds','[]'::jsonb))
    union select item->>'orderId' from jsonb_array_elements(coalesce(p_payload->'labels','[]'::jsonb)) item
    union select p_payload->>'orderId' where p_payload ? 'orderId'
  );
  insert into public.fulfilment_batch_events(batch_id,action,actor,batch_version,details)
  values(result,case when p_action='create' then 'created' else p_action end,p_actor,(select version from public.fulfilment_batches where id=result),
    jsonb_build_object('fromStage',before_stage,'toStage',after_stage,'orderNumbers',numbers)) on conflict(batch_id,batch_version) do nothing;
  if after_stage='complete' and before_stage is distinct from 'complete' then
    insert into public.fulfilment_batch_events(batch_id,action,actor) values(result,'completed',p_actor);
  end if;
  return result;
end;
$$;
revoke all on function public.mutate_fulfilment_batch(text,uuid,integer,jsonb,text) from public,anon,authenticated;
grant execute on function public.mutate_fulfilment_batch(text,uuid,integer,jsonb,text) to service_role;
