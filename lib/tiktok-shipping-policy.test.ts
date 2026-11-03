import test from "node:test";
import assert from "node:assert/strict";
import { hasShippingScope, shippingOrderIds, validateHandover, validateShippingPackage, trustedTikTokDocumentUrl } from "./tiktok-shipping-policy.ts";

test("order access alone cannot book shipments; requests accept saved TikTok IDs only", () => {
  assert.equal(hasShippingScope(["seller.order.info"]), false);
  assert.equal(hasShippingScope(["seller.fulfillment.basic"]), true);
  for (const ids of [[], ["1234"], ["tiktok-12345678/ship"], ["shopify-12345678"], Array(21).fill("tiktok-12345678")]) assert.throws(() => shippingOrderIds(ids));
  assert.deepEqual(shippingOrderIds(["tiktok-12345678", "tiktok-12345678"]), ["tiktok-12345678"]);
});
test("package ownership, shipping lane and lifecycle must agree before booking", () => {
  const pkg = { package_id: "87654321", package_status: "TO_FULFILL", shipping_type: "TIKTOK", orders: [{ id: "12345678" }] };
  assert.doesNotThrow(() => validateShippingPackage(pkg, "12345678"));
  assert.throws(() => validateShippingPackage(pkg, "22345678"));
  assert.throws(() => validateShippingPackage({ ...pkg, orders: [...pkg.orders, { id: "22345678" }] }, "12345678"));
  for (const package_status of ["CANCELLED", "COMPLETED", "FULFILLING", ""]) assert.throws(() => validateShippingPackage({ ...pkg, package_status }, "12345678"));
  assert.throws(() => validateShippingPackage({ ...pkg, shipping_type: "SELLER" }, "12345678"));
});
test("handover must be an available, unexpired carrier choice", () => {
  const options = { can_drop_off: true, can_pickup: true, pickup_slots: [{ start_time: 150, end_time: 200, avaliable: true }] };
  assert.deepEqual(validateHandover({ method: "PICKUP", start: 150, end: 200 }, options, 100), { handover_method: "PICKUP", pickup_slot: { start_time: 150, end_time: 200 } });
  assert.throws(() => validateHandover({ method: "PICKUP", start: 150, end: 200 }, options, 201));
  assert.throws(() => validateHandover({ method: "PICKUP", start: 151, end: 200 }, options, 100));
  assert.throws(() => validateHandover({ method: "DROP_OFF" }, { can_drop_off: false }));
  assert.deepEqual(validateHandover({ method: "DROP_OFF" }, options), { handover_method: "DROP_OFF" });
});
test("label fetch cannot be redirected to private or unrelated hosts", () => {
  assert.equal(trustedTikTokDocumentUrl("https://p16.ibyteimg.com/label.pdf"), "https://p16.ibyteimg.com/label.pdf");
  for (const url of ["http://ibyteimg.com/label.pdf", "https://ibyteimg.com.evil.test/x", "https://127.0.0.1/x", "https://169.254.169.254/x", "https://user:pass@ibyteimg.com/x", "https://ibyteimg.com:8443/x"]) assert.throws(() => trustedTikTokDocumentUrl(url));
});
