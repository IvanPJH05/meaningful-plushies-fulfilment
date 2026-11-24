import assert from "node:assert/strict";
import test from "node:test";
import { linkedCertificate } from "./linked-certificate.ts";

test("linked session keeps its original code and object together on webhook retries", () => {
  assert.deepEqual(linkedCertificate({ certificate_code: "20748919811", certificate_metaobject_id: "original" },
    "20746714984", { code: "20746714984", id: "stale" }), { code: "20748919811", id: "original" });
});
test("a matching candidate can restore a missing object ID, but a different code cannot", () => {
  assert.deepEqual(linkedCertificate({ certificate_code: "saved" }, "saved", { code: "saved", id: "matching" }), { code: "saved", id: "matching" });
  assert.deepEqual(linkedCertificate({ certificate_code: "saved" }, "saved", { code: "other", id: "wrong" }), { code: "saved", id: "" });
  assert.deepEqual(linkedCertificate({}, "saved", { code: "other", id: "wrong" }), { code: "saved", id: "" });
});
test("first-time linking accepts an incoming certificate", () => {
  assert.deepEqual(linkedCertificate({}, "", { code: "new", id: "new-object" }), { code: "new", id: "new-object" });
  assert.deepEqual(linkedCertificate({}), { code: "", id: "" });
});
