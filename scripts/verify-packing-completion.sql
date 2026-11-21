-- Run in a transaction and always roll back. This verifies DB invariants only;
-- the temporary storage row below is never committed and uploads no cloud file.
select set_config('app.packing_test_actor',gen_random_uuid()::text,true),set_config('app.packing_test_batch',gen_random_uuid()::text,true),set_config('app.packing_test_proof',gen_random_uuid()::text,true),set_config('app.packing_test_lease',gen_random_uuid()::text,true);
insert into public.dashboard_accounts(id,username,display_name,role,password_hash) values(current_setting('app.packing_test_actor')::uuid,'packing-gate-'||replace(current_setting('app.packing_test_actor'),'-',''),'Packing completion test','staff','disabled-test-login');
insert into public.nfc_card_batches(id,quantity,created_by) values(current_setting('app.packing_test_batch')::uuid,7,'Packing completion test');
insert into public.nfc_cards(id,batch_id,programmed_at) select 999999999900+n,current_setting('app.packing_test_batch')::uuid,now() from generate_series(1,7) n;
insert into public.fulfilment_orders(id,order_number,status,data)
select 'packing-gate-'||current_setting('app.packing_test_actor')||'-'||state,'GATE-'||state,state,jsonb_build_object('id','packing-gate-'||current_setting('app.packing_test_actor')||'-'||state,'orderNumber','GATE-'||state,'status',state,'customerName','Packing completion test','plushName','','salesChannel','shopify','character','Billy','product','Meaningful Plushie','statusHistory','[]'::jsonb)
from unnest(array['awaiting_customisation','new_order','uploading_audio','sent_for_sewing','issue','packed','shipped']) state;
set local role service_role;
do $tests$
declare state text; oid text; card bigint:=999999999900; proof uuid:=current_setting('app.packing_test_proof')::uuid; lease uuid:=current_setting('app.packing_test_lease')::uuid;
begin
 foreach state in array array['awaiting_customisation','new_order','uploading_audio','sent_for_sewing','issue','packed','shipped'] loop
  card:=card+1;oid:='packing-gate-'||current_setting('app.packing_test_actor')||'-'||state;
  perform public.packing_station_pair(current_setting('app.packing_test_actor')::uuid,oid,'MPI-'||oid,'NFC-'||card,null);
  perform public.packing_station_pair(current_setting('app.packing_test_actor')::uuid,oid,'MPI-'||oid,'NFC-'||card,null);
  if not exists(select 1 from public.fulfilment_orders where id=oid and status=state and data->>'status'=state) then raise exception 'Pairing changed the order status for %',state;end if;
 end loop;
 oid:='packing-gate-'||current_setting('app.packing_test_actor')||'-issue';card:=999999999905;
 insert into public.packing_proof_videos(id,order_id,card_code,order_barcode,scanned_at,source_started_at,offset_ms,source_path,source_size,source_type,created_by,status,processing_token,lease_until,pack_after_save)
 values(proof,oid,'NFC-'||card,'MPI-'||oid,now(),now()-interval '3 seconds',0,proof::text||'/source.mp4',1000,'video/mp4',current_setting('app.packing_test_actor')::uuid,'processing',lease,now()+interval '2 minutes',true);
 begin
  perform public.packing_station_complete(current_setting('app.packing_test_actor')::uuid,proof,lease,proof::text||'/proof.mp4',1000);
  raise exception 'UNSAVED_VIDEO_ALLOWED';
 exception when others then if sqlerrm='UNSAVED_VIDEO_ALLOWED' then raise;end if;end;
 if (select status from public.fulfilment_orders where id=oid)<>'issue' then raise exception 'Missing video changed order';end if;
 begin
  update public.packing_proof_videos set status='ready',video_path=proof::text||'/proof.mp4',video_size=1000,saved_at=now() where id=proof;
  raise exception 'DIRECT_READY_ALLOWED';
 exception when others then if sqlerrm='DIRECT_READY_ALLOWED' then raise;end if;end;
 -- This metadata exists only inside the rolled-back test transaction.
 insert into storage.objects(bucket_id,name,metadata) values('packing-proof',proof::text||'/proof.mp4','{"size":1000,"mimetype":"video/mp4"}'::jsonb);
 update public.nfc_cards set status='available',order_id=null where id=card;
 begin
  perform public.packing_station_complete(current_setting('app.packing_test_actor')::uuid,proof,lease,proof::text||'/proof.mp4',1000);
  raise exception 'CHANGED_CARD_ALLOWED';
 exception when others then if sqlerrm='CHANGED_CARD_ALLOWED' then raise;end if;end;
 if (select status from public.fulfilment_orders where id=oid)<>'issue' or (select status from public.packing_proof_videos where id=proof)<>'processing' then raise exception 'Failed finalisation was not atomic';end if;
 update public.nfc_cards set status='assigned',order_id=oid where id=card;
 perform public.packing_station_complete(current_setting('app.packing_test_actor')::uuid,proof,lease,proof::text||'/proof.mp4',1000);
 if (select status from public.fulfilment_orders where id=oid)<>'packed' or (select status from public.packing_proof_videos where id=proof)<>'ready' then raise exception 'Saved video did not complete packing';end if;
 perform public.transition_fulfilment_orders(jsonb_build_array(jsonb_build_object('orderId',oid,'fromStatus','packed','toStatus','shipped')),'Packing completion test');
 perform public.packing_station_complete(current_setting('app.packing_test_actor')::uuid,proof,lease,proof::text||'/proof.mp4',1000);
 if (select status from public.fulfilment_orders where id=oid)<>'shipped' then raise exception 'Retry incorrectly repacked a shipped order';end if;
end;
$tests$;
