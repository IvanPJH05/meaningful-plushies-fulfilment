import { PGlite } from '../work/status-validation/node_modules/@electric-sql/pglite/dist/index.js';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema internal;
create table public.fulfilment_orders(id text primary key,order_number text,status text,order_date timestamptz,updated_at timestamptz,data jsonb);
create table public.fulfilment_order_summaries(id text primary key,data jsonb);
create function internal.sync_test_summary() returns trigger language plpgsql as $$begin insert into public.fulfilment_order_summaries values(new.id,new.data - 'tikTokFileDataUrl' - 'photoDataUrl') on conflict(id) do update set data=excluded.data; return new; end;$$;
create trigger summaries after insert or update on public.fulfilment_orders for each row execute function internal.sync_test_summary();
`);
await db.exec(await readFile(new URL('../supabase/migrations/20261013151356_atomic_fulfilment_transitions.sql', import.meta.url), 'utf8'));
for (const id of ['a','b','c']) {
 await db.query(`insert into fulfilment_orders values($1,$1,'new_order',now(),now(),$2::jsonb)`,[id, JSON.stringify({id,status:'new_order',updatedAt:new Date().toISOString(),statusHistory:[],tikTokFileDataUrl:'data:audio/test;base64,abc'})]);
}
const call = async transitions => (await db.query(`select transition_fulfilment_orders($1::jsonb,'test') result`,[JSON.stringify(transitions)])).rows[0].result;
const move = id => ({orderId:id,fromStatus:'new_order',toStatus:'uploading_audio'});
const result = await call([move('a'),move('b')]);
assert.equal(result.length,2);
assert(result.every(o=>o.status==='uploading_audio' && !o.tikTokFileDataUrl));
assert.equal((await call([move('a'),move('b')]))[0].statusHistory.length,1);
await assert.rejects(call([move('c'),{orderId:'b',fromStatus:'new_order',toStatus:'packed'}]),/ORDER_CHANGED/);
assert.equal((await db.query(`select status from fulfilment_orders where id='c'`)).rows[0].status,'new_order');
await assert.rejects(call([move('c'),move('c')]),/INVALID_TRANSITIONS/);
await assert.rejects(call([move('c'),move('missing')]),/ORDER_NOT_FOUND/);
assert.equal((await db.query(`select status from fulfilment_orders where id='c'`)).rows[0].status,'new_order');
await db.query(`update fulfilment_orders set status='new_order',data=$1::jsonb where id='a'`,[JSON.stringify({id:'a',status:'new_order',statusHistory:[],internalNotes:'ordinary edit',tikTokFileDataUrl:'data:audio/test;base64,abc'})]);
const guarded = (await db.query(`select status,data from fulfilment_orders where id='a'`)).rows[0];
assert.equal(guarded.status,'uploading_audio'); assert.equal(guarded.data.statusHistory.length,1); assert.equal(guarded.data.internalNotes,'ordinary edit');
assert.equal(guarded.data.tikTokFileDataUrl,'data:audio/test;base64,abc');
await assert.rejects(db.exec(`set role anon; select transition_fulfilment_orders('[]','test')`),/permission denied/);
await db.exec('reset role');
console.log('PASS: batch move, compact result, idempotent retry, conflict rollback, duplicate/missing validation, stale-write protection, media preservation, RPC access restriction');
await db.close();
