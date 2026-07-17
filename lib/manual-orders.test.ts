import assert from "node:assert/strict";
import test from "node:test";
import { buildManualOrderCustomerLink } from "./manual-order-links.ts";
import { manualOrderProductPathForSelection } from "./manual-order-product-paths.ts";

const product5s = {
  key: "meaningful-plushie-5s",
  displayName: "Meaningful Plushie - 5 seconds",
  price: 115,
  productPath: "products/meaningful-plushie",
};

const product20s = {
  key: "meaningful-plushie-20s",
  displayName: "Meaningful Plushie - 20 seconds",
  price: 135,
  productPath: "products/meaningful-plushie",
};

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

test("maps manual orders to exact character and speaker WA products", () => {
  assert.equal(
    manualOrderProductPathForSelection("Billy", product5s),
    "products/build-your-meaningful-plushie-wa-b-5s",
  );

  assert.equal(
    manualOrderProductPathForSelection("Hunnie", product20s),
    "products/hunnie-wa-order",
  );
});
