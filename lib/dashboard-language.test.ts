import assert from "node:assert/strict";
import test from "node:test";
import { dashboardLanguage, translator } from "./dashboard-language.ts";
import { dashboardTranslations } from "./dashboard-translations.ts";

test("defaults to English and accepts only the supported preferences", () => {
  for (const value of [null, undefined, "fr", "MS", {}, "en"]) assert.equal(dashboardLanguage(value), "en");
  assert.equal(dashboardLanguage("ms"), "ms");
  assert.equal(dashboardLanguage("id"), "id");
});
test("localizes actions and statuses while preserving the English default", () => {
  assert.equal(translator("en")("Save changes"), "Save changes");
  assert.equal(translator("ms", dashboardTranslations)("Awaiting Customisation"), "Menunggu Penyesuaian");
  assert.equal(translator("id", dashboardTranslations)("Awaiting Customisation"), "Menunggu Kustomisasi");
  assert.equal(translator("ms", dashboardTranslations)("Packed"), "Dibungkus");
  assert.equal(translator("id", dashboardTranslations)("Packed"), "Dikemas");
});
test("keeps unknown text and customer-supplied interpolation values intact", () => {
  const t = translator("ms", dashboardTranslations);
  assert.equal(t("ANESSA — Keep this exact customer note ❤️"), "ANESSA — Keep this exact customer note ❤️");
  assert.equal(t("{workspace} workspace", { workspace: "QA Customer 001" }), "Ruang kerja QA Customer 001");
  assert.equal(t("constructor"), "constructor");
  assert.equal(t("__proto__"), "__proto__");
  assert.equal(t("Meaningful Plushies"), "Meaningful Plushies");
});
test("both dictionaries have valid strings and preserve interpolation tokens", () => {
  for (const [key, values] of Object.entries(dashboardTranslations)) {
    assert.equal(values.length, 2, key);
    const placeholders = [...key.matchAll(/\{\w+\}/g)].map(match => match[0]).sort();
    for (const value of values) {
      assert.equal(typeof value, "string", key);
      if (key !== "s") assert.ok(value.trim(), key);
      assert.deepEqual([...value.matchAll(/\{\w+\}/g)].map(match => match[0]).sort(), placeholders, key);
      assert.ok(!value.includes("<unk>"), key);
    }
  }
});
