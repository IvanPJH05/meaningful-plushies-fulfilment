import test from "node:test";
import assert from "node:assert/strict";
import { nfcCertificateHtml } from "./nfc-certificate-html.ts";

test("certificate fields cannot execute HTML or Liquid through the Shopify proxy", () => {
  const html = nfcCertificateHtml({
    code: "123456", name: '<script>alert("name")</script>', character: "Billy",
    gender: "", birthDate: "", birthplace: "", favouritePerson: "", belongsTo: "",
    note: "{{ customer.email }} {% render 'secret' %}\nA < B & C",
  });
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("{{"));
  assert.ok(!html.includes("{%"));
  assert.ok(html.includes("&#123;&#123; customer.email &#125;&#125;"));
  assert.ok(html.includes("A &lt; B &amp; C"));
  assert.ok(html.includes("123456"));
});

test("inactive and temporarily unavailable certificates have distinct messages", () => {
  assert.ok(nfcCertificateHtml().includes("isn't active yet"));
  assert.ok(nfcCertificateHtml(undefined, true).includes("Please refresh this page"));
});
