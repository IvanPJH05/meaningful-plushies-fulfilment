-- Additive fields: older mobile and timed camera proofs retain their existing flow.
alter table public.packing_proof_videos
 add column capture_mode text not null default 'timed' check(capture_mode in ('timed','warehouse')),
 add column duration_ms integer not null default 23000 check(duration_ms between 1000 and 180000),
 add column tracking_number text not null default '',
 add column tracking_verified_at timestamptz,
 add constraint warehouse_packing_requires_label check(capture_mode<>'warehouse' or (pack_after_save and tracking_number ~ '^[A-Z0-9]{6,40}$' and tracking_verified_at is not null));

create or replace function public.packing_station_complete(p_actor uuid,p_proof uuid,p_lease uuid,p_path text,p_size integer) returns void
language plpgsql security invoker set search_path='' as $$
declare proof public.packing_proof_videos; batch uuid; paired_order text; paired_status text; previous_context text; current_tracking text;
begin
 perform public.bc_v2_require_staff(p_actor);
 select * into proof from public.packing_proof_videos where id=p_proof for update;
 if not found or not proof.pack_after_save then raise exception 'Packing recording not found.';end if;
 if proof.status='ready' then return;end if;
 if proof.status<>'processing' or proof.processing_token is distinct from p_lease or proof.lease_until is null or proof.lease_until<=now() then raise exception 'The recording changed while saving. Please retry.';end if;
 if p_path is distinct from p_proof::text||'/proof.mp4' or p_size is null or p_size<1 or p_size>(case when proof.capture_mode='warehouse' then 24 else 12 end)*1024*1024 then raise exception 'The saved packing video is invalid.';end if;
 if not exists(select 1 from storage.objects where bucket_id='packing-proof' and name=p_path and (metadata->>'size')::bigint=p_size) then raise exception 'The packing video has not been saved online.';end if;
 select batch_id into batch from public.production_items where order_id=proof.order_id;
 perform 1 from public.production_batches where id=batch for update;
 perform 1 from public.production_items where order_id=proof.order_id for update;
 if proof.capture_mode='warehouse' then
   select regexp_replace(upper(coalesce(data->>'trackingNumber','')),'[[:space:]-]','','g') into current_tracking from public.fulfilment_orders where id=proof.order_id for update;
   if current_tracking is null or current_tracking='' or current_tracking is distinct from proof.tracking_number or proof.tracking_verified_at is null then
     raise exception 'The shipping label no longer matches this order. Verify the correct label before completing packing.';
   end if;
 end if;
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

revoke all on function public.packing_station_complete(uuid,uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.packing_station_complete(uuid,uuid,uuid,text,integer) to service_role;
