import assert from "node:assert/strict";
import test from "node:test";

import { identifyShippingLabel } from "./shipping-labels.ts";

test("finds the Shopify order in the J&T Remark field on the first PDF page", () => {
  assert.deepEqual(identifyShippingLabel("J&T EXPRESS #1737 Remark\uFF1A MONTHLY"), { source: "jnt", reference: "1737" });
});

test("finds J&T references when the remark label is written first", () => {
  assert.deepEqual(identifyShippingLabel("Remark: #1737"), { source: "jnt", reference: "1737" });
});

test("finds TikTok order IDs without mistaking the tracking barcode for the order", () => {
  assert.deepEqual(identifyShippingLabel("Order ID: 586066295596352590 Tracking: 680025563425511"), { source: "tiktok", reference: "586066295596352590" });
});
