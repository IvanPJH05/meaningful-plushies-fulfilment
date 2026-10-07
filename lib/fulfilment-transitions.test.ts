import assert from "node:assert/strict";
import test from "node:test";

import { productionPrintNextStatus, shouldAdvanceAfterProductionPrint } from "./fulfilment-transitions.ts";
import type { Order } from "./types";

function order(salesChannel: Order["salesChannel"], status: Order["status"]): Pick<Order, "salesChannel" | "status"> {
  return { salesChannel, status };
}

test("moves every stored sales channel from New Order after its production print", () => {
  // Manual/WhatsApp orders are stored as Shopify orders and are covered by
  // the same Shopify case here.
  for (const channel of ["shopify", "tiktok"] as const) {
    assert.equal(shouldAdvanceAfterProductionPrint(order(channel, "new_order")), true, channel);
  }
  assert.equal(productionPrintNextStatus, "uploading_audio");
});

test("does not rewind an order already beyond New Order", () => {
  assert.equal(shouldAdvanceAfterProductionPrint(order("tiktok", "uploading_audio")), false);
  assert.equal(shouldAdvanceAfterProductionPrint(order("shopify", "packed")), false);
});
