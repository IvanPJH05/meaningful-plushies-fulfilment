import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyMetaWebhookSignature(rawBody: string, signatureHeader: string | null, appSecret?: string | null) {
  if (!appSecret) return true;
  if (!signatureHeader?.startsWith("sha256=")) return false;

  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex")}`;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signatureHeader);

  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}
