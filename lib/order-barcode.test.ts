import assert from "node:assert/strict";
import test from "node:test";

import { orderBarcodeValue } from "./order-barcode.ts";

test("uses the fulfilment order number, not a courier tracking value", () => {
  assert.equal(orderBarcodeValue({ id: "order-1", orderNumber: "1737", salesChannel: "shopify" }), "MP-1737");
});

test("keeps TikTok scanner barcodes short and staff-facing", () => {
  assert.equal(orderBarcodeValue({ id: "tiktok-1", orderNumber: "TT1162 586066295596352590", salesChannel: "tiktok" }), "MP-TT1162");
});
