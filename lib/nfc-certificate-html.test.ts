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

test("the demo layout selects each character and allows long notes to flow", () => {
  const certificate = { code: "123456", name: "BAMBAM", character: "", gender: "Female", birthDate: "1/11/2026", birthplace: "Batu Pahat", favouritePerson: "Family", belongsTo: "Someone special", note: "A long meaningful note. ".repeat(200) };
  for (const [character, portrait] of [["Tootsie", "tootsie"], ["Billy", "billy"], ["Hunnie", "hunnie"], ["Dragon Warrior", "dragon-warrior"]]) {
    const html = nfcCertificateHtml({ ...certificate, character });
    assert.ok(html.includes(`/${portrait}.webp`));
    assert.ok(html.includes(certificate.note));
    assert.ok(html.includes('class="mp-birth-certificate"'));
    assert.ok(html.includes("earth-portrait.webp"));
  }
  assert.ok(!nfcCertificateHtml({ ...certificate, character: "Unknown" }).includes('class="portrait"'));
  assert.ok(!nfcCertificateHtml({ ...certificate, note: "" }).includes('class="note-panel"'));
});
