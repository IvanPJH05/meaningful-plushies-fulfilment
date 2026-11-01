import test from "node:test";
import assert from "node:assert/strict";
import { completeManualOrderCreation } from "./manual-order-completion.ts";

test("records the created order before shipping repair and preserves success if repair fails", async () => {
  const calls: string[] = [];
  const result = await completeManualOrderCreation(async () => { calls.push("created"); return {shopifyOrderId:"123",shopifyOrderName:"#1974"}; }, async () => {
    assert.deepEqual(calls,["created"]); calls.push("repair"); throw new Error("Shopify timeout");
  });
  assert.equal(result.shopifyOrderId,"123");
  assert.match(result.shippingWarning,/delivery address/);
});
test("successful repair returns no warning; an unconfirmed repair remains visible", async () => {
  assert.equal((await completeManualOrderCreation(async()=>({id:"saved"}),async()=>true)).shippingWarning,"");
  assert.match((await completeManualOrderCreation(async()=>({id:"saved"}),async()=>false)).shippingWarning,/CHECK \/ FIX SHIPPING/);
});
test("a failed status save stops follow-up work so the existing Shopify order can be reconciled on retry", async () => {
  let repaired=false;
  await assert.rejects(completeManualOrderCreation(async()=>{throw new Error("Database unavailable");},async()=>{repaired=true;return true;}),/Database unavailable/);
  assert.equal(repaired,false);
});
