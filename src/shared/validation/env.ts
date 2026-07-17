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
  S3_ENDPOINT: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
});

export type CrmServerEnv = z.infer<typeof crmServerEnvSchema>;

export function getCrmServerEnv(input: NodeJS.ProcessEnv = process.env): CrmServerEnv {
  return crmServerEnvSchema.parse(input);
}

export function getMissingPhase1Env(input: NodeJS.ProcessEnv = process.env): string[] {
  const recommended = [
    "DATABASE_URL",
    "CRM_SESSION_SECRET",
    "CRM_CREDENTIAL_ENCRYPTION_KEY",
    "META_APP_ID",
    "META_APP_SECRET",
    "WHATSAPP_VERIFY_TOKEN",
  ];

  return recommended.filter((key) => !input[key]);
}

export function getMissingPhase2Env(input: NodeJS.ProcessEnv = process.env): string[] {
  const recommended = [
    "DATABASE_URL",
    "WHATSAPP_VERIFY_TOKEN",
    "META_APP_SECRET",
    "WHATSAPP_ACCESS_TOKEN",
    "WHATSAPP_PHONE_NUMBER_ID",
    "SHOPIFY_SHOP_DOMAIN",
    "SHOPIFY_ADMIN_ACCESS_TOKEN",
  ];

  return recommended.filter((key) => !input[key]);
}
