import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
process.on('uncaughtException', error => {
  console.error(error.message, error.position || '', error.where || '');
  process.exit(1);
});

const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role; create schema internal;
  create table fulfilment_orders(id text primary key, data jsonb not null, status text, order_date timestamptz default now(), updated_at timestamptz default now());
  create table nfc_cards(id bigint primary key, public_token text unique, status text, order_id text references fulfilment_orders(id), programmed_at timestamptz, paired_at timestamptz, paired_by text,
    check(status <> 'assigned' or (order_id is not null and programmed_at is not null and paired_at is not null)));
  create unique index nfc_one_active_card_per_order on nfc_cards(order_id) where status='assigned';
  create table customisation_sessions(fulfilment_order_id text, certificate_code text);
  create table certificate_sync_jobs(order_id text primary key, revision int default 1, synced_revision int default 0, next_attempt_at timestamptz default now(), attempts int default 0, last_error text);
  create table nfc_pairing_logs(card_id bigint,order_id text,action text,actor text,reason text);
`);
await db.exec(await readFile(new URL('../supabase/migrations/20261118193729_nfc_customer_activation.sql', import.meta.url), 'utf8'));
await db.exec(await readFile(new URL('../supabase/migrations/20261119043205_nfc_tiktok_customer_activation.sql', import.meta.url), 'utf8'));
await db.exec(`
  insert into fulfilment_orders(id,status,data) values
    ('one','shipped','{"orderNumber":"2000-1","phone":"+60123456789","character":"Billy","status":"shipped"}'),
    ('two','new_order','{"orderNumber":"2000-2","phone":"0123456789","character":"Tootsie","status":"new_order"}'),
    ('other','new_order','{"orderNumber":"3000","phone":"0198765432","character":"Billy"}'),
    ('issue','issue','{"phone":"0123456789","character":"Billy"}'),
    ('charm','shipped','{"phone":"0123456789","productType":"plush_charm"}');
  insert into nfc_cards(id,public_token,status,programmed_at) values
    (100001,repeat('a',32),'available',now()),(100002,repeat('b',32),'available',now()),
    (100003,repeat('c',32),'available',now()),(100004,repeat('d',32),'available',null),
    (100005,repeat('e',32),'voided',now());
`);
async function verify(token, phone, session, client = 'c'.repeat(64)) {
  return (await db.query('select verify_customer_nfc_phone($1,$2,$3,$4) as result', [token, phone, session, client])).rows[0].result;
}
async function submit(token, session, order, fields) {
  return db.query('select submit_customer_nfc_activation($1,$2,$3,$4::jsonb)', [token, session, order, JSON.stringify(fields)]);
}
const fields = { plushName: 'BAMBAM', character: 'Billy', plushGender: 'Female', plushBirthDate: '2026-11-19', plushBirthPlace: 'Perak', plushFavouritePerson: 'Family', plushBelongsTo: 'Me', meaningfulNote: 'You are loved. 💙', status: 'issue', phone: 'changed' };
assert.equal((await verify('a'.repeat(32), '0191111111', '0'.repeat(64))).verified, false);
const match = await verify('a'.repeat(32), '012-345 6789', 'a'.repeat(64));
assert.equal(match.verified, true);
assert.deepEqual(match.orders.map(order => order.id).sort(), ['one','two']);
assert.equal(JSON.stringify(match).includes('phone'), false);
await submit('a'.repeat(32), 'a'.repeat(64), 'one', fields);
const saved = (await db.query("select status,data from fulfilment_orders where id='one'")).rows[0];
assert.equal(saved.status, 'shipped');
assert.equal(saved.data.status, 'shipped');
assert.equal(saved.data.phone, '+60123456789');
assert.equal(saved.data.plushName, 'BAMBAM');
assert.equal(saved.data.certificateCode, 'nfc-100001');
const revision = (await db.query("select revision from certificate_sync_jobs where order_id='one'")).rows[0].revision;
await submit('a'.repeat(32), 'a'.repeat(64), 'one', fields);
assert.equal((await db.query("select revision from certificate_sync_jobs where order_id='one'")).rows[0].revision, revision);
await assert.rejects(submit('a'.repeat(32), 'a'.repeat(64), 'one', { ...fields, plushName: 'Changed' }), /NFC_ACTIVATION_CHANGED/);
assert.equal((await db.query("select customer_nfc_activation_state(repeat('a',32)) as state")).rows[0].state, 'processing');
await db.exec("update certificate_sync_jobs set synced_revision=revision where order_id='one'");
assert.equal((await db.query("select customer_nfc_activation_state(repeat('a',32)) as state")).rows[0].state, 'assigned');
const second = await verify('b'.repeat(32), '+60 12 345 6789', 'b'.repeat(64));
assert.deepEqual(second.orders.map(order => order.id), ['two']);
await assert.rejects(submit('b'.repeat(32), 'b'.repeat(64), 'other', fields), /NFC_ACTIVATION_ORDER/);
await assert.rejects(submit('b'.repeat(32), 'b'.repeat(64), 'one', fields), /NFC_ACTIVATION_CHANGED/);
await assert.rejects(submit('b'.repeat(32), 'b'.repeat(64), 'two', fields), /NFC_ACTIVATION_FIELDS/);
await db.exec("update nfc_activation_sessions set expires_at=now()-interval '1 minute' where token_hash=repeat('b',64)");
await assert.rejects(submit('b'.repeat(32), 'b'.repeat(64), 'two', {...fields,character:'Tootsie'}), /NFC_ACTIVATION_EXPIRED/);
assert.equal((await verify('d'.repeat(32), '0123456789', 'd'.repeat(64))).verified, false);
assert.equal((await verify('e'.repeat(32), '0123456789', 'e'.repeat(64))).verified, false);
for (let attempt = 0; attempt < 10; attempt++) await verify('c'.repeat(32), '01199999999', 'f'.repeat(64), 'f'.repeat(64));
assert.equal((await verify('c'.repeat(32), '0123456789', 'f'.repeat(64), 'f'.repeat(64))).limited, true);
assert.equal((await db.query('select count(*)::int as total from nfc_pairing_logs')).rows[0].total, 1);
assert.equal((await db.query("select data ? 'plushName' as edited from fulfilment_orders where id='two'")).rows[0].edited, false);
const grants = await db.query("select has_function_privilege('anon','public.submit_customer_nfc_activation(text,text,text,jsonb)','EXECUTE') as allowed");
assert.equal(grants.rows[0].allowed, false);
await db.exec("update nfc_cards set status='available',order_id=null,paired_at=null where id=100001");
assert.equal((await db.query('select count(*)::int as total from nfc_customer_activations')).rows[0].total, 0);
await assert.rejects(submit('a'.repeat(32), 'a'.repeat(64), 'one', fields), /NFC_ACTIVATION_CHANGED/);
assert.equal((await verify('a'.repeat(32), '0123456789', '1'.repeat(64))).verified, true);
await db.exec(`
  insert into fulfilment_orders(id,status,data) values
    ('tiktok-587054972893001234','shipped','{"orderNumber":"TT1500 587054972893001234-1","salesChannel":"tiktok","phone":"***","character":"Billy"}'),
    ('tiktok-587054972893001234-item-987654','shipped','{"orderNumber":"TT1500 587054972893001234-2","salesChannel":"tiktok","phone":"***","character":"Tootsie"}'),
    ('tiktok-587011111111999999','shipped','{"orderNumber":"TT1501 587011111111999999","salesChannel":"tiktok","phone":"***","character":"Billy"}'),
    ('tiktok-587054972893889798','shipped','{"orderNumber":"TT1502 587054972893889798","salesChannel":"tiktok","character":"Billy"}'),
    ('tiktok-587099999999889798','issue','{"orderNumber":"TT1503 587099999999889798","salesChannel":"tiktok","character":"Billy"}'),
    ('legacy-tiktok-item','shipped','{"orderNumber":"TT1504 587011111111003456-1","salesChannel":"tiktok","character":"Hunnie"}'),
    ('shopify-123456','shipped','{"orderNumber":"999999","salesChannel":"shopify","character":"Billy"}');
  insert into nfc_cards(id,public_token,status,programmed_at) values
    (100006,repeat('f',32),'available',now()),(100007,repeat('1',32),'available',now()),(100008,repeat('2',32),'available',now());
`);
async function verifyTiktok(token, digits, session, full = '') {
  return (await db.query('select verify_customer_nfc_tiktok($1,$2,$3,$4,$5) as result', [token, digits, session, '9'.repeat(64), full])).rows[0].result;
}
assert.equal((await verifyTiktok('f'.repeat(32), '01234', '5'.repeat(64))).verified, false);
const tiktokMatch = await verifyTiktok('f'.repeat(32), '001234', '5'.repeat(64));
assert.equal(tiktokMatch.verified, true);
assert.equal(tiktokMatch.orders.length, 2);
assert.deepEqual(tiktokMatch.orders.map(order => order.itemNumber), ['1','2']);
assert.ok(tiktokMatch.orders.every(order => order.id.startsWith('tiktok-587054972893001234')));
await assert.rejects(submit('f'.repeat(32), '5'.repeat(64), 'tiktok-587011111111999999', fields), /NFC_ACTIVATION_ORDER/);
await submit('f'.repeat(32), '5'.repeat(64), 'tiktok-587054972893001234-item-987654', {...fields,character:'Tootsie'});
await submit('f'.repeat(32), '5'.repeat(64), 'tiktok-587054972893001234-item-987654', {...fields,character:'Tootsie'});
assert.equal((await db.query("select verification_method from nfc_activation_sessions where token_hash=repeat('5',64)")).rows[0].verification_method, 'tiktok');
const remaining = await verifyTiktok('1'.repeat(32), '001234', '6'.repeat(64));
assert.equal(remaining.orders.length, 1);
assert.equal(remaining.orders[0].id, 'tiktok-587054972893001234');
const collision = await verifyTiktok('1'.repeat(32), '889798', '7'.repeat(64));
assert.equal(collision.verified, false);
assert.equal(collision.needsFullOrderId, true);
assert.equal(collision.orders, undefined);
assert.equal((await verifyTiktok('1'.repeat(32), '889798', '7'.repeat(64), '587011111111999999')).verified, false);
const resolved = await verifyTiktok('1'.repeat(32), '889798', '7'.repeat(64), '587054972893889798');
assert.equal(resolved.verified, true);
assert.equal(resolved.orders.length, 1);
const legacy = await verifyTiktok('2'.repeat(32), '003456', '8'.repeat(64));
assert.equal(legacy.verified, true);
assert.equal(legacy.orders[0].id, 'legacy-tiktok-item');
assert.equal((await verifyTiktok('c'.repeat(32), '999999', '0'.repeat(64))).limited, true);
assert.equal((await db.query("select has_function_privilege('anon','public.verify_customer_nfc_tiktok(text,text,text,text,text)','EXECUTE') as allowed")).rows[0].allowed, false);
await db.close();
console.log('PASS: phone and TikTok verification, leading-zero suffixes, individual items, suffix collisions, atomic activation, retry safety, order ownership, expired verification, rate limits and service-only access.');
