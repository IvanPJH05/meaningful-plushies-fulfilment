do $migration$
declare
  definition text := pg_get_functiondef('public.mutate_fulfilment_batch_internal(text,uuid,integer,jsonb,text)'::regprocedure);
  old_guard text;
  new_guard text := $guard$    if b.stage='labels' and exists(select 1 from public.fulfilment_batch_orders m join public.fulfilment_orders o on o.id=m.order_id where m.batch_id=p_batch_id and coalesce(o.data->>'shippingLabelUrl','')='' and (coalesce(o.data->>'salesChannel','')='tiktok' or coalesce(o.data->>'paymentProcessor','') !~* '(\mcod\M|cash[ _]on[ _]delivery)')) then raise exception 'SHIPPING_LABEL_REQUIRED'; end if;$guard$;
begin
  select line into old_guard from regexp_split_to_table(definition,E'\n') line where line like '%if b.stage=''labels'' and exists%' and line like '%SHIPPING_LABEL_REQUIRED%';
  if old_guard is null then raise exception 'Batch shipping-label guard changed; review migration'; end if;
  execute replace(definition,old_guard,new_guard);
end;
$migration$;
