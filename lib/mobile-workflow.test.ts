import assert from "node:assert/strict";
import test from "node:test";
import { certificateUrl, isProductionOrder } from "../mobile/workflow.ts";

test("certificate links require a credential-free HTTPS URL", () => {
  assert.equal(certificateUrl("https://example.com/certificate/123"), "https://example.com/certificate/123");
  for (const value of [undefined, "/certificate/123", "javascript:alert(1)", "http://example.com", "https://user@example.com"]) {
    assert.equal(certificateUrl(value), null);
  }
});

test("production includes in-progress and packed orders only", () => {
  for (const status of ["uploading_audio", "sent_for_sewing", "packed"]) assert.equal(isProductionOrder(status), true);
  for (const status of ["new_order", "shipped", "issue", ""]) assert.equal(isProductionOrder(status), false);
});
