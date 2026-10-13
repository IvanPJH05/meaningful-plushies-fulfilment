import assert from "node:assert/strict";
import test from "node:test";
import { parseOrderEdit } from "./order-edit.ts";
import { writeOrdersThenSyncAccounting } from "./order-save-outcome.ts";

const edit = (patch: unknown) => ({ orderId: "test-order", expectedUpdatedAt: "2026-10-14T00:00:00.123456+00:00", patch });
test("accepts an explicit empty field without replacing the rest of an order", () => {
  assert.deepEqual(parseOrderEdit(edit({ internalNotes: "", voiceLength: 20 })).patch, { internalNotes: "", voiceLength: 20 });
});
test("rejects financial, stage, identity and prototype keys", () => {
  for (const key of ["totalAmount", "status", "statusHistory", "id", "updatedAt", "paymentProcessor", "__proto__"]) {
    assert.throws(() => parseOrderEdit(edit(JSON.parse(`{"${key}":"bad"}`))), /INVALID_ORDER_EDIT/);
  }
});
test("rejects malformed versions, types and oversized uploads", () => {
  for (const body of [null, edit([]), edit({}), edit({ voiceLength: NaN }), edit({ voiceLength: -1 }),
    edit({ internalNotes: 1 }), edit({ voiceUploadStatus: {} }), edit({ photoDataUrl: "https://example.com" }),
    { ...edit({ phone: "123" }), expectedUpdatedAt: "tomorrow" }]) {
    assert.throws(() => parseOrderEdit(body), /INVALID_ORDER_EDIT/);
  }
});
test("accounting failure does not report a committed order write as failed", async () => {
  const events: string[] = [];
  const result = await writeOrdersThenSyncAccounting(async () => { events.push("saved"); }, async () => {
    events.push("sync"); throw new Error("database timeout");
  });
  assert.deepEqual(events, ["saved", "sync"]);
  assert.equal(result.saved, true);
  assert.match(result.accountingWarning!, /Orders saved/);
});
test("a failed primary write never attempts accounting or claims success", async () => {
  let synced = false;
  await assert.rejects(writeOrdersThenSyncAccounting(async () => { throw new Error("write failed"); }, async () => { synced = true; }), /write failed/);
  assert.equal(synced, false);
});
