import assert from "node:assert/strict";
import test from "node:test";

import { certificateMediaForLineItem, flowCertificateCode, plushBackgroundForMeaningfulNote, uploadLiftCertificateFields } from "./shopify-orders.ts";

test("matches the existing Shopify Flow certificate-code formula", () => {
  assert.equal(
    flowCertificateCode("#1595", "2026-08-19T15:23:28Z", "gid://shopify/LineItem/123456789039"),
    "15953008039",
  );
});

test("copies Flow's character and note-background media choices", () => {
  assert.equal(certificateMediaForLineItem("(H,20S) BUILD YOUR MEANINGFUL PLUSHIE - Hunnie"), "gid://shopify/MediaImage/24492659048519");
  assert.equal(certificateMediaForLineItem("Dragon Warrior"), "gid://shopify/MediaImage/24492659179591");
  assert.equal(plushBackgroundForMeaningfulNote("x".repeat(140)), "gid://shopify/MediaImage/24567099359303");
  assert.equal(plushBackgroundForMeaningfulNote("x".repeat(141)), "gid://shopify/MediaImage/24567124492359");
});

test("reads every birth-certificate field from Upload Lift text", () => {
  const fields = uploadLiftCertificateFields([
    "Product: Meaningful Plushie",
    "Name: Milo",
    "Gender: Male",
    "Born On: 18/08/2026",
    "Birthplace: Kajang",
    "Favourite Person: Ivan",
    "Belongs To: Aisyah",
    "Meaningful Note: You are loved.",
    "Meaningful Message: https://example.com/voice.mp3",
  ].join("\n"));

  assert.deepEqual(fields, {
    idName: "Milo",
    gender: "Male",
    bornOn: "18/08/2026",
    birthplace: "Kajang",
    favouritePerson: "Ivan",
    belongsTo: "Aisyah",
    meaningfulNote: "You are loved.",
    meaningfulMessage: "https://example.com/voice.mp3",
  });
});

test("accepts the customer-facing label variations", () => {
  const fields = uploadLiftCertificateFields([
    "Plushie's Name - Lola",
    "Plushie's Gender - Female",
    "Plushie's Birth Date - 01/01/2025",
    "Plushie's Birth Place - Kuala Lumpur",
    "Plushie's Favorite Person - Mama",
    "Plushie Belongs To - Nur",
    "Meaningful Note - Hello Lola",
  ].join("\n"));

  assert.equal(fields.idName, "Lola");
  assert.equal(fields.gender, "Female");
  assert.equal(fields.bornOn, "01/01/2025");
  assert.equal(fields.birthplace, "Kuala Lumpur");
  assert.equal(fields.favouritePerson, "Mama");
  assert.equal(fields.belongsTo, "Nur");
  assert.equal(fields.meaningfulNote, "Hello Lola");
});
