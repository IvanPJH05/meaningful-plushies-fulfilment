import test from "node:test";
import assert from "node:assert/strict";
import { tikTokRequest, tikTokTokenRequest } from "./tiktok-client.ts";

test("versioned API sends the access token only in its header", async () => {
  const original = globalThis.fetch;
  process.env.TIKTOK_SHOP_APP_KEY = "test-app";
  process.env.TIKTOK_SHOP_APP_SECRET = "test-secret";
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "open-api.tiktokglobalshop.com");
    assert.equal(url.pathname, "/order/202507/orders");
    assert.equal(url.searchParams.has("access_token"), false);
    assert.equal(url.searchParams.get("ids"), "584697260225955022");
    assert.equal((init?.headers as Record<string, string>)["x-tts-access-token"], "private-token");
    return Response.json({ code: 0, data: { orders: [] } });
  };
  try { await tikTokRequest("/order/202507/orders", "private-token", { ids: "584697260225955022", shop_cipher: "shop" }); }
  finally { globalThis.fetch = original; delete process.env.TIKTOK_SHOP_APP_KEY; delete process.env.TIKTOK_SHOP_APP_SECRET; }
});

test("token exchange rejects a creator token and omits sensitive provider errors", async () => {
  const original = globalThis.fetch;
  process.env.TIKTOK_SHOP_APP_KEY = "test-app";
  process.env.TIKTOK_SHOP_APP_SECRET = "test-secret";
  globalThis.fetch = async () => Response.json({ code: 0, message: "private provider response", data: { access_token: "token", refresh_token: "refresh", access_token_expire_in: 1900000000, refresh_token_expire_in: 1900000000, user_type: 1 } });
  try { await assert.rejects(tikTokTokenRequest({ auth_code: "private-code", grant_type: "authorized_code" }), error => error instanceof Error && !error.message.includes("private")); }
  finally { globalThis.fetch = original; delete process.env.TIKTOK_SHOP_APP_KEY; delete process.env.TIKTOK_SHOP_APP_SECRET; }
});
