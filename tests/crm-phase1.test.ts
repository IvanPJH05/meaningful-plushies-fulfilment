import test from "node:test";
import assert from "node:assert/strict";
import { decryptCredential, encryptCredential } from "../src/infrastructure/encryption/credentials.ts";
import { assertBusinessScope, businessWhere, isBusinessScoped } from "../src/modules/businesses/tenant.ts";
import {
  getMetaCoexistenceReadiness,
  metaCoexistenceManualSetupSteps,
} from "../src/modules/onboarding/meta-coexistence.ts";
import {
  assertOfficialWhatsAppOnly,
  unsupportedWhatsAppApproaches,
} from "../src/modules/whatsapp/official-platform.ts";

test("encrypts and decrypts credentials without storing plaintext", () => {
  const key = "test-key-that-is-long-enough-for-credential-encryption";
  const encrypted = encryptCredential("secret-token", key);

  assert.notEqual(encrypted, "secret-token");
  assert.equal(decryptCredential(encrypted, key), "secret-token");
});

test("tenant helper rejects records from another business", () => {
  assert.doesNotThrow(() => assertBusinessScope({ businessId: "biz_1" }, "biz_1"));
  assert.throws(() => assertBusinessScope({ businessId: "biz_2" }, "biz_1"));
  assert.deepEqual(businessWhere("biz_1", { status: "OPEN" }), { status: "OPEN", businessId: "biz_1" });
  assert.equal(isBusinessScoped({ businessId: "biz_1" }), true);
});

test("Meta coexistence setup declares manual steps and missing env values", () => {
  const readiness = getMetaCoexistenceReadiness({
    hasMetaAppId: true,
    hasMetaAppSecret: false,
    hasVerifyToken: true,
    hasCredentialKey: false,
  });

  assert.ok(metaCoexistenceManualSetupSteps.length >= 6);
  assert.deepEqual(readiness.missing, ["META_APP_SECRET", "CRM_CREDENTIAL_ENCRYPTION_KEY"]);
});

test("unsupported WhatsApp approaches are blocked", () => {
  for (const approach of unsupportedWhatsAppApproaches) {
    assert.throws(() => assertOfficialWhatsAppOnly(approach));
  }

  assert.doesNotThrow(() => assertOfficialWhatsAppOnly("Meta WhatsApp Business Platform"));
});
