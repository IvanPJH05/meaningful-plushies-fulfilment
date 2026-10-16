import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("batch history is transactional, preserves legacy timestamps, and rejects unprivileged writes", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table public.fulfilment_orders(id text primary key,order_number text,status text,updated_at timestamptz,data jsonb);
      create function public.transition_fulfilment_orders(jsonb,text) returns void language plpgsql as $$begin return; end$$;`);
    await db.exec(await readFile(new URL("../supabase/migrations/20261014151522_batch_fulfilment.sql",import.meta.url),"utf8"));
    await db.exec(`insert into fulfilment_batches(id,stage,created_by,created_at,completed_at) values('00000000-0000-4000-8000-000000000001','complete','Staff','2026-10-15 01:00Z','2026-10-15 02:00Z');
      insert into fulfilment_orders values('old','1000','sent_for_sewing',now(),'{}'),('new','1001','uploading_audio',now(),'{}');
      insert into fulfilment_batch_orders values('old','00000000-0000-4000-8000-000000000001','2026-10-15 01:59Z','Staff');`);
    const before = await db.query("select to_jsonb(b) value from fulfilment_batches b");
    await db.exec(await readFile(new URL("../supabase/migrations/20261016030257_batch_action_history.sql",import.meta.url),"utf8"));
    assert.deepEqual((await db.query("select to_jsonb(b) value from fulfilment_batches b")).rows,before.rows);
    const legacy = await db.query<{action:string; at:string}>("select action,created_at::text at from fulfilment_batch_events order by created_at");
    assert.deepEqual(legacy.rows.map(row=>row.action),['created','nfc','completed']);
    assert.equal(new Date(legacy.rows[0].at).toISOString(),'2026-10-15T01:00:00.000Z');
    const id='00000000-0000-4000-8000-000000000002';
    const mutate=async(action:string,version:number,payload:object)=>db.query("select mutate_fulfilment_batch($1,$2,$3,$4::jsonb,'Staff')",[action,id,version,JSON.stringify(payload)]);
    await mutate('create',1,{orderIds:['new']});
    await mutate('create',1,{orderIds:['new']}); // lost-response retry
    assert.equal((await db.query<{n:number}>("select count(*)::int n from fulfilment_batch_events where batch_id=$1",[id])).rows[0].n,1);
    await assert.rejects(mutate('advance',999,{stage:'labels'}),/BATCH_CHANGED/);
    assert.equal((await db.query<{n:number}>("select count(*)::int n from fulfilment_batch_events where batch_id=$1",[id])).rows[0].n,1);
    await mutate('labels',2,{labels:[{orderId:'new',url:'fixture',fileName:'label.pdf',source:'jnt'}]});
    await mutate('advance',3,{stage:'labels'});
    const events=await db.query<{action:string; details:{orderNumbers:string[]}}>("select action,details from fulfilment_batch_events where batch_id=$1 order by id",[id]);
    assert.deepEqual(events.rows.map(row=>row.action),['created','labels','advance']);
    assert.deepEqual(events.rows[1].details.orderNumbers,['1001']);
    await mutate('advance',4,{stage:'printing'});
    await mutate('envelope_names',5,{names:{new:'BILLY'}});
    await mutate('advance',6,{stage:'envelopes'});
    await mutate('advance',7,{stage:'audio'});
    await mutate('nfc',8,{orderId:'new'});
    assert.equal((await db.query<{stage:string}>("select stage from fulfilment_batches where id=$1",[id])).rows[0].stage,'complete');
    assert.equal((await db.query<{n:number}>("select count(*)::int n from fulfilment_batch_events where batch_id=$1 and action='completed'",[id])).rows[0].n,1);
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from fulfilment_batch_events'),/permission denied/);
    await db.exec('reset role');
  } finally { await db.close(); }
});
