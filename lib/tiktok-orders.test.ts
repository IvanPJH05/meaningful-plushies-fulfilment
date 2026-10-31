import assert from "node:assert/strict";
import test from "node:test";

import { extractTikTokOrderIds, tiktokApiOrderToFulfilmentOrder } from "./tiktok-orders.ts";

test("extracts TikTok order IDs from webhook-like payloads", () => {
  assert.deepEqual(extractTikTokOrderIds({
    event: "ORDER_STATUS_CHANGE",
    data: {
      order_id: "584697260225955022",
      nested: [{ orderId: "584775415746234364" }],
    },
  }), ["584697260225955022", "584775415746234364"]);
});

test("shop IDs and tracking numbers are never treated as order IDs", () => {
  assert.deepEqual(extractTikTokOrderIds({ shop_id: "7494633634998879636", timestamp: 1790000000, data: { order_id: "584697260225955022", tracking_number: "123456789123" } }), ["584697260225955022"]);
});

test("unpaid and on-hold orders cannot enter the new production queue", () => {
  for (const status of ["UNPAID", "ON_HOLD", "CANCELLED"]) assert.equal(tiktokApiOrderToFulfilmentOrder({ id: "584697260225955022", status }, []), null);
});

test("sync preserves personalization and flags an existing cancelled order", () => {
  const existing = tiktokApiOrderToFulfilmentOrder({ id: "584697260225955022", status: "AWAITING_SHIPMENT" }, [])!;
  existing.plushName = "Billy";
  existing.tikTokFileDataUrl = "private-audio";
  existing.status = "sent_for_sewing";
  const synced = tiktokApiOrderToFulfilmentOrder({ id: "584697260225955022", status: "CANCELLED" }, [existing])!;
  assert.equal(synced.plushName, "Billy");
  assert.equal(synced.tikTokFileDataUrl, "private-audio");
  assert.equal(synced.status, "issue");
  assert.equal(synced.orderNumber, existing.orderNumber);
});

test("multi-item orders require staff review instead of silently producing just one item", () => {
  const order = tiktokApiOrderToFulfilmentOrder({ id: "584697260225955022", status: "AWAITING_SHIPMENT", line_items: [{ product_name: "Billy" }, { product_name: "Tootsie" }] }, [])!;
  assert.equal(order.status, "issue");
  assert.match(order.internalNotes || "", /2 line items/);
});

test("converts TikTok API order shell without personalization data", () => {
  const order = tiktokApiOrderToFulfilmentOrder({
    order_id: "584697260225955022",
    create_time: "1718784000",
    status: "AWAITING_SHIPMENT",
    buyer_info: { username: "mikayla200" },
    recipient_address: {
      name: "Mikayla",
      phone: "0123456789",
      full_address: "Ampang, Selangor",
    },
    currency: "MYR",
    payment_amount: "135.00",
    shipping_fee: "8.00",
    payment_method: "TikTok Shop",
    line_items: [{
      product_name: "Build Your Meaningful Plushie",
      sku_name: "Hunnie, 20 seconds",
      original_price: "135.00",
    }],
  }, [], "TikTok test");

  assert.ok(order);
  assert.equal(order.id, "tiktok-584697260225955022");
  assert.equal(order.salesChannel, "tiktok");
  assert.equal(order.customerName, "mikayla200");
  assert.equal(order.character, "Hunnie");
  assert.equal(order.voiceLength, 20);
  assert.equal(order.totalAmount, 135);
  assert.equal(order.shippingAmount, 8);
  assert.equal(order.plushName, "");
  assert.equal(order.meaningfulNote, "");
  assert.equal(order.meaningfulMessage, "");
  assert.equal(order.status, "awaiting_customisation");
  assert.equal(order.statusHistory[0].status, "awaiting_customisation");
  assert.match(order.orderNumber, /^TT\d+ 584697260225955022$/);
});

test("marketplace collection status cannot bypass customisation and later sync keeps staff details", () => {
  const api = { id: "584697260225955022", status: "AWAITING_COLLECTION", line_items: [{product_name: "Billy, 5 seconds"}] };
  const order = tiktokApiOrderToFulfilmentOrder(api, [])!;
  assert.equal(order.status, "awaiting_customisation");
  order.character = "Tootsie";
  order.voiceLength = 20;
  order.remark = "Keep this team note";
  order.status = "new_order";
  const synced = tiktokApiOrderToFulfilmentOrder(api, [order])!;
  assert.equal(synced.status, "new_order");
  assert.equal(synced.character, "Tootsie");
  assert.equal(synced.voiceLength, 20);
  assert.equal(synced.remark, "Keep this team note");
});
