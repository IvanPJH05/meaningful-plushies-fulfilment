import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { orderDeliverySchedule, deliveryHold } from "./order-delivery-schedule.ts";
import { parseOrderEdit } from "./order-edit.ts";
test("West and East needed-by dates calculate their production and shipping windows",()=>{
  const west=orderDeliverySchedule({deliveryNeededBy:"2026-12-05",deliveryRegion:"west"},new Date("2026-11-20T00:00:00Z"))!;
  assert.equal(west.unlockDate,"2026-12-01");assert.equal(west.shipByDate,"2026-12-03");assert.equal(west.held,true);
  const east=orderDeliverySchedule({deliveryNeededBy:"2026-12-08",deliveryRegion:"east"})!;
  assert.equal(east.unlockDate,"2026-12-01");assert.equal(east.shipByDate,"2026-12-03");
  assert.equal(orderDeliverySchedule({deliveryNeededBy:"2028-03-04",deliveryRegion:"west"})!.unlockDate,"2028-02-29");
  assert.equal(deliveryHold({deliveryNeededBy:"2026-12-05",deliveryRegion:"west"},new Date("2026-11-30T15:59:59Z")),true);
  assert.equal(deliveryHold({deliveryNeededBy:"2026-12-05",deliveryRegion:"west"},new Date("2026-11-30T16:00:00Z")),false);
  assert.equal(deliveryHold({}),false);
});
test("order edits accept only source fields, never caller-supplied calculated dates",()=>{
  const input=(patch:unknown)=>({orderId:"one",expectedUpdatedAt:"2026-11-20T00:00:00Z",patch});
  assert.deepEqual(parseOrderEdit(input({deliveryNeededBy:"2026-12-05",deliveryRegion:"west"})).patch,{deliveryNeededBy:"2026-12-05",deliveryRegion:"west"});
  for(const patch of [{shipByDate:"2026-12-01"},{fulfilmentUnlockDate:"2026-11-20"},{deliveryRegion:"other"},{deliveryNeededBy:"2026-02-29"}]) assert.throws(()=>parseOrderEdit(input(patch)),/INVALID_ORDER_EDIT/);
});
test("delivery-only migration saves dates, preserves syncs, and leaves batch flow unchanged",async()=>{
  const db=new PGlite(), token="00000000-0000-4000-8000-000000000001";
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema internal;
      create table public.dashboard_accounts(id uuid primary key,display_name text,username text,role text,active boolean);
      create table public.dashboard_sessions(token uuid,account_id uuid,expires_at timestamptz);
      create table public.fulfilment_orders(id text primary key,status text,updated_at timestamptz,data jsonb);
      create view public.fulfilment_order_summaries as select id,data from public.fulfilment_orders;
      create table public.production_items(order_id text,batch_id uuid,disposition text default 'active');
      create table public.fulfilment_batch_orders(order_id text);
      create table public.activity_events(id text,order_number text,action text,detail text,actor text,created_at timestamptz);`);
    await db.exec(await readFile(new URL("../supabase/migrations/20261013151356_atomic_fulfilment_transitions.sql",import.meta.url),"utf8"));
    await db.exec(await readFile(new URL("../supabase/migrations/20261120091155_order_delivery_section.sql",import.meta.url),"utf8"));
    await db.query("insert into dashboard_accounts values ($1,'Admin','admin','admin',true)",[token]);
    await db.query("insert into dashboard_sessions values ($1,$1,now()+interval '1 hour')",[token]);
    await db.query("insert into fulfilment_orders values ('one','new_order',now(),$1::jsonb)",[JSON.stringify({id:"one",orderNumber:"2059",status:"new_order",statusHistory:[],totalAmount:199,meaningfulMessage:"customer-audio"})]);
    const row=async()=> (await db.query<{data:Record<string,unknown>;updated_at:Date}>("select data,updated_at from fulfilment_orders where id='one'")).rows[0];
    const edit=async(patch:object,expected?:unknown)=>db.query<{result:Record<string,unknown>}>("select public.edit_fulfilment_order('one',$1,$2::jsonb,$3) result",[expected||(await row()).updated_at,JSON.stringify(patch),token]);
    const before=await row();
    const saved=await edit({deliveryNeededBy:"2099-12-05",deliveryRegion:"west"});
    assert.equal(saved.rows[0].result.shipByDate,"2099-12-03");assert.equal(saved.rows[0].result.fulfilmentUnlockDate,"2099-12-01");
    assert.equal(saved.rows[0].result.totalAmount,199);assert.equal(saved.rows[0].result.meaningfulMessage,"customer-audio");
    await assert.rejects(edit({courier:"wrong"},before.updated_at),/ORDER_CHANGED/);
    await db.query("update fulfilment_orders set data=data-'deliveryNeededBy'-'deliveryRegion'-'shipByDate'-'fulfilmentUnlockDate' where id='one'");
    assert.equal((await row()).data.deliveryNeededBy,"2099-12-05","stale imports cannot erase staff scheduling");
    await edit({courier:"J&T Express"});assert.equal((await row()).data.fulfilmentUnlockDate,"2099-12-01");
    await edit({deliveryNeededBy:"2099-12-08",deliveryRegion:"east"});assert.equal((await row()).data.fulfilmentUnlockDate,"2099-12-01");
    await edit({deliveryNeededBy:"",deliveryRegion:""});assert.equal((await row()).data.shipByDate,"");
    await edit({deliveryNeededBy:"2099-12-08",deliveryRegion:"east"});
    await db.exec("insert into fulfilment_batch_orders values ('one');insert into production_items(order_id) values ('one');");
    await db.query("select transition_fulfilment_orders($1::jsonb,'Admin')",[JSON.stringify([{orderId:"one",fromStatus:"new_order",toStatus:"uploading_audio"}])]);
    assert.equal((await row()).data.status,"uploading_audio","delivery-only release does not add a production lock");
    await assert.rejects(edit({deliveryNeededBy:"2099-12-10",deliveryRegion:"east"}),/DELIVERY_SCHEDULE_STARTED/);
    await edit({courier:"Updated courier"});assert.equal((await row()).data.courier,"Updated courier");
    const denied=await db.query<{allowed:boolean}>("select has_function_privilege('anon','public.edit_fulfilment_order(text,timestamp with time zone,jsonb,uuid)','execute') allowed");
    assert.equal(denied.rows[0].allowed,false);
  } finally {await db.close();}
});
