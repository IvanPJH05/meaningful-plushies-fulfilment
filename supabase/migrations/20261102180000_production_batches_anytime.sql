CREATE OR REPLACE FUNCTION public.production_create_batch(p_actor uuid, p_id uuid, p_day date, p_order_ids text[], p_pickup date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_role text;v_order public.fulfilment_orders;v_item uuid;v_cutoff timestamptz;
begin
 perform public.bc_v2_require_staff(p_actor);
 select role into v_role from public.dashboard_accounts where id=p_actor;
 if v_role<>'admin' then raise exception 'Only admins can close production batches.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 if exists(select 1 from public.production_batches where id=p_id) then return p_id;end if;
 if cardinality(p_order_ids) not between 1 and 200 or cardinality(p_order_ids)<>(select count(distinct x) from unnest(p_order_ids)x) then raise exception 'Choose 1–200 distinct orders.';end if;
 v_cutoff=now();
 insert into public.production_batches(id,production_date,cutoff_at,pickup_date,created_by) values(p_id,p_day,v_cutoff,coalesce(p_pickup,p_day+2),p_actor);
 for v_order in select * from public.fulfilment_orders where id=any(p_order_ids) order by id for update loop
  if v_order.status is distinct from 'new_order' then raise exception 'An order is no longer eligible. Refresh and review.';end if;
  if nullif(v_order.data->>'orderDate','')::timestamptz>v_cutoff then raise exception 'An order falls after this batch cutoff.';end if;
  select id into v_item from public.production_items where order_id=v_order.id for update;
  if found then
   if not exists(select 1 from public.production_items where id=v_item and disposition='deferred' and deferred_until<=p_day) then raise exception 'This order is already in a production queue.';end if;
   update public.production_items set batch_id=p_id,disposition='active',deferred_until=null,carried_issue=issue,issue='',version=version+1,updated_at=now()where id=v_item;
   insert into public.production_events(item_id,stage,kind,note,actor)select id,stage,'resolved','Carried forward to batch '||p_day::text||'. Previous issue remains on the order badge.',p_actor from public.production_items where id=v_item;
   continue;
  end if;
  insert into public.production_items(batch_id,order_id)values(p_id,v_order.id)returning id into v_item;
  insert into public.production_events(item_id,stage,kind,actor)values(v_item,'received','stage',p_actor);
 end loop;
 if (select count(*) from public.production_items where batch_id=p_id)<>cardinality(p_order_ids) then raise exception 'An order could not be found.';end if;
 return p_id;
end $function$
;
revoke all on function public.production_create_batch(uuid,uuid,date,text[],date) from public,anon,authenticated;
grant execute on function public.production_create_batch(uuid,uuid,date,text[],date) to service_role;
