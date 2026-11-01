import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { signTikTokRequest, verifyShopWebhook, encryptTikTokToken, decryptTikTokToken } from "./tiktok-crypto.ts";

test("API signing uses secret wrapping and excludes access token and signature", () => {
  const expected = createHmac("sha256", "secret").update('secret/ordersapp_keyapptimestamp123{"a":1}secret').digest("hex");
  assert.equal(signTikTokRequest("/orders", { timestamp: "123", app_key: "app", access_token: "private", sign: "old" }, '{"a":1}', "secret"), expected);
});
test("Shop webhook checks raw body and app key, fails closed", () => {
  const body = '{ "type": 1 }';
  const signature = createHmac("sha256", "secret").update("app" + body).digest("hex");
  assert.equal(verifyShopWebhook(body, signature, "app", "secret"), true);
  assert.equal(verifyShopWebhook('{"type":1}', signature, "app", "secret"), false);
  assert.equal(verifyShopWebhook(body, signature, "other", "secret"), false);
  assert.equal(verifyShopWebhook(body, signature, "app", ""), false);
  assert.equal(verifyShopWebhook(body, "Bearer " + signature, "app", "secret"), false);
});
test("token encryption is randomized and tampering is rejected", () => {
  process.env.TIKTOK_TOKEN_ENCRYPTION_KEY = "a".repeat(64);
  try {
    const first = encryptTikTokToken("private-token");
    assert.notEqual(first, encryptTikTokToken("private-token"));
    assert.equal(decryptTikTokToken(first), "private-token");
    const parts = first.split(".");
    parts[1] = Buffer.alloc(16).toString("base64url");
    assert.throws(() => decryptTikTokToken(parts.join(".")));
  } finally { delete process.env.TIKTOK_TOKEN_ENCRYPTION_KEY; }
});
