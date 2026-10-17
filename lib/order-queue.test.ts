import test from "node:test";
import assert from "node:assert/strict";
import { isRemovedFromQueue } from "./order-queue.ts";

const order = { status: "issue" as const, statusHistory: [], internalNotes: "" };
test("removed orders leave All but remain identifiable in Issues", () => {
  assert.equal(isRemovedFromQueue({ ...order, internalNotes: "Staff note\ndeleted order" }), true);
  assert.equal(isRemovedFromQueue(order), false);
  assert.equal(isRemovedFromQueue({ ...order, statusHistory: [{ id: "1", status: "issue", changedAt: "2026-10-16", changedBy: "admin", note: "deleted order" }] }), true);
});
test("restored orders return to the queue and unrelated notes do not hide orders", () => {
  assert.equal(isRemovedFromQueue({ ...order, status: "new_order", internalNotes: "deleted order" }), false);
  assert.equal(isRemovedFromQueue({ ...order, internalNotes: "Check deleted order details" }), false);
});


test("queue removal persists the issue status and note across independent reads", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { readFile } = await import("node:fs/promises");
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema internal;
      create table public.fulfilment_orders(id text primary key, status text, updated_at timestamptz, data jsonb);
      create view public.fulfilment_order_summaries as select id,data from public.fulfilment_orders;`);
    await db.exec(await readFile(new URL("../supabase/migrations/20261013151356_atomic_fulfilment_transitions.sql", import.meta.url), "utf8"));
    await db.query("insert into public.fulfilment_orders values ('queue-test','new_order',now(),$1::jsonb)", [JSON.stringify({ id: "queue-test", status: "new_order", statusHistory: [], internalNotes: "Existing note" })]);
    const move = () => db.query("select public.transition_fulfilment_orders($1::jsonb,'Admin')", [JSON.stringify([{orderId:"queue-test",fromStatus:"new_order",toStatus:"issue",note:"deleted order"}])]);
    await move();
    await move(); // Lost-response retry must not duplicate history.
    const saved = await db.query<{ data: Parameters<typeof isRemovedFromQueue>[0] }>("select data from public.fulfilment_orders where id='queue-test'");
    const otherClientRead = await db.query<{ data: Parameters<typeof isRemovedFromQueue>[0] }>("select data from public.fulfilment_order_summaries where id='queue-test'");
    assert.equal(saved.rows[0].data.status, "issue");
    assert.equal(saved.rows[0].data.internalNotes, "Existing note");
    assert.equal(saved.rows[0].data.statusHistory.length, 1);
    assert.equal(isRemovedFromQueue(otherClientRead.rows[0].data), true);
  } finally { await db.close(); }
});
