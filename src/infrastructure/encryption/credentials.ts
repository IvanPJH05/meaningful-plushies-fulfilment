import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
const LOCAL_DEV_KEY = "local-dev-only-change-before-production";

function base64UrlEncode(value: Buffer): string {
  return value.toString("base64url");
}

function base64UrlDecode(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

export function deriveCredentialKey(rawKey = process.env.CRM_CREDENTIAL_ENCRYPTION_KEY): Buffer {
  const source = rawKey || LOCAL_DEV_KEY;
  const asBase64 = Buffer.from(source, "base64");

  if (asBase64.length === 32 && asBase64.toString("base64").replace(/=+$/, "") === source.replace(/=+$/, "")) {
    return asBase64;
  }

  return createHash("sha256").update(source).digest();
}

export function hasCredentialEncryptionKey(): boolean {
  return Boolean(process.env.CRM_CREDENTIAL_ENCRYPTION_KEY);
}

export function encryptCredential(plainText: string, rawKey?: string): string {
  const iv = randomBytes(12);
  const key = deriveCredentialKey(rawKey);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [VERSION, base64UrlEncode(iv), base64UrlEncode(tag), base64UrlEncode(encrypted)].join(":");
}

export function decryptCredential(payload: string, rawKey?: string): string {
  const [version, iv, tag, encrypted] = payload.split(":");

  if (version !== VERSION || !iv || !tag || !encrypted) {
    throw new Error("Unsupported encrypted credential payload.");
  }

  const key = deriveCredentialKey(rawKey);
  const decipher = createDecipheriv(ALGORITHM, key, base64UrlDecode(iv));
  decipher.setAuthTag(base64UrlDecode(tag));

  return Buffer.concat([
    decipher.update(base64UrlDecode(encrypted)),
    decipher.final(),
  ]).toString("utf8");
}
