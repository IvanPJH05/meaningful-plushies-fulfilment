import assert from "node:assert/strict";
import test from "node:test";

import { manualOrderIntakeQuote } from "./manual-order-intake-pricing.ts";

test("uses the saved manual-order speaker duration and East Malaysia fee when Shopify is unavailable", () => {
  const quote = manualOrderIntakeQuote({
    productKey: "legacy-message-20",
    productDisplayName: "Billy — 20 seconds",
    shippingRegion: "EAST",
  }, 0);

  assert.deepEqual(quote, { speakerSeconds: 20, shippingFee: 20, amountToCollect: 155 });
});

test("uses the current Shopify variant price when it is available", () => {
  const quote = manualOrderIntakeQuote({
    productKey: "plushie_5s",
    productDisplayName: "Meaningful Plushie - 5 seconds",
    shippingRegion: "WEST",
  }, 5, 118);

  assert.deepEqual(quote, { speakerSeconds: 5, shippingFee: 0, amountToCollect: 118 });
});
