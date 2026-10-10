import assert from "node:assert/strict";
import test from "node:test";

import { manualOrderCharactersForProduct, manualOrderProductByKey, manualOrderProductFamily } from "./manual-order-products.ts";

test("includes the three Plush Charm choices in manual orders", () => {
  const penny = manualOrderProductByKey("plush_charm_penny_5s");
  const renny = manualOrderProductByKey("plush_charm_renny_10s");
  const benny = manualOrderProductByKey("plush_charm_benny_20s");

  assert.ok(penny);
  assert.ok(renny);
  assert.ok(benny);
  assert.equal(manualOrderProductFamily(penny), "plush_charm");
  assert.deepEqual(manualOrderCharactersForProduct(penny), ["Penny", "Renny", "Benny"]);
  assert.equal(penny.productPath, "products/p-5-meaningful-plush-charm");
});
