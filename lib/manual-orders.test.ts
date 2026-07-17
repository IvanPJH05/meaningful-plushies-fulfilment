import assert from "node:assert/strict";
import test from "node:test";
import { buildManualOrderCustomerLink } from "./manual-order-links.ts";

test("builds manual order links as single product discount Shopify links", () => {
  const link = buildManualOrderCustomerLink("96001872", "/products/hunnie-wa-order");

  assert.equal(
    link,
    "https://meaningfulplushies.com/discount/96001872?redirect=/products/hunnie-wa-order",
  );

  const productDiscountUrl = new URL(link);
  assert.equal(productDiscountUrl.pathname, "/discount/96001872");
  assert.equal(productDiscountUrl.searchParams.get("redirect"), "/products/hunnie-wa-order");
});
