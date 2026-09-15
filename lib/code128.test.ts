import assert from "node:assert/strict";
import test from "node:test";

import { code128Modules, code128UnitCount } from "./code128.ts";

test("creates a compact Code 128 barcode for an audio-checker order code", () => {
  assert.ok(code128Modules("MP-1737").length > 0);
  assert.ok(code128UnitCount("MP-1737") < 130);
});
