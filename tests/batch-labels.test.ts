import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("TikTok COD requires a paired label while non-TikTok COD keeps its existing exemption",async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table fulfilment_orders(id text primary key,order_number text,status text,updated_at timestamptz,data jsonb);
 create function transition_fulfilment_orders(jsonb,text) returns void language plpgsql as $$begin return;end$$;`);
 for(const file of ['20261014151522_batch_fulfilment.sql','20261014163339_retry_safe_batch_nfc.sql','20261016030257_batch_action_history.sql','20261018150218_batch_envelope_defaults.sql','20261019161543_tiktok_batch_shipping_labels.sql']) await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 const tt='00000000-0000-4000-8000-000000000001',shop='00000000-0000-4000-8000-000000000002';
 await db.query("insert into fulfilment_batches(id,stage,created_by) values($1,'labels','Test'),($2,'labels','Test')",[tt,shop]);
 await db.exec(`insert into fulfilment_orders values('tt','TT1339','uploading_audio',now(),'{"salesChannel":"tiktok","paymentProcessor":"COD"}'),('shop','2000','uploading_audio',now(),'{"salesChannel":"shopify","paymentProcessor":"COD"}');`);
 await db.query("insert into fulfilment_batch_orders(order_id,batch_id) values('tt',$1),('shop',$2)",[tt,shop]);
 const advance=(id:string)=>db.query("select mutate_fulfilment_batch('advance',$1,1,'{\"stage\":\"labels\"}'::jsonb,'Test')",[id]);
 await assert.rejects(advance(tt),/SHIPPING_LABEL_REQUIRED/);
 await advance(shop);
 await db.exec(`update fulfilment_orders set data=data||'{"shippingLabelUrl":"fixture-label"}'::jsonb where id='tt'`);
 await advance(tt);
 assert.deepEqual((await db.query<{stage:string}>('select stage from fulfilment_batches order by number')).rows.map(x=>x.stage),['printing','printing']);
 }finally{await db.close();}
});
