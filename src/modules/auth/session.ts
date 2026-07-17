import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const CRM_SESSION_COOKIE = "mp_crm_session";

export function createOpaqueSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHmac("sha256", "crm-session-token-hash").update(token).digest("base64url");
}

export function signSessionToken(token: string, secret = process.env.CRM_SESSION_SECRET || "local-dev-session-secret-change-me-now"): string {
  const signature = createHmac("sha256", secret).update(token).digest("base64url");
  return `${token}.${signature}`;
}

export function verifySignedSessionToken(signedToken: string, secret = process.env.CRM_SESSION_SECRET || "local-dev-session-secret-change-me-now"): string | null {
  const index = signedToken.lastIndexOf(".");
  if (index === -1) return null;

  const token = signedToken.slice(0, index);
  const signature = signedToken.slice(index + 1);
  const expected = createHmac("sha256", secret).update(token).digest("base64url");
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (signatureBuffer.length !== expectedBuffer.length) return null;

  return timingSafeEqual(signatureBuffer, expectedBuffer) ? token : null;
}
