import { z } from "zod";

export const crmServerEnvSchema = z.object({
  DATABASE_URL: z.string().url().optional(),
  DIRECT_URL: z.string().url().optional(),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  CRM_SESSION_SECRET: z.string().min(32).optional(),
  CRM_CREDENTIAL_ENCRYPTION_KEY: z.string().min(32).optional(),
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_WEBHOOK_SECRET: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  SHOPIFY_SHOP_DOMAIN: z.string().optional(),
  SHOPIFY_ADMIN_ACCESS_TOKEN: z.string().optional(),
  SHOPIFY_CLIENT_ID: z.string().optional(),
  SHOPIFY_CLIENT_SECRET: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().optional(),
  CRM_OPENAI_MODEL: z.string().optional(),
  CRM_AI_AUTO_REPLY: z.string().optional(),
  WHATSAPP_AI_AUTO_REPLY: z.string().optional(),
  CRM_AI_SUGGEST_REPLY: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
});

export type CrmServerEnv = z.infer<typeof crmServerEnvSchema>;

export function getCrmServerEnv(input: NodeJS.ProcessEnv = process.env): CrmServerEnv {
  return crmServerEnvSchema.parse(input);
}

type EnvLookup = Record<string, string | undefined>;

export function hasMetaWebhookSecret(input: EnvLookup = process.env): boolean {
  return Boolean(input.WHATSAPP_WEBHOOK_SECRET || input.META_APP_SECRET);
}

export function hasShopifyAdminAuth(input: EnvLookup = process.env): boolean {
  return Boolean(
    input.SHOPIFY_ADMIN_ACCESS_TOKEN ||
      (input.SHOPIFY_CLIENT_ID && input.SHOPIFY_CLIENT_SECRET),
  );
}

export function hasOpenAiApiKey(input: EnvLookup = process.env): boolean {
  return Boolean(input.OPENAI_API_KEY);
}

export function getMissingPhase1Env(input: EnvLookup = process.env): string[] {
  const recommended = [
    "DATABASE_URL",
    "CRM_SESSION_SECRET",
    "CRM_CREDENTIAL_ENCRYPTION_KEY",
    "META_APP_ID",
    "WHATSAPP_VERIFY_TOKEN",
  ];

  const missing = recommended.filter((key) => !input[key]);
  if (!hasMetaWebhookSecret(input)) {
    missing.push("META_APP_SECRET or WHATSAPP_WEBHOOK_SECRET");
  }
  return missing;
}

export function getMissingPhase2Env(input: EnvLookup = process.env): string[] {
  const recommended = [
    "DATABASE_URL",
    "WHATSAPP_VERIFY_TOKEN",
    "WHATSAPP_ACCESS_TOKEN",
    "WHATSAPP_PHONE_NUMBER_ID",
    "SHOPIFY_SHOP_DOMAIN",
  ];

  const missing = recommended.filter((key) => !input[key]);
  if (!hasMetaWebhookSecret(input)) {
    missing.push("META_APP_SECRET or WHATSAPP_WEBHOOK_SECRET");
  }
  if (!hasShopifyAdminAuth(input)) {
    missing.push("SHOPIFY_ADMIN_ACCESS_TOKEN or SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET");
  }
  return missing;
}

export function getMissingPhase3Env(input: EnvLookup = process.env): string[] {
  const missing = getMissingPhase2Env(input);
  if (!hasOpenAiApiKey(input)) {
    missing.push("OPENAI_API_KEY");
  }
  return missing;
}
