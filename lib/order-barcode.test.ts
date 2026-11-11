import assert from "node:assert/strict";
import test from "node:test";

import { orderBarcodeValue, packingItemBarcodeValue } from "./order-barcode.ts";

test("new packing codes distinguish individual plushies in the same order", () => {
  assert.equal(packingItemBarcodeValue({id:"1970-1",orderNumber:"1970"}),"MPI-1970-1");
  assert.equal(packingItemBarcodeValue({id:"1970-2",orderNumber:"1970"}),"MPI-1970-2");
  assert.notEqual(packingItemBarcodeValue({id:"1970-1"}),packingItemBarcodeValue({id:"1970-2"}));
});

test("uses the fulfilment order number, not a courier tracking value", () => {
  assert.equal(orderBarcodeValue({ id: "order-1", orderNumber: "1737", salesChannel: "shopify" }), "MP-1737");
});

test("keeps TikTok scanner barcodes short and staff-facing", () => {
  assert.equal(orderBarcodeValue({ id: "tiktok-1", orderNumber: "TT1162 586066295596352590", salesChannel: "tiktok" }), "MP-TT1162");
});
