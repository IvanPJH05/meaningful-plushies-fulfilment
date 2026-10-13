import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema internal;
create table public.fulfilment_orders(id text primary key,order_number text,status text,order_date timestamptz,updated_at timestamptz,data jsonb);
create table public.fulfilment_order_summaries(id text primary key,data jsonb);
create table public.dashboard_accounts(id text primary key,display_name text,username text,role text,active boolean);
create table public.dashboard_sessions(token uuid,account_id text,expires_at timestamptz);
create function internal.sync_test_summary() returns trigger language plpgsql as $$begin insert into public.fulfilment_order_summaries values(new.id,new.data - 'tikTokFileDataUrl' - 'photoDataUrl') on conflict(id) do update set data=excluded.data; return new; end;$$;
create trigger summaries after insert or update on public.fulfilment_orders for each row execute function internal.sync_test_summary();
`);
await db.exec(await readFile(new URL('../supabase/migrations/20261013151356_atomic_fulfilment_transitions.sql', import.meta.url), 'utf8'));
await db.query(`insert into fulfilment_orders values('test','TEST','packed',now(),'2026-10-14T00:00:00.123456Z',$1::jsonb)`, [JSON.stringify({
  id: 'test', orderNumber: 'TEST', status: 'packed', statusHistory: [], totalAmount: 99,
  customerName: 'Original', internalNotes: 'Old note', tikTokFileDataUrl: 'data:audio/test;base64,abc', photoDataUrl: 'data:image/test;base64,xyz',
})]);
// Exercise the actual endpoint UPDATE against Postgres, including its triggers.
const route = await readFile(new URL('../app/api/fulfilment/orders/edit/route.ts', import.meta.url), 'utf8');
const authSql = route.match(/select a\.display_name[\s\S]*?and a\.active/)[0].replace('${token}', '$1');
const token = '11111111-1111-1111-1111-111111111111';
await db.exec(`insert into dashboard_accounts values('admin','Test','admin','admin',true);
insert into dashboard_sessions values('${token}','admin',now()+interval '1 hour');`);
assert.equal((await db.query(authSql, [token])).rows[0].role, 'admin');
await db.exec(`update dashboard_accounts set active=false`);
assert.equal((await db.query(authSql, [token])).rows.length, 0, 'Inactive accounts cannot save');
await db.exec(`update dashboard_accounts set active=true; update dashboard_sessions set expires_at=now()-interval '1 hour'`);
assert.equal((await db.query(authSql, [token])).rows.length, 0, 'Expired sessions cannot save');
const template = route.match(/update public\.fulfilment_orders o[\s\S]*?as data/)[0];
const sql = template.replace('${JSON.stringify(edit.patch)}', '$1').replace('${edit.orderId}', '$2').replace('${edit.expectedUpdatedAt}', '$3');
const call = (patch, version) => db.query(sql, [JSON.stringify(patch), 'test', version]);
const original = '2026-10-14T00:00:00.123456Z';
const [a, b] = await Promise.all([call({ customerName: 'First editor' }, original), call({ internalNotes: 'Stale editor' }, original)]);
assert.equal(a.rows.length + b.rows.length, 1, 'Only one concurrent edit can commit');
assert.equal(b.rows.length, 0, 'The second editor is rejected');
const stored = (await db.query(`select data,updated_at::text as version from fulfilment_orders where id='test'`)).rows[0];
assert.equal(stored.data.customerName, 'First editor');
assert.equal(stored.data.internalNotes, 'Old note');
assert.equal(stored.data.totalAmount, 99);
assert.equal(stored.data.status, 'packed');
assert.equal(stored.data.tikTokFileDataUrl, 'data:audio/test;base64,abc');
assert(!('tikTokFileDataUrl' in a.rows[0].data));
assert(!('photoDataUrl' in a.rows[0].data));
assert.equal((await call({ internalNotes: '' }, stored.version)).rows.length, 1, 'Explicit clearing works');
assert.equal((await db.query(`select data->>'internalNotes' as note from fulfilment_orders where id='test'`)).rows[0].note, '');
// A failed audit write must roll back the order mutation in the same transaction.
const version = (await db.query(`select updated_at::text as version from fulfilment_orders where id='test'`)).rows[0].version;
await assert.rejects(db.transaction(async tx => {
  await tx.query(sql, [JSON.stringify({ customerName: 'Rollback me' }), 'test', version]);
  await tx.exec('select 1/0');
}));
assert.equal((await db.query(`select data->>'customerName' as name from fulfilment_orders where id='test'`)).rows[0].name, 'First editor');
console.log('PASS: valid/inactive/expired sessions, concurrent edit conflict, partial merge, media preservation, compact response, explicit clearing, audit failure rollback');
await db.close();
