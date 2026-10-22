import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("mixed batches require only plushie envelopes and charm-only batches can advance", async () => {
 const db = new PGlite();
 try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
   create table fulfilment_orders(id text primary key,order_number text,status text,updated_at timestamptz,data jsonb);
   create function transition_fulfilment_orders(jsonb,text) returns void language plpgsql as $$begin return; end$$;`);
  for(const file of ['20261014151522_batch_fulfilment.sql','20261014163339_retry_safe_batch_nfc.sql','20261016030257_batch_action_history.sql','20261018150218_batch_envelope_defaults.sql']) await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  const mixed='00000000-0000-4000-8000-000000000001', charms='00000000-0000-4000-8000-000000000002';
  await db.query(`insert into fulfilment_batches(id,stage,created_by) values($1,'envelopes','Test'),($2,'envelopes','Test')`,[mixed,charms]);
  await db.exec(`insert into fulfilment_orders values ('classic','1','uploading_audio',now(),'{"character":"Billy"}'),('charm','2','uploading_audio',now(),'{"product":"Meaningful Plush Charms"}'),('snowy','3','uploading_audio',now(),'{"productType":"snowy_charm"}');`);
  await db.query(`insert into fulfilment_batch_orders(order_id,batch_id) values('classic',$1),('charm',$1),('snowy',$2)`,[mixed,charms]);
  const mutate=(action:string,id:string,version:number,payload:object)=>db.query("select mutate_fulfilment_batch($1,$2,$3,$4::jsonb,'Test')",[action,id,version,JSON.stringify(payload)]);
  await assert.rejects(mutate('envelope_names',mixed,1,{names:{}}),/ENVELOPE_NAME_REQUIRED/);
  await assert.rejects(mutate('advance',mixed,1,{stage:'envelopes'}),/ENVELOPE_NAME_REQUIRED/);
  await mutate('envelope_names',mixed,1,{names:{classic:'Billy'}});
  await mutate('advance',mixed,2,{stage:'envelopes'});
  await mutate('advance',charms,1,{stage:'envelopes'});
  assert.deepEqual((await db.query<{stage:string}>('select stage from fulfilment_batches order by number')).rows.map(x=>x.stage),['audio','audio']);
  assert.equal((await db.query<{allowed:boolean}>("select has_function_privilege('anon','mutate_fulfilment_batch_internal(text,uuid,integer,jsonb,text)','execute') allowed")).rows[0].allowed,false);
 } finally {await db.close();}
});
