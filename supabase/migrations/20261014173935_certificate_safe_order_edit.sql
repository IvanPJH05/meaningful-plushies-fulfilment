create function public.edit_fulfilment_order(p_order text,p_expected timestamptz,p_patch jsonb,p_token uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare account record; result jsonb;
begin
  select a.display_name,a.username,a.role into account
    from public.dashboard_sessions s join public.dashboard_accounts a on a.id=s.account_id
    where s.token=p_token and s.expires_at>now() and a.active;
  if not found then raise exception 'LOGIN_REQUIRED'; end if;
  if account.role<>'admin' then raise exception 'ADMIN_REQUIRED'; end if;
  if jsonb_typeof(p_patch)<>'object' or p_patch='{}'::jsonb or exists(
    select 1 from jsonb_object_keys(p_patch) k where k<>all(array[
      'customerName','phone','address','product','character','setIndicator','idWebsiteLink','plushName','remark','meaningfulNote','internalNotes',
      'courier','trackingNumber','photoName','tikTokFileName','tikTokFileType','photoDataUrl','tikTokFileDataUrl','voiceLength','voiceUploadStatus',
      'plushGender','plushBirthDate','plushBirthPlace','plushFavouritePerson','plushBelongsTo'
    ])) then raise exception 'INVALID_ORDER_EDIT'; end if;
  update public.fulfilment_orders o set
    data=o.data||p_patch||jsonb_build_object('updatedAt',greatest(statement_timestamp(),o.updated_at+interval '1 microsecond')),
    updated_at=greatest(statement_timestamp(),o.updated_at+interval '1 microsecond')
    where o.id=p_order and o.updated_at=p_expected
    returning (o.data-'photoDataUrl'-'tikTokFileDataUrl')||jsonb_build_object('updatedAt',o.updated_at) into result;
  if not found then
    if exists(select 1 from public.fulfilment_orders where id=p_order) then raise exception 'ORDER_CHANGED'; end if;
    raise exception 'ORDER_NOT_FOUND';
  end if;
  insert into public.activity_events(id,order_number,action,detail,actor,created_at)
    values(gen_random_uuid()::text,result->>'orderNumber','Order updated',
      'Changed '||(select string_agg(k,', ') from jsonb_object_keys(p_patch) k)||'.',account.display_name||' ('||account.username||')',now());
  return result;
end;
$$;
revoke all on function public.edit_fulfilment_order(text,timestamptz,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.edit_fulfilment_order(text,timestamptz,jsonb,uuid) to service_role;
