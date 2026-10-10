import assert from "node:assert/strict";
import test from "node:test";

import { manualOrderCharactersForProduct, manualOrderProductByKey, manualOrderProductFamily } from "./manual-order-products.ts";

test("includes the three Plush Charm choices in manual orders", () => {
  const penny = manualOrderProductByKey("plush_charm_penny");
  const renny = manualOrderProductByKey("plush_charm_renny");
  const benny = manualOrderProductByKey("plush_charm_benny");

  assert.ok(penny);
  assert.ok(renny);
  assert.ok(benny);
  assert.equal(manualOrderProductFamily(penny), "plush_charm");
  assert.deepEqual(manualOrderCharactersForProduct(penny), ["Penny", "Renny", "Benny"]);
  assert.equal(penny.productPath, "products/meaningful-plush-charm");
});
