import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { trackingCode, matchingTrackingCodes, createTrackingConfirmation } from "./warehouse-packing.ts";
import { validatePackingCapture } from "./packing-proof.ts";

test("shipping verification requires the full number on two fresh frames",()=>{
 const expected="632203725770",reader=createTrackingConfirmation();
 assert.equal(trackingCode(" 6322-0372 5770 "),expected);
 assert.equal(matchingTrackingCodes(["725770","MP-2059"],expected),false);
 assert.equal(reader.observe(["632203725771"],expected),false);
 assert.equal(reader.observe([expected,"OTHER-CODE"],expected),false);
 assert.equal(reader.observe([expected],expected),true);
 reader.reset();assert.equal(reader.observe([expected],expected),false);
 assert.equal(reader.observe([],expected),false);assert.equal(reader.observe([expected],expected),false);
});

test("warehouse clips use order-scan to matching-label duration rather than a fixed tail",()=>{
 const now=Date.now(),raw={id:"00000000-0000-4000-8000-000000000001",orderId:"test-order",orderNumber:"TEST",orderBarcode:"MPI-test-order",cardCode:"NFC-100001",scannedAt:new Date(now-42000).toISOString(),sourceStartedAt:new Date(now-42000).toISOString(),size:10000,contentType:"video/webm",captureMode:"warehouse",durationMs:42000,trackingNumber:"632203725770",trackingVerifiedAt:new Date(now).toISOString()};
 const valid=validatePackingCapture(raw,now);assert.equal(valid.durationMs,42000);assert.equal(valid.offsetMs,0);assert.equal(valid.trackingNumber,"632203725770");
 for(const patch of [{durationMs:0},{durationMs:180001},{trackingNumber:""},{trackingVerifiedAt:new Date(now+5000).toISOString()},{sourceStartedAt:new Date(now-50000).toISOString()},{captureMode:"other"}])assert.throws(()=>validatePackingCapture({...raw,...patch},now));
});

test("warehouse completion gates Packed on live label match, paired NFC, and saved cloud video; old proofs remain compatible",async()=>{
 const db=new PGlite(),actor="00000000-0000-4000-8000-000000000001",proof="00000000-0000-4000-8000-000000000002",lease="00000000-0000-4000-8000-000000000003";
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema storage;
   create table fulfilment_orders(id text primary key, data jsonb, status text);
   create table dashboard_accounts(id uuid primary key);
   create table production_batches(id uuid primary key);
   create table production_items(order_id text,batch_id uuid);
   create table nfc_cards(id bigint,order_id text,status text);
   create table bc_v2_certificates(code text,order_ref text,item_key text,status text);
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(bucket_id text,name text,metadata jsonb);
   create function public.bc_v2_require_staff(actor uuid) returns void language plpgsql as $$begin if actor<>'${actor}' then raise exception 'Staff required';end if;end;$$;
   create function public.production_scanner_pack(actor uuid,order_id text,barcode text) returns void language plpgsql as $$begin update public.fulfilment_orders set status='packed' where id=order_id;end;$$;`);
  await db.exec(await readFile(new URL('../supabase/migrations/20261120105131_packing_proof_videos.sql',import.meta.url),'utf8'));
  await db.exec('alter table packing_proof_videos add column pack_after_save boolean not null default false');
  await db.exec(await readFile(new URL('../supabase/migrations/20261122162315_warehouse_packing_label_verification.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20261123073720_higher_quality_packing_proofs.sql',import.meta.url),'utf8'));
  assert.equal((await db.query<{file_size_limit:number;public:boolean}>("select file_size_limit,public from storage.buckets where id='packing-proof'")).rows[0].file_size_limit,200*1024*1024);
  assert.equal((await db.query<{public:boolean}>("select public from storage.buckets where id='packing-proof'")).rows[0].public,false);
  await db.exec(`insert into fulfilment_orders values ('test','{"trackingNumber":"632203725770"}','issue');insert into dashboard_accounts values ('${actor}');
   insert into nfc_cards values (100001,'test','assigned');
   insert into packing_proof_videos(id,order_id,card_code,order_barcode,scanned_at,source_started_at,offset_ms,source_path,source_size,source_type,created_by,pack_after_save,capture_mode,duration_ms,tracking_number,tracking_verified_at,status,processing_token,lease_until)
   values ('${proof}','test','NFC-100001','MPI-test',now()-interval '42 seconds',now()-interval '42 seconds',0,'test/source.webm',10000,'video/webm','${actor}',true,'warehouse',42000,'632203725770',now(),'processing','${lease}',now()+interval '2 minutes');`);
  const complete=`select public.packing_station_complete('${actor}','${proof}','${lease}','${proof}/proof.mp4',10000)`;
  await assert.rejects(db.exec(complete),/not been saved online/);
  await db.exec(`insert into storage.objects values ('packing-proof','${proof}/proof.mp4','{"size":10000}');update fulfilment_orders set data='{"trackingNumber":"632203725771"}';`);
  await assert.rejects(db.exec(complete),/shipping label no longer matches/);
  assert.equal((await db.query<{status:string}>('select status from fulfilment_orders')).rows[0].status,'issue');
  await db.exec(`update fulfilment_orders set data='{"trackingNumber":"632203725770"}';update nfc_cards set order_id='other';`);
  await assert.rejects(db.exec(complete),/NFC card no longer matches/);
  await db.exec(`update nfc_cards set order_id='test';`);await db.exec(complete);
  assert.equal((await db.query<{status:string}>('select status from fulfilment_orders')).rows[0].status,'packed');
  assert.equal((await db.query<{status:string}>('select status from packing_proof_videos')).rows[0].status,'ready');
  await db.exec(`update packing_proof_videos set source_size=41943040,status='processing',lease_until=now()+interval '2 minutes';update storage.objects set metadata='{"size":41943040}';`);
  await db.exec(`select public.packing_station_complete('${actor}','${proof}','${lease}','${proof}/proof.mp4',41943040)`);
  assert.equal((await db.query<{status:string}>('select status from packing_proof_videos')).rows[0].status,'ready');
  await assert.rejects(db.exec('update packing_proof_videos set source_size=209715201'),/check constraint/);
  await db.exec(`update storage.objects set metadata='{"size":10000}';`);
  await db.exec(`update fulfilment_orders set status='sent_for_sewing',data='{}';update packing_proof_videos set status='processing',capture_mode='timed',tracking_verified_at=null,tracking_number='',processing_token='${lease}',lease_until=now()+interval '2 minutes';`);await db.exec(complete);
  assert.equal((await db.query<{status:string}>('select status from fulfilment_orders')).rows[0].status,'packed');
  const access=(await db.query<{anon:boolean;service:boolean}>(`select has_function_privilege('anon','public.packing_station_complete(uuid,uuid,uuid,text,integer)','execute') anon,has_function_privilege('service_role','public.packing_station_complete(uuid,uuid,uuid,text,integer)','execute') service`)).rows[0];assert.deepEqual(access,{anon:false,service:true});
 }finally{await db.close();}
});
