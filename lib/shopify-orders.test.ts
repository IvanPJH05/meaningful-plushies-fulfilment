import assert from "node:assert/strict";
import test from "node:test";

import { uploadLiftCertificateFields } from "./shopify-orders.ts";

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
