-- Only the camera packing app opts into this flow. Existing saved proofs and
-- the separate legacy scanner retain their existing behaviour.
alter table public.packing_proof_videos add column pack_after_save boolean not null default false;

-- Reuse all existing NFC ownership, programming, profile and audit checks.
-- Only this staff-only path may pair an issue/shipped order before packing.
do $migration$
declare definition text; original text;
begin
 select pg_get_functiondef('public.mutate_nfc_card(text,bigint,text,text,text)'::regprocedure) into definition;
 original:=definition;
 definition:=replace(definition,
   'if o.status not in (''awaiting_customisation'',''new_order'',''uploading_audio'',''sent_for_sewing'',''packed'') then',
   'if o.status not in (''awaiting_customisation'',''new_order'',''uploading_audio'',''sent_for_sewing'',''packed'') and not (current_user=''service_role'' and coalesce(current_setting(''app.packing_station_pair_order'',true),'''')=o.id) then');
 definition:=replace(definition,'internal.nfc_customer_order_eligible(o.data,o.status)',
   'internal.nfc_customer_order_eligible(o.data,case when current_user=''service_role'' and coalesce(current_setting(''app.packing_station_pair_order'',true),'''')=o.id then ''packed'' else o.status end)');
 if definition=original then raise exception 'The existing NFC pairing checks changed; review before applying this migration';end if;
 execute definition;
end;
$migration$;

create function public.packing_station_pair(p_actor uuid,p_order text,p_barcode text,p_card text,p_details jsonb default null) returns void
language plpgsql security invoker set search_path='' as $$
declare o public.fulfilment_orders; batch uuid; actor text; previous_context text;
begin
 perform public.bc_v2_require_staff(p_actor);
 select batch_id into batch from public.production_items where order_id=p_order;
 perform 1 from public.production_batches where id=batch for update;
 perform 1 from public.production_items where order_id=p_order for update;
 select * into o from public.fulfilment_orders where id=p_order;
 if not found or not internal.production_scan_matches(o,p_barcode) then raise exception 'Scan this order barcode.';end if;
 select display_name into actor from public.dashboard_accounts where id=p_actor;
 previous_context:=coalesce(current_setting('app.packing_station_pair_order',true),'');
 perform set_config('app.packing_station_pair_order',o.id,true);
 if p_card ~ '^NFC-[0-9]{6,12}$' then
   perform public.mutate_nfc_card('pair',substring(p_card from 5)::bigint,o.id,coalesce(actor,'Packing station'),'');
 elsif p_card ~ '^[0-9]{6}$' then
   perform public.bc_v3_link(p_actor,p_card,o.id,o.id,o.updated_at,p_details);
 else raise exception 'Scan a valid NFC card barcode.';end if;
 perform set_config('app.packing_station_pair_order',previous_context,true);
 update public.production_items set certificate_code=p_card,version=version+1,updated_at=now() where order_id=o.id and certificate_code is distinct from p_card;
end;
$$;

-- The server verifies the actual cloud file before this call. Recheck its
-- storage metadata and card ownership inside the same transaction as Packed.
create function public.packing_station_complete(p_actor uuid,p_proof uuid,p_lease uuid,p_path text,p_size integer) returns void
language plpgsql security invoker set search_path='' as $$
declare proof public.packing_proof_videos; batch uuid; paired_order text; paired_status text; previous_context text;
begin
 perform public.bc_v2_require_staff(p_actor);
 select * into proof from public.packing_proof_videos where id=p_proof for update;
 if not found or not proof.pack_after_save then raise exception 'Packing recording not found.';end if;
 if proof.status='ready' then return;end if;
 if proof.status<>'processing' or proof.processing_token is distinct from p_lease or proof.lease_until is null or proof.lease_until<=now() then raise exception 'The recording changed while saving. Please retry.';end if;
 if p_path is distinct from p_proof::text||'/proof.mp4' or p_size is null or p_size<1 or p_size>12*1024*1024 then raise exception 'The saved packing video is invalid.';end if;
 if not exists(select 1 from storage.objects where bucket_id='packing-proof' and name=p_path and (metadata->>'size')::bigint=p_size) then raise exception 'The packing video has not been saved online.';end if;
 select batch_id into batch from public.production_items where order_id=proof.order_id;
 perform 1 from public.production_batches where id=batch for update;
 perform 1 from public.production_items where order_id=proof.order_id for update;
 if proof.card_code ~ '^NFC-[0-9]{6,12}$' then
   select order_id,status into paired_order,paired_status from public.nfc_cards where id=substring(proof.card_code from 5)::bigint for update;
   if paired_order is distinct from proof.order_id or paired_status is distinct from 'assigned' then raise exception 'The NFC card no longer matches this order. Scan the order and card again.';end if;
 else
   select order_ref,status into paired_order,paired_status from public.bc_v2_certificates where code=proof.card_code and item_key=proof.order_id for update;
   if paired_order is distinct from proof.order_id or paired_status is distinct from 'active' then raise exception 'The ID card no longer matches this order. Scan the order and card again.';end if;
 end if;
 perform public.production_scanner_pack(p_actor,proof.order_id,proof.order_barcode);
 previous_context:=coalesce(current_setting('app.packing_station_finish_proof',true),'');
 perform set_config('app.packing_station_finish_proof',proof.id::text,true);
 update public.packing_proof_videos set status='ready',video_path=p_path,video_size=p_size,saved_at=now(),lease_until=null,error='' where id=proof.id;
 perform set_config('app.packing_station_finish_proof',previous_context,true);
end;
$$;
create function internal.guard_packing_proof_completion() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.pack_after_save and new.status='ready' and old.status is distinct from 'ready'
   and not (current_user='service_role' and coalesce(current_setting('app.packing_station_finish_proof',true),'')=new.id::text) then
   raise exception 'Confirm the saved video and card before completing packing.';
 end if;
 return new;
end;
$$;
create trigger guard_packing_proof_completion before update on public.packing_proof_videos for each row execute function internal.guard_packing_proof_completion();
revoke all on function internal.guard_packing_proof_completion() from public,anon,authenticated;
grant execute on function internal.guard_packing_proof_completion() to service_role;
revoke all on function public.packing_station_pair(uuid,text,text,text,jsonb),public.packing_station_complete(uuid,uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.packing_station_pair(uuid,text,text,text,jsonb),public.packing_station_complete(uuid,uuid,uuid,text,integer) to service_role;
