do $migration$
declare
  definition text := pg_get_functiondef('public.mutate_fulfilment_batch_internal(text,uuid,integer,jsonb,text)'::regprocedure);
  old_save text := 'from public.fulfilment_batch_orders m where m.batch_id=p_batch_id and length(trim(coalesce(p_payload->''names''->>m.order_id,''''))) not between 1 and 60';
  old_advance text := 'from public.fulfilment_batch_orders m where m.batch_id=p_batch_id and coalesce(b.envelope_names->>m.order_id,'''')=''''';
  eligible text := $predicate$from public.fulfilment_batch_orders m join public.fulfilment_orders o on o.id=m.order_id where m.batch_id=p_batch_id and not (lower(coalesce(o.data->>'productType','')) in ('plush_charm','snowy_charm') or concat(coalesce(o.data->>'product',''),' ',coalesce(o.data->>'remark','')) ~* '\m(snowy\s+)?plush\s*charms?\M')$predicate$;
begin
  if position(old_save in definition)=0 or position(old_advance in definition)=0 then
    raise exception 'Batch envelope checks changed; review migration before applying';
  end if;
  definition := replace(definition,old_save,eligible || ' and length(trim(coalesce(p_payload->''names''->>m.order_id,''''))) not between 1 and 60');
  definition := replace(definition,old_advance,eligible || ' and coalesce(b.envelope_names->>m.order_id,'''')=''''');
  execute definition;
end;
$migration$;
