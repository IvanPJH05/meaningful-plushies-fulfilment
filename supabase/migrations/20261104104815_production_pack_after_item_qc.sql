CREATE OR REPLACE FUNCTION public.production_record_step(p_actor uuid, p_item uuid, p_version integer, p_action text, p_note text DEFAULT ''::text, p_card text DEFAULT NULL::text, p_details jsonb DEFAULT NULL::jsonb, p_order_updated timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v public.production_items;v_batch uuid;v_next text;v_order public.fulfilment_orders;v_actor text;v_steps text[]:=array['received','labels_printed','audio_ready','stuffed','at_tailor','returned','audio_passed','packed','collected','delivered'];
begin
 perform public.bc_v2_require_staff(p_actor);
 select batch_id into v_batch from public.production_items where id=p_item;
 perform 1 from public.production_batches where id=v_batch for update;
 select * into v from public.production_items where id=p_item for update;
 if not found then raise exception 'Production item not found.';end if;
 if v.version<>p_version then raise exception 'This item changed. Refresh before continuing.';end if;
 if v.stage in ('packed','collected','delivered') then raise exception 'Pack and scan is complete. There is no courier collection task.';end if;
 if v.disposition<>'active' then raise exception 'This order is not in the active queue.';end if;
 if p_action in ('remove','defer') then
  if length(trim(coalesce(p_note,''))) not between 3 and 1000 then raise exception 'Record an issue reason and choose what happens to this order.';end if;
  update public.production_items set issue=trim(p_note),disposition=case when p_action='remove' then 'removed' else 'deferred' end,deferred_until=case when p_action='defer' then (now()at time zone 'Asia/Kuala_Lumpur')::date+1 else null end,version=version+1,updated_at=now()where id=v.id;
  insert into public.production_events(item_id,stage,kind,note,actor)values(v.id,v.stage,'issue',case when p_action='remove' then 'Removed from this queue: ' else 'Left behind for the next daily batch: ' end||trim(p_note),p_actor);return;
 end if;
 if p_action='issue' then
  if length(trim(p_note)) not between 3 and 1000 then raise exception 'Describe the issue.';end if;
  update public.production_items set issue=trim(p_note),version=version+1,updated_at=now()where id=v.id;
  insert into public.production_events(item_id,stage,kind,note,actor)values(v.id,v.stage,'issue',trim(p_note),p_actor);return;
 elsif p_action='resolve' then
  if v.issue='' or length(trim(p_note)) not between 3 and 1000 then raise exception 'Explain how the issue was resolved.';end if;
  update public.production_items set issue='',version=version+1,updated_at=now()where id=v.id;
  insert into public.production_events(item_id,stage,kind,note,actor)values(v.id,v.stage,'resolved',trim(p_note),p_actor);return;
 end if;
 if v.issue<>'' then raise exception 'Resolve the issue or choose Remove / Leave behind before continuing.';end if;
 if exists(select 1 from public.production_items other where other.batch_id=v.batch_id and other.disposition='active' and array_position(v_steps,other.stage)<case when p_action='packed' then array_position(v_steps,'at_tailor') else array_position(v_steps,v.stage) end) then raise exception 'Complete the previous step for every order, or record an issue and choose Remove / Leave behind.';end if;
 v_next=case v.stage when 'received' then 'labels_printed' when 'labels_printed' then 'at_tailor' when 'audio_ready' then 'at_tailor' when 'stuffed' then 'at_tailor' when 'at_tailor' then 'audio_passed' when 'returned' then 'audio_passed' when 'audio_passed' then 'packed' else null end;
 if p_action='packed' and v.stage in ('at_tailor','returned') then v_next='packed';end if;
 if v_next is null or p_action is distinct from v_next then raise exception 'Complete each stage in order.';end if;
 if v_next in ('at_tailor','packed') then
  select * into v_order from public.fulfilment_orders where id=v.order_id for update;
  if v_order.status not in ('new_order','uploading_audio','sent_for_sewing','packed') or (v_next='at_tailor' and v_order.status='packed') then
    raise exception 'This order is no longer ready for production. Refresh and review it.';
  end if;
 end if;
 if v_next='packed' then
  if v.stage in ('at_tailor','returned') then
   insert into public.production_events(item_id,stage,kind,note,actor) values(v.id,'audio_passed','stage','QC confirmed by order and NFC scans.',p_actor);
  end if;
  if p_order_updated is null or v_order.updated_at is distinct from p_order_updated then raise exception 'Order changed. Refresh before packing.';end if;
  if p_card ~* '^NFC-[0-9]{6,12}$' then
    select display_name into v_actor from public.dashboard_accounts where id=p_actor;
    perform public.mutate_nfc_card('pair',substring(p_card from 5)::bigint,v.order_id,coalesce(v_actor,'Daily Production'),'');
  else
  if p_card is null or p_card!~'^[0-9]{6}$' then raise exception 'Scan the certificate card before confirming the box is packed.';end if;
  perform public.bc_v3_link(p_actor,p_card,v.order_id,v.order_id,p_order_updated,p_details);
  end if;
 end if;
 update public.production_items set stage=v_next,certificate_code=case when v_next='packed' then p_card else certificate_code end,version=version+1,updated_at=now()where id=v.id;
 if v_next in ('at_tailor','packed') then
  perform public.transition_fulfilment_orders(jsonb_build_array(jsonb_build_object(
    'orderId',v.order_id,'fromStatus',v_order.status,
    'toStatus',case when v_next='packed' then 'packed' else 'sent_for_sewing' end,
    'note',case when v_next='packed' then 'Pack and scan complete; awaiting J&T pickup.' else 'Audio ZIP downloaded; Sewing stage started.' end
  )),'Daily Production');
 end if;
 insert into public.production_events(item_id,stage,kind,note,actor)values(v.id,v_next,'stage',left(coalesce(p_note,''),1000),p_actor);
end $function$
;
revoke all on function public.production_record_step(uuid,uuid,integer,text,text,text,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.production_record_step(uuid,uuid,integer,text,text,text,jsonb,timestamptz) to service_role;
