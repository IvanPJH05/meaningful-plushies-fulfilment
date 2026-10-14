create table public.fulfilment_batches (
  id uuid primary key,
  number bigint generated always as identity unique,
  stage text not null default 'labels' check (stage in ('labels','printing','envelopes','audio','nfc','complete')),
  version integer not null default 1,
  envelope_names jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by text not null,
  completed_at timestamptz
);
create table public.fulfilment_batch_orders (
  order_id text primary key references public.fulfilment_orders(id) on delete restrict,
  batch_id uuid not null references public.fulfilment_batches(id) on delete restrict,
  nfc_written_at timestamptz,
  nfc_written_by text
);
create index fulfilment_batch_orders_batch_idx on public.fulfilment_batch_orders(batch_id);
alter table public.fulfilment_batches enable row level security;
alter table public.fulfilment_batch_orders enable row level security;
revoke all on public.fulfilment_batches, public.fulfilment_batch_orders from public, anon, authenticated;
grant all on public.fulfilment_batches, public.fulfilment_batch_orders to service_role;
grant usage, select on sequence public.fulfilment_batches_number_seq to service_role;

-- Only authenticated warehouse API handlers may call this transaction.
create function public.mutate_fulfilment_batch(p_action text, p_batch_id uuid, p_version integer, p_payload jsonb, p_actor text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  b public.fulfilment_batches;
  item jsonb;
  ids jsonb;
  transitions jsonb;
  next_stage text;
begin
  if p_action = 'create' then
    insert into public.fulfilment_batches(id, created_by) values(p_batch_id, p_actor) on conflict (id) do nothing;
    -- Retrying a lost create response must not generate another batch.
    if exists(select 1 from public.fulfilment_batch_orders where batch_id=p_batch_id) then
      if (select created_by from public.fulfilment_batches where id=p_batch_id) <> p_actor
        or exists(select 1 from jsonb_array_elements_text(p_payload->'orderIds') x(value) where not exists(select 1 from public.fulfilment_batch_orders m where m.batch_id=p_batch_id and m.order_id=x.value))
        or (select count(*) from public.fulfilment_batch_orders where batch_id=p_batch_id) <> jsonb_array_length(p_payload->'orderIds') then raise exception 'BATCH_CHANGED'; end if;
      return p_batch_id;
    end if;
  end if;
  select * into b from public.fulfilment_batches where id=p_batch_id for update;
  if not found then raise exception 'BATCH_NOT_FOUND'; end if;
  if p_action <> 'create' and b.version <> p_version then raise exception 'BATCH_CHANGED'; end if;
  if b.stage='complete' then raise exception 'BATCH_COMPLETE'; end if;

  if p_action in ('create','add') then
    if b.stage <> 'labels' then raise exception 'BATCH_ALREADY_STARTED'; end if;
    ids := p_payload->'orderIds';
    if jsonb_typeof(ids) is distinct from 'array' or jsonb_array_length(ids) not between 1 and 200 then raise exception 'INVALID_ORDERS'; end if;
    if (select count(distinct value) from jsonb_array_elements_text(ids)) <> jsonb_array_length(ids) then raise exception 'INVALID_ORDERS'; end if;
    if (select count(*) from public.fulfilment_batch_orders where batch_id=p_batch_id) + jsonb_array_length(ids) > 200 then raise exception 'BATCH_TOO_LARGE'; end if;
    perform o.id from public.fulfilment_orders o where o.id in (select jsonb_array_elements_text(ids)) order by o.id for update;
    if (select count(*) from public.fulfilment_orders o where o.id in (select jsonb_array_elements_text(ids))) <> jsonb_array_length(ids) then raise exception 'ORDER_NOT_FOUND'; end if;
    if exists(select 1 from public.fulfilment_orders o where o.id in (select jsonb_array_elements_text(ids)) and o.status not in ('new_order','uploading_audio')) then raise exception 'ORDER_STAGE_NOT_READY'; end if;
    insert into public.fulfilment_batch_orders(order_id,batch_id) select jsonb_array_elements_text(ids),p_batch_id;
    select coalesce(jsonb_agg(jsonb_build_object('orderId',o.id,'fromStatus','new_order','toStatus','uploading_audio','note','Added to Batch '||b.number)), '[]'::jsonb)
      into transitions from public.fulfilment_orders o where o.id in (select jsonb_array_elements_text(ids)) and o.status='new_order';
    if jsonb_array_length(transitions)>0 then perform public.transition_fulfilment_orders(transitions,p_actor); end if;
  elsif p_action='labels' then
    if b.stage <> 'labels' or jsonb_typeof(p_payload->'labels') is distinct from 'array' then raise exception 'INVALID_STAGE'; end if;
    for item in select value from jsonb_array_elements(p_payload->'labels') loop
      if not exists(select 1 from public.fulfilment_batch_orders where batch_id=p_batch_id and order_id=item->>'orderId') then raise exception 'ORDER_NOT_IN_BATCH'; end if;
      update public.fulfilment_orders o set data=o.data||jsonb_build_object('shippingLabelUrl',item->>'url','shippingLabelFileName',item->>'fileName','shippingLabelSource',item->>'source'),updated_at=now() where o.id=item->>'orderId';
    end loop;
  elsif p_action='envelope_names' then
    if b.stage <> 'envelopes' or jsonb_typeof(p_payload->'names') is distinct from 'object' then raise exception 'INVALID_STAGE'; end if;
    if exists(select 1 from public.fulfilment_batch_orders m where m.batch_id=p_batch_id and length(trim(coalesce(p_payload->'names'->>m.order_id,''))) not between 1 and 60) then raise exception 'ENVELOPE_NAME_REQUIRED'; end if;
    update public.fulfilment_batches set envelope_names=p_payload->'names' where id=p_batch_id;
  elsif p_action='advance' then
    if b.stage <> p_payload->>'stage' then raise exception 'BATCH_CHANGED'; end if;
    next_stage := case b.stage when 'labels' then 'printing' when 'printing' then 'envelopes' when 'envelopes' then 'audio' when 'audio' then 'nfc' end;
    if next_stage is null then raise exception 'INVALID_STAGE'; end if;
    if b.stage='labels' and exists(select 1 from public.fulfilment_batch_orders m join public.fulfilment_orders o on o.id=m.order_id where m.batch_id=p_batch_id and coalesce(o.data->>'shippingLabelUrl','')='' and coalesce(o.data->>'paymentProcessor','') !~* '(\mcod\M|cash[ _]on[ _]delivery)') then raise exception 'SHIPPING_LABEL_REQUIRED'; end if;
    if b.stage='envelopes' and exists(select 1 from public.fulfilment_batch_orders m where m.batch_id=p_batch_id and coalesce(b.envelope_names->>m.order_id,'')='') then raise exception 'ENVELOPE_NAME_REQUIRED'; end if;
    update public.fulfilment_batches set stage=next_stage where id=p_batch_id;
  elsif p_action='nfc' then
    if b.stage <> 'nfc' then raise exception 'INVALID_STAGE'; end if;
    update public.fulfilment_batch_orders set nfc_written_at=coalesce(nfc_written_at,now()),nfc_written_by=coalesce(nfc_written_by,p_actor) where batch_id=p_batch_id and order_id=p_payload->>'orderId';
    if not found then raise exception 'ORDER_NOT_IN_BATCH'; end if;
    if not exists(select 1 from public.fulfilment_batch_orders where batch_id=p_batch_id and nfc_written_at is null) then
      perform o.id from public.fulfilment_orders o join public.fulfilment_batch_orders m on m.order_id=o.id where m.batch_id=p_batch_id order by o.id for update of o;
      if exists(select 1 from public.fulfilment_orders o join public.fulfilment_batch_orders m on m.order_id=o.id where m.batch_id=p_batch_id and o.status not in ('uploading_audio','sent_for_sewing')) then raise exception 'ORDER_STAGE_CHANGED'; end if;
      select coalesce(jsonb_agg(jsonb_build_object('orderId',o.id,'fromStatus','uploading_audio','toStatus','sent_for_sewing','note','Batch '||b.number||' NFC cards completed')), '[]'::jsonb)
        into transitions from public.fulfilment_orders o join public.fulfilment_batch_orders m on m.order_id=o.id where m.batch_id=p_batch_id and o.status='uploading_audio';
      if jsonb_array_length(transitions)>0 then perform public.transition_fulfilment_orders(transitions,p_actor); end if;
      update public.fulfilment_batches set stage='complete',completed_at=now() where id=p_batch_id;
    end if;
  else raise exception 'INVALID_ACTION';
  end if;
  update public.fulfilment_batches set version=version+1 where id=p_batch_id;
  return p_batch_id;
end;
$$;
revoke all on function public.mutate_fulfilment_batch(text,uuid,integer,jsonb,text) from public,anon,authenticated;
grant execute on function public.mutate_fulfilment_batch(text,uuid,integer,jsonb,text) to service_role;

create function public.read_fulfilment_batch(p_batch_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('batch',to_jsonb(b),'members',coalesce((select jsonb_agg(to_jsonb(m) order by m.order_id) from public.fulfilment_batch_orders m where m.batch_id=b.id),'[]'::jsonb),
    'orders',coalesce((select jsonb_agg((o.data - array['photoDataUrl','tikTokFileDataUrl','meaningfulMessage']) || jsonb_build_object(
      'meaningfulMessage',case when coalesce(o.data->>'meaningfulMessage','') like 'data:%' then 'batch-audio' else coalesce(o.data->>'meaningfulMessage','') end,
      'tikTokFileName',case when coalesce(o.data->>'tikTokFileName','')='' and coalesce(o.data->>'tikTokFileDataUrl','')<>'' then 'audio' else coalesce(o.data->>'tikTokFileName','') end) order by m.order_id)
      from public.fulfilment_batch_orders m join public.fulfilment_orders o on o.id=m.order_id where m.batch_id=b.id),'[]'::jsonb))
  from public.fulfilment_batches b where b.id=p_batch_id;
$$;
revoke all on function public.read_fulfilment_batch(uuid) from public,anon,authenticated;
grant execute on function public.read_fulfilment_batch(uuid) to service_role;

create function public.list_fulfilment_batches() returns jsonb
language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(x.data order by x.number desc),'[]'::jsonb) from (
    select b.number, jsonb_build_object('id',b.id,'number',b.number,'stage',b.stage,'version',b.version,'created_at',b.created_at,'completed_at',b.completed_at,
      'orderCount',(select count(*) from public.fulfilment_batch_orders m where m.batch_id=b.id),
      'writtenCount',(select count(*) from public.fulfilment_batch_orders m where m.batch_id=b.id and m.nfc_written_at is not null)) as data
    from public.fulfilment_batches b order by b.number desc limit 100
  ) x;
$$;
revoke all on function public.list_fulfilment_batches() from public,anon,authenticated;
grant execute on function public.list_fulfilment_batches() to service_role;
