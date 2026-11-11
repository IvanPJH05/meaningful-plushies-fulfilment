create or replace function public.mutate_fulfilment_batch(p_action text, p_batch_id uuid, p_version integer, p_payload jsonb, p_actor text)
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
  -- A confirmed physical card cannot always be written again. Confirmations
  -- commute across cards, and a repeated acknowledgement must be a no-op.
  if p_action='nfc' and exists(select 1 from public.fulfilment_batch_orders where batch_id=p_batch_id and order_id=p_payload->>'orderId' and nfc_written_at is not null) then return p_batch_id; end if;
  if p_action not in ('create','nfc') and b.version <> p_version then raise exception 'BATCH_CHANGED'; end if;
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

