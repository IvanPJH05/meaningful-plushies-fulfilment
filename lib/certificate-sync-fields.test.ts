import { test } from "node:test";
import assert from "node:assert/strict";
import { certificateDetails, retryDelaySeconds } from "./certificate-sync-fields.ts";
import { parseOrderEdit } from "./order-edit.ts";

test("certificate details preserve clears without erasing absent legacy fields", () => {
  const result = certificateDetails({ plushName: "New name", plushBirthPlace: "", plushGender: "Female" });
  assert.equal(result.idName, "New name");
  assert.equal(result.birthplace, "");
  assert.equal(result.gender, "Female");
  assert.equal(result.bornOn, undefined);
});
test("birth certificate fields use the existing versioned edit validation", () => {
  const patch = { plushGender: "Female", plushBirthDate: "28/11/2025", plushBirthPlace: "KL", plushFavouritePerson: "Sam", plushBelongsTo: "Alex" };
  assert.deepEqual(parseOrderEdit({ orderId: "123", expectedUpdatedAt: "2026-10-14T00:00:00Z", patch }).patch, patch);
  assert.throws(() => parseOrderEdit({ orderId: "123", expectedUpdatedAt: "2026-10-14T00:00:00Z", patch: { certificateCode: "different-certificate" } }));
});
test("retry backoff stays bounded for persistent Shopify failures", () => {
  assert.equal(retryDelaySeconds(1), 30);
  assert.equal(retryDelaySeconds(2), 60);
  assert.equal(retryDelaySeconds(100), 3600);
});
test("older TikTok details populate certificates while explicit edits and clears win", () => {
  const order = { salesChannel: "tiktok" as const, meaningfulMessage: 'Gender: Female\nBirth Date: 20/10/2025\nBirth Place: A "special" place\nFavourite Person: Sam\nBelongs To: Alex', plushBirthPlace: "" };
  assert.equal(certificateDetails(order).gender, "Female");
  assert.equal(certificateDetails(order).bornOn, "20/10/2025");
  assert.equal(certificateDetails(order).birthplace, "");
  assert.equal(certificateDetails({ ...order, plushGender: "Male" }).gender, "Male");
});
