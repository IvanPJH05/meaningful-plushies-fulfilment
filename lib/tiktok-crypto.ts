import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function signTikTokRequest(path: string, params: Record<string, string>, body: string, secret: string) {
  const query = Object.keys(params).filter(key => !["sign", "access_token"].includes(key)).sort().map(key => key + params[key]).join("");
  return createHmac("sha256", secret).update(secret + path + query + body + secret).digest("hex");
}

export function verifyShopWebhook(body: string, signature: string | null, appKey: string, secret: string) {
  if (!appKey || !secret || !signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(appKey + body).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

function key() {
  const raw = process.env.TIKTOK_TOKEN_ENCRYPTION_KEY || "";
  if (!/^[a-f0-9]{64}$/i.test(raw)) throw new Error("TikTok token encryption is not configured.");
  return Buffer.from(raw, "hex");
}
export function encryptTikTokToken(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(part => part.toString("base64url")).join(".");
}
export function decryptTikTokToken(value: string) {
  const [iv, tag, data] = value.split(".").map(part => Buffer.from(part, "base64url"));
  const cipher = createDecipheriv("aes-256-gcm", key(), iv);
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(data), cipher.final()]).toString("utf8");
}
