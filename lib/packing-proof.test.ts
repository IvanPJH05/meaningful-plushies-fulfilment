import test from "node:test";
import assert from "node:assert/strict";
import { packingWindow,validatePackingCapture,packingSourceLimit } from "./packing-proof.ts";
import { PGlite } from "@electric-sql/pglite";
import {readFile} from "node:fs/promises";
test("the rolling window always retains the header and full before/after interval",()=>{
  const windows=[0,20000,40000].map(startedAt=>({startedAt,failed:false}));
  assert.equal(packingWindow(windows,2999),undefined);
  assert.equal(packingWindow(windows,3000)?.startedAt,0);
  assert.equal(packingWindow(windows,22500)?.startedAt,0);
  assert.equal(packingWindow(windows,23000)?.startedAt,20000);
  assert.equal(packingWindow(windows,42500)?.startedAt,20000);
  windows[1].failed=true;assert.equal(packingWindow(windows,42500)?.startedAt,0);
  assert.equal(packingWindow(windows,90000),undefined);
});
test("video requests reject incomplete history, oversized uploads and invalid bindings",()=>{
  const now=Date.now(),raw={id:"00000000-0000-4000-8000-000000000001",orderId:"2059-2",orderNumber:"2059-2",orderBarcode:"MPI-2059-2",cardCode:"NFC-100001",scannedAt:new Date(now).toISOString(),sourceStartedAt:new Date(now-10500).toISOString(),size:1000000,contentType:"video/webm;codecs=vp8"};
  assert.equal(validatePackingCapture(raw,now).offsetMs,7500);
  assert.equal(validatePackingCapture(raw,now).contentType,"video/webm");
  for(const patch of [{size:0},{size:packingSourceLimit+1},{contentType:"text/html"},{sourceStartedAt:new Date(now-2000).toISOString()},{sourceStartedAt:new Date(now-70000).toISOString()},{cardCode:"other"},{id:"../file"},{scannedAt:"invalid"}])assert.throws(()=>validatePackingCapture({...raw,...patch},now));
});
test("proof metadata and its bucket stay private and cannot claim ready without a saved file",async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema storage;
      create table public.fulfilment_orders(id text primary key);create table public.dashboard_accounts(id uuid primary key);
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
    await db.exec(await readFile(new URL("../supabase/migrations/20261120105131_packing_proof_videos.sql",import.meta.url),"utf8"));
    const permissions=(await db.query<{anon:boolean;staff:boolean;rls:boolean}>(`select has_table_privilege('anon','packing_proof_videos','select') anon,has_table_privilege('service_role','packing_proof_videos','insert') staff,(select relrowsecurity from pg_class where oid='packing_proof_videos'::regclass) rls`)).rows[0];
    assert.deepEqual(permissions,{anon:false,staff:true,rls:true});
    assert.equal((await db.query<{public:boolean}>("select public from storage.buckets where id='packing-proof'")).rows[0].public,false);
    await db.exec(`insert into fulfilment_orders values ('one');insert into dashboard_accounts values ('00000000-0000-4000-8000-000000000001');`);
    const insert=`insert into packing_proof_videos(id,order_id,card_code,order_barcode,scanned_at,source_started_at,offset_ms,source_path,source_size,source_type,created_by,status) values ('00000000-0000-4000-8000-000000000001','one','NFC-100001','MPI-one',now(),now()-interval '3 seconds',0,'one/source.webm',1000,'video/webm','00000000-0000-4000-8000-000000000001','ready')`;
    await assert.rejects(db.exec(insert),/check constraint/);
  }finally{await db.close();}
});
