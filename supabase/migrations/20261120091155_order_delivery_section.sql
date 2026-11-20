-- Delivery-section-only release: date and region editing, calculated dates,
-- and schedule preservation. No batch, status or fulfilment lock behaviour.
-- Staff-only scheduling, stored with the order's existing JSON data.
-- No new public table or permissions. Dates use calendar days in Malaysia time.
create or replace function internal.calculate_order_delivery_schedule(d jsonb) returns jsonb
language plpgsql immutable security invoker set search_path='' as $$
declare needed date; lead integer; region text:=coalesce(d->>'deliveryRegion','');
begin
  if coalesce(d->>'deliveryNeededBy','')='' then
    return d||jsonb_build_object('deliveryNeededBy','','deliveryRegion','','shipByDate','','fulfilmentUnlockDate','');
  end if;
  if jsonb_typeof(d->'deliveryNeededBy')<>'string' or d->>'deliveryNeededBy' !~ '^\d{4}-\d{2}-\d{2}$'
    or region not in ('west','east') then raise exception 'INVALID_DELIVERY_SCHEDULE'; end if;
  begin needed:=(d->>'deliveryNeededBy')::date; exception when others then raise exception 'INVALID_DELIVERY_SCHEDULE'; end;
  if to_char(needed,'YYYY-MM-DD')<>d->>'deliveryNeededBy' or needed<'2000-01-01'::date or needed>'9999-12-31'::date then raise exception 'INVALID_DELIVERY_SCHEDULE'; end if;
  lead:=case when region='west' then 4 else 7 end;
  return d||jsonb_build_object('shipByDate',to_char(needed-(lead-2),'YYYY-MM-DD'),'fulfilmentUnlockDate',to_char(needed-lead,'YYYY-MM-DD'));
end; $$;
revoke all on function internal.calculate_order_delivery_schedule(jsonb) from public,anon,authenticated;
grant execute on function internal.calculate_order_delivery_schedule(jsonb) to service_role;

create or replace function public.edit_fulfilment_order(p_order text,p_expected timestamptz,p_patch jsonb,p_token uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare account record; result jsonb; current_order public.fulfilment_orders; merged jsonb; schedule_changed boolean; previous_setting text;
begin
  select a.display_name,a.username,a.role into account
    from public.dashboard_sessions s join public.dashboard_accounts a on a.id=s.account_id
    where s.token=p_token and s.expires_at>now() and a.active;
  if not found then raise exception 'LOGIN_REQUIRED'; end if;
  if account.role<>'admin' then raise exception 'ADMIN_REQUIRED'; end if;
  if jsonb_typeof(p_patch)<>'object' or p_patch='{}'::jsonb or exists(
    select 1 from jsonb_object_keys(p_patch) k where k<>all(array[
      'customerName','phone','address','product','character','setIndicator','idWebsiteLink','plushName','remark','meaningfulNote','internalNotes',
      'deliveryNeededBy','deliveryRegion','courier','trackingNumber','photoName','tikTokFileName','tikTokFileType','photoDataUrl','tikTokFileDataUrl','voiceLength','voiceUploadStatus',
      'plushGender','plushBirthDate','plushBirthPlace','plushFavouritePerson','plushBelongsTo'
    ])) then raise exception 'INVALID_ORDER_EDIT'; end if;
  select * into current_order from public.fulfilment_orders where id=p_order for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if current_order.updated_at<>p_expected then raise exception 'ORDER_CHANGED'; end if;
  merged:=current_order.data||p_patch;
  schedule_changed:=coalesce(merged->>'deliveryNeededBy','') is distinct from coalesce(current_order.data->>'deliveryNeededBy','')
    or coalesce(merged->>'deliveryRegion','') is distinct from coalesce(current_order.data->>'deliveryRegion','');
  if schedule_changed then
    if current_order.status not in ('awaiting_customisation','new_order')
      or exists(select 1 from public.production_items where order_id=p_order and disposition='active')
      or exists(select 1 from public.fulfilment_batch_orders where order_id=p_order) then raise exception 'DELIVERY_SCHEDULE_STARTED'; end if;
    merged:=internal.calculate_order_delivery_schedule(merged);
    if coalesce(merged->>'deliveryNeededBy','')<>'' and (merged->>'deliveryNeededBy')::date<(now() at time zone 'Asia/Kuala_Lumpur')::date then raise exception 'INVALID_DELIVERY_SCHEDULE'; end if;
  end if;
  previous_setting:=coalesce(current_setting('app.delivery_schedule_order',true),'');
  perform set_config('app.delivery_schedule_order',p_order,true);
  update public.fulfilment_orders o set
    data=merged||jsonb_build_object('updatedAt',greatest(statement_timestamp(),o.updated_at+interval '1 microsecond')),
    updated_at=greatest(statement_timestamp(),o.updated_at+interval '1 microsecond')
    where o.id=p_order and o.updated_at=p_expected
    returning (o.data-'photoDataUrl'-'tikTokFileDataUrl')||jsonb_build_object('updatedAt',o.updated_at) into result;
  if not found then
    if exists(select 1 from public.fulfilment_orders where id=p_order) then raise exception 'ORDER_CHANGED'; end if;
    raise exception 'ORDER_NOT_FOUND';
  end if;
  perform set_config('app.delivery_schedule_order',previous_setting,true);
  insert into public.activity_events(id,order_number,action,detail,actor,created_at)
    values(gen_random_uuid()::text,result->>'orderNumber','Order updated',
      'Changed '||(select string_agg(k,', ') from jsonb_object_keys(p_patch) k)||'.',account.display_name||' ('||account.username||')',now());
  return result;
end;
$$;
revoke all on function public.edit_fulfilment_order(text,timestamptz,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.edit_fulfilment_order(text,timestamptz,jsonb,uuid) to service_role;

-- Unrelated edits, webhook syncs and stale imported snapshots cannot erase
-- or overwrite a schedule set through the administrator edit transaction.
create or replace function internal.protect_order_delivery_schedule() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if coalesce(current_setting('app.delivery_schedule_order',true),'')<>new.id then
    new.data:=(new.data-array['deliveryNeededBy','deliveryRegion','shipByDate','fulfilmentUnlockDate'])
      ||jsonb_strip_nulls(jsonb_build_object('deliveryNeededBy',old.data->'deliveryNeededBy','deliveryRegion',old.data->'deliveryRegion',
        'shipByDate',old.data->'shipByDate','fulfilmentUnlockDate',old.data->'fulfilmentUnlockDate'));
  end if;
  return new;
end; $$;
revoke all on function internal.protect_order_delivery_schedule() from public,anon,authenticated;
create trigger zzzz_order_delivery_schedule before update on public.fulfilment_orders for each row execute function internal.protect_order_delivery_schedule();

