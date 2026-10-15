import test from "node:test";
import assert from "node:assert/strict";
import { compactOrderLabel, defaultTableLayout, normalizeTableLayout } from "./table-layout.ts";

test("shortens TikTok display without changing its searchable original or split indicator", () => {
  const order = { orderNumber: "TT1321 586581292406506537", salesChannel: "tiktok", setIndicator: "1/2" };
  assert.equal(compactOrderLabel(order), "TT1321 6537 1/2");
  assert.equal(order.orderNumber, "TT1321 586581292406506537");
  assert.equal(compactOrderLabel({ orderNumber: "1898", salesChannel: "shopify" }), "#1898");
  assert.equal(compactOrderLabel({ orderNumber: "TT5", salesChannel: "tiktok" }), "#TT5");
});
test("repairs malformed persisted preferences while preserving custom order and hidden columns", () => {
  const result = normalizeTableLayout([null, { key: "address", visible: true, width: 9999 }, { key: "phone", visible: false, width: NaN }, { key: "address", visible: true }, { key: "unknown" }, { key: "orderNumber", visible: false, width: -20 }], "orders");
  assert.equal(result[0].key, "address");
  assert.equal(result[0].width, 600);
  assert.equal(result.find(col => col.key === "phone")?.visible, false);
  assert.equal(result.find(col => col.key === "phone")?.width, 145);
  assert.equal(result.find(col => col.key === "orderNumber")?.visible, true);
  assert.equal(new Set(result.map(col => col.key)).size, result.length);
  assert.deepEqual(normalizeTableLayout("corrupt", "orders"), defaultTableLayout("orders"));
});
test("customer and production defaults are independent", () => {
  const orders = defaultTableLayout("orders").filter(col => col.visible).map(col => col.key);
  const fulfilment = defaultTableLayout("fulfilment").filter(col => col.visible).map(col => col.key);
  assert(orders.includes("customerName"));
  assert(!fulfilment.includes("customerName"));
  assert(fulfilment.includes("idWebsiteLink"));
});
