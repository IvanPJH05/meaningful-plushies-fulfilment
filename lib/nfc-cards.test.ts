import test from "node:test";
import assert from "node:assert/strict";
import { nfcCardScan, nfcCardUrl, nfcDestination } from "./nfc-cards.ts";
test("card stickers are distinct from order barcodes", () => {
  assert.equal(nfcCardScan("NFC-100001"),100001);
  assert.equal(nfcCardScan("100001"),100001);
  assert.equal(nfcCardScan("MP-100001"),null);
  assert.equal(nfcCardScan("MPI-100001"),null);
});
test("public card links use opaque tokens and approved certificate destinations", () => {
  assert.equal(nfcCardUrl("https://example.com", "a".repeat(32)),`https://example.com/n/${"a".repeat(32)}`);
  const order = {product:"Billy",remark:"",productType:"",certificateCode:"abc123",idWebsiteLink:""};
  assert.equal(nfcDestination(order),"https://meaningfulplushies.com/pages/certificate/abc123");
  assert.equal(nfcDestination({...order,certificateCode:"",idWebsiteLink:"https://evil.com/pages/certificate/abc"}),null);
  assert.equal(nfcDestination({...order,certificateCode:"",idWebsiteLink:"https://meaningfulplushies.com.evil.com/apps/closer"}),null);
  assert.equal(nfcDestination({...order,certificateCode:"",idWebsiteLink:"https://meaningfulplushies.com/account"}),null);
  assert.equal(nfcDestination({...order,productType:"plush_charm",idWebsiteLink:"https://meaningfulplushies.com/apps/closer?certificate=123&key=test"}),"https://meaningfulplushies.com/apps/closer?certificate=123&key=test");
});
