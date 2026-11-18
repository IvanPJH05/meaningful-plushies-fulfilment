import test from "node:test";
import assert from "node:assert/strict";
import { nfcCardScan, nfcCardUrl, nfcCardUrlMatches, nfcDestination } from "./nfc-cards.ts";
test("card stickers are distinct from order barcodes", () => {
  assert.equal(nfcCardScan("NFC-100001"),100001);
  assert.equal(nfcCardScan("100001"),100001);
  assert.equal(nfcCardScan("MP-100001"),null);
  assert.equal(nfcCardScan("MPI-100001"),null);
});
test("Shopify card links preserve each token and accept older cards for verification", () => {
  const token = "a".repeat(32);
  assert.equal(nfcCardUrl(token), `https://meaningfulplushies.com/apps/closer/n/${token}`);
  for (const invalid of ["123", "../account", "a".repeat(32) + "?redirect=other", "A".repeat(32)]) {
    assert.throws(() => nfcCardUrl(invalid));
  }
  assert.equal(nfcCardUrlMatches(`https://example.com/n/${token}`, "https://example.com", token), true);
  assert.equal(nfcCardUrlMatches(`https://example.com/n/${"b".repeat(32)}`, "https://example.com", token), false);
});
test("public card links use opaque tokens and approved certificate destinations", () => {
  assert.equal(nfcCardUrl("a".repeat(32)),`https://meaningfulplushies.com/apps/closer/n/${"a".repeat(32)}`);
  const order = {product:"Billy",remark:"",productType:"",certificateCode:"abc123",idWebsiteLink:""};
  assert.equal(nfcDestination(order),"https://meaningfulplushies.com/pages/certificate/abc123");
  assert.equal(nfcDestination({...order,certificateCode:"",idWebsiteLink:"https://evil.com/pages/certificate/abc"}),null);
  assert.equal(nfcDestination({...order,certificateCode:"",idWebsiteLink:"https://meaningfulplushies.com.evil.com/apps/closer"}),null);
  assert.equal(nfcDestination({...order,certificateCode:"",idWebsiteLink:"https://meaningfulplushies.com/account"}),null);
  assert.equal(nfcDestination({...order,productType:"plush_charm",idWebsiteLink:"https://meaningfulplushies.com/apps/closer?certificate=123&key=test"}),"https://meaningfulplushies.com/apps/closer?certificate=123&key=test");
});
