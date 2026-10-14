-- Run with execute_sql against the configured test/project database. Every test
-- record and order transition is rolled back; real orders are never selected.
begin;
set local statement_timeout='30s';
do $$
declare
  batch uuid:=gen_random_uuid();
  other_batch uuid:=gen_random_uuid();
  first_id text:='batch-test-'||gen_random_uuid();
  second_id text:='batch-test-'||gen_random_uuid();
  ids jsonb;
  v integer;
begin
  ids:=jsonb_build_array(first_id,second_id);
  insert into public.fulfilment_orders(id,order_number,status,order_date,data)
  select id,'BATCH-TEST','new_order',now(),jsonb_build_object('id',id,'orderNumber','BATCH-TEST','status','new_order','orderDate',now(),'updatedAt',now(),'statusHistory','[]'::jsonb,'paymentProcessor','Stripe','plushName','TEST NAME','meaningfulMessage','data:audio/wav;base64,AA==','tikTokFileDataUrl','data:audio/wav;base64,AA==') from unnest(array[first_id,second_id]) id;
  perform public.mutate_fulfilment_batch('create',batch,1,jsonb_build_object('orderIds',ids),'Batch test');
  if (select count(*) from public.fulfilment_orders where id in(first_id,second_id) and status='uploading_audio')<>2 then raise exception 'Creation did not advance both orders'; end if;
  perform public.mutate_fulfilment_batch('create',batch,1,jsonb_build_object('orderIds',ids),'Batch test');
  if (select jsonb_array_length(data->'statusHistory') from public.fulfilment_orders where id=first_id)<>1 then raise exception 'Create retry duplicated history'; end if;
  begin
    perform public.mutate_fulfilment_batch('create',other_batch,1,jsonb_build_object('orderIds',ids),'Batch test');
    raise exception 'Duplicate membership was allowed';
  exception when unique_violation then null; end;
  select version into v from public.fulfilment_batches where id=batch;
  begin
    perform public.mutate_fulfilment_batch('advance',batch,v,jsonb_build_object('stage','labels'),'Batch test');
    raise exception 'Missing labels were allowed';
  exception when others then if sqlerrm<>'SHIPPING_LABEL_REQUIRED' then raise; end if; end;
  begin
    perform public.mutate_fulfilment_batch('advance',batch,v-1,jsonb_build_object('stage','labels'),'Batch test');
    raise exception 'Stale staff version was allowed';
  exception when others then if sqlerrm<>'BATCH_CHANGED' then raise; end if; end;
  perform public.mutate_fulfilment_batch('labels',batch,v,jsonb_build_object('labels',jsonb_build_array(jsonb_build_object('orderId',first_id,'url','https://example.test/label-a.pdf','fileName','a.pdf','source','jnt'),jsonb_build_object('orderId',second_id,'url','https://example.test/label-b.pdf','fileName','b.pdf','source','jnt'))),'Batch test');
  select version into v from public.fulfilment_batches where id=batch;
  perform public.mutate_fulfilment_batch('advance',batch,v,jsonb_build_object('stage','labels'),'Batch test');
  select version into v from public.fulfilment_batches where id=batch;
  perform public.mutate_fulfilment_batch('advance',batch,v,jsonb_build_object('stage','printing'),'Batch test');
  select version into v from public.fulfilment_batches where id=batch;
  begin
    perform public.mutate_fulfilment_batch('advance',batch,v,jsonb_build_object('stage','envelopes'),'Batch test');
    raise exception 'Missing envelope names were allowed';
  exception when others then if sqlerrm<>'ENVELOPE_NAME_REQUIRED' then raise; end if; end;
  perform public.mutate_fulfilment_batch('envelope_names',batch,v,jsonb_build_object('names',jsonb_build_object(first_id,'FIRST',second_id,'SECOND')),'Batch test');
  select version into v from public.fulfilment_batches where id=batch;
  perform public.mutate_fulfilment_batch('advance',batch,v,jsonb_build_object('stage','envelopes'),'Batch test');
  select version into v from public.fulfilment_batches where id=batch;
  begin
    perform public.mutate_fulfilment_batch('nfc',batch,v,jsonb_build_object('orderId',first_id),'Batch test');
    raise exception 'NFC step was allowed before audio';
  exception when others then if sqlerrm<>'INVALID_STAGE' then raise; end if; end;
  perform public.mutate_fulfilment_batch('advance',batch,v,jsonb_build_object('stage','audio'),'Batch test');
  select version into v from public.fulfilment_batches where id=batch;
  perform public.mutate_fulfilment_batch('nfc',batch,v,jsonb_build_object('orderId',first_id),'Batch test');
  if (select count(*) from public.fulfilment_orders where id in(first_id,second_id) and status='uploading_audio')<>2 then raise exception 'Partial NFC completed batch'; end if;
  -- A concurrent stage change must roll back the final NFC confirmation and
  -- leave the other batch orders unchanged, rather than advance a partial set.
  perform public.transition_fulfilment_orders(jsonb_build_array(jsonb_build_object('orderId',second_id,'fromStatus','uploading_audio','toStatus','packed')),'Batch test');
  select version into v from public.fulfilment_batches where id=batch;
  begin
    perform public.mutate_fulfilment_batch('nfc',batch,v,jsonb_build_object('orderId',second_id),'Batch test');
    raise exception 'Changed order stage was overwritten';
  exception when others then if sqlerrm<>'ORDER_STAGE_CHANGED' then raise; end if; end;
  if (select nfc_written_at from public.fulfilment_batch_orders where order_id=second_id) is not null then raise exception 'Failed completion recorded final NFC'; end if;
  perform public.transition_fulfilment_orders(jsonb_build_array(jsonb_build_object('orderId',second_id,'fromStatus','packed','toStatus','uploading_audio')),'Batch test');
  perform public.mutate_fulfilment_batch('nfc',batch,v,jsonb_build_object('orderId',second_id),'Batch test');
  if (select stage from public.fulfilment_batches where id=batch)<>'complete' or (select count(*) from public.fulfilment_orders where id in(first_id,second_id) and status='sent_for_sewing')<>2 then raise exception 'Final NFC did not complete atomically'; end if;
  if exists(select 1 from jsonb_array_elements(public.read_fulfilment_batch(batch)->'orders') o where o ? 'tikTokFileDataUrl' or o->>'meaningfulMessage' like 'data:%') then raise exception 'Batch response transferred inline media'; end if;
end;
$$;
rollback;
select 'batch transaction tests passed; all test orders rolled back' as result;
