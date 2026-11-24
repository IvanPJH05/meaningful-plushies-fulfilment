import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();
await db.exec(`create role anon; create role authenticated; create schema internal;
create table public.fulfilment_orders(id text primary key,data jsonb);
create table public.customisation_sessions(id uuid primary key,fulfilment_order_id text,status text,certificate_code text,certificate_metaobject_id text,order_number text,line_item_id text);
alter table public.customisation_sessions enable row level security;
grant usage on schema public to anon;
grant select,insert,update on public.fulfilment_orders to anon;
grant select on public.customisation_sessions to anon;
insert into customisation_sessions values
('00000000-0000-4000-8000-000000000001','2082','submitted','original','object-original','#2082','gid://shopify/LineItem/123'),
('00000000-0000-4000-8000-000000000002','later','awaiting_customisation','later-code','later-object','later',null),
('00000000-0000-4000-8000-000000000003','charm','submitted','charm-code','charm-object','charm',null);
`);
await db.exec(await readFile(new URL('../supabase/migrations/20261124073033_preserve_submitted_certificate_identity.sql',import.meta.url),'utf8'));
// Even a dashboard writer unable to read private sessions must get the same protection.
await db.exec(`set role anon;`);
assert.equal((await db.query('select * from customisation_sessions')).rows.length,0);
await db.exec(`insert into fulfilment_orders values('2082','{"orderNumber":"2082","shopifyLineItemId":"123","certificateCode":"stale","plushName":"ELHA","status":"uploading_audio","meaningfulMessage":"private-audio","trackingNumber":"tracking"}');`);
let row=(await db.query("select data from fulfilment_orders where id='2082'")).rows[0].data;
assert.equal(row.certificateCode,'original');
assert.equal(row.customisationSessionId,'00000000-0000-4000-8000-000000000001');
assert.equal(row.idWebsiteLink,'https://meaningfulplushies.com/pages/certificate/original');
// A late writer that read the old order cannot undo the canonical identity.
await db.exec(`insert into fulfilment_orders values('2082','{"orderNumber":"2082","shopifyLineItemId":"123","certificateCode":"another-code","customisationSessionId":null,"status":"uploading_audio","plushName":"ELHA","meaningfulMessage":"private-audio","trackingNumber":"tracking"}') on conflict(id) do update set data=excluded.data;`);
row=(await db.query("select data from fulfilment_orders where id='2082'")).rows[0].data;
assert.equal(row.certificateCode,'original');
assert.equal(row.status,'uploading_audio');
assert.equal(row.meaningfulMessage,'private-audio');
assert.equal(row.trackingNumber,'tracking');
await db.exec(`update fulfilment_orders set data=data||'{"meaningfulNote":"edited note","certificateCode":""}' where id='2082';`);
row=(await db.query("select data from fulfilment_orders where id='2082'")).rows[0].data;
assert.equal(row.meaningfulNote,'edited note');assert.equal(row.certificateCode,'original');
await assert.rejects(db.exec(`update fulfilment_orders set data=data||'{"shopifyLineItemId":"wrong"}' where id='2082'`),/CERTIFICATE_SESSION_ITEM_MISMATCH/);
await assert.rejects(db.exec(`update fulfilment_orders set data=data||'{"orderNumber":"wrong"}' where id='2082'`),/CERTIFICATE_SESSION_ORDER_MISMATCH/);
await db.exec(`insert into fulfilment_orders values('later','{"orderNumber":"later","certificateCode":"new-code"}'),('charm','{"orderNumber":"charm","productType":"plush_charm","certificateCode":"","idWebsiteLink":"our-link"}'),('legacy','{"orderNumber":"legacy","certificateCode":"legacy-code"}');`);
assert.equal((await db.query("select data from fulfilment_orders where id='later'")).rows[0].data.certificateCode,'new-code');
assert.equal((await db.query("select data from fulfilment_orders where id='charm'")).rows[0].data.idWebsiteLink,'our-link');
assert.equal((await db.query("select data from fulfilment_orders where id='legacy'")).rows[0].data.certificateCode,'legacy-code');
await db.exec(`reset role; insert into customisation_sessions values('00000000-0000-4000-8000-000000000004','2082','submitted','second','second-object','2082',null);`);
await assert.rejects(db.exec(`update fulfilment_orders set data=data||'{"certificateCode":"wrong"}' where id='2082'`),/CERTIFICATE_SESSION_AMBIGUOUS/);
assert.equal((await db.query("select data from fulfilment_orders where id='2082'")).rows[0].data.certificateCode,'original');
await db.close();
console.log('Passed: first save, stale upsert, RLS dashboard save, editable details, order/item mismatch rejection, ambiguity rejection, pending sessions, charms and legacy orders.');
