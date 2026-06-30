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
  assert.match(order.orderNumber, /^TT\d+ 584697260225955022$/);
});
