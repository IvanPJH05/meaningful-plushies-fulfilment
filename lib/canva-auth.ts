import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const CANVA_REFRESH_COOKIE = "canva_refresh";
export const CANVA_STATE_COOKIE = "canva_oauth_state";
export const CANVA_VERIFIER_COOKIE = "canva_oauth_verifier";
export const CANVA_SCOPES = "brandtemplate:content:read design:content:read design:content:write design:meta:read";

type CanvaTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope?: string;
};

export function canvaConfigured() {
  return Boolean(process.env.CANVA_CLIENT_ID && process.env.CANVA_CLIENT_SECRET && process.env.CANVA_REDIRECT_URI);
}

export function encryptCanvaValue(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptCanvaValue(value: string) {
  const [ivValue, tagValue, encryptedValue] = value.split(".");
  if (!ivValue || !tagValue || !encryptedValue) throw new Error("Invalid Canva connection cookie.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export async function exchangeCanvaCode(code: string, verifier: string) {
  return requestCanvaToken(new URLSearchParams({
    grant_type: "authorization_code",
    code,
    code_verifier: verifier,
    redirect_uri: requiredEnv("CANVA_REDIRECT_URI"),
  }));
}

export async function refreshCanvaAccessToken(refreshToken: string) {
  return requestCanvaToken(new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  }));
}

export const canvaCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

async function requestCanvaToken(body: URLSearchParams): Promise<CanvaTokenResponse> {
  const credentials = Buffer.from(`${requiredEnv("CANVA_CLIENT_ID")}:${requiredEnv("CANVA_CLIENT_SECRET")}`).toString("base64");
  const response = await fetch("https://api.canva.com/rest/v1/oauth/token", {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const data = await response.json() as Partial<CanvaTokenResponse> & { message?: string };
  if (!response.ok || !data.access_token || !data.refresh_token) {
    throw new Error(data.message || "Canva authentication failed.");
  }
  return data as CanvaTokenResponse;
}

function encryptionKey() {
  return createHash("sha256").update(requiredEnv("CANVA_CLIENT_SECRET")).digest();
}

function requiredEnv(name: "CANVA_CLIENT_ID" | "CANVA_CLIENT_SECRET" | "CANVA_REDIRECT_URI") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}
