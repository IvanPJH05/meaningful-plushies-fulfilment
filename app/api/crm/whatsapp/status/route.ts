import { NextResponse } from "next/server";

import { prisma } from "@/src/infrastructure/database/prisma";
import { ensureDefaultBusiness } from "@/src/modules/businesses/default-business";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GraphError = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    fbtrace_id?: string;
  };
};

type GraphSuccess = Record<string, unknown> & {
  whatsapp_business_account?: {
    id?: string;
    name?: string;
  };
};

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function serializeDate(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberValue(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

async function graphGet(path: string, accessToken: string) {
  const graphVersion = process.env.META_GRAPH_API_VERSION || "v20.0";
  const url = new URL(`https://graph.facebook.com/${graphVersion}/${path}`);
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json().catch(() => ({})) as GraphError & GraphSuccess;

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: data.error?.message || "Meta rejected the WhatsApp request.",
      code: data.error?.code,
      type: data.error?.type,
      trace: data.error?.fbtrace_id,
    };
  }

  return { ok: true, status: response.status, data } as const;
}

async function getWebhookActivity() {
  try {
    const business = await ensureDefaultBusiness();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [rawLast24h, parsedLast24h, recent] = await Promise.all([
      prisma.webhookEvent.count({
        where: {
          businessId: business.id,
          source: "meta_whatsapp_raw",
          receivedAt: { gte: since },
        },
      }),
      prisma.webhookEvent.count({
        where: {
          businessId: business.id,
          source: "meta_whatsapp",
          receivedAt: { gte: since },
        },
      }),
      prisma.webhookEvent.findMany({
        where: {
          businessId: business.id,
          source: { in: ["meta_whatsapp_raw", "meta_whatsapp"] },
        },
        orderBy: { receivedAt: "desc" },
        take: 12,
        select: {
          source: true,
          externalEventId: true,
          status: true,
          receivedAt: true,
          processedAt: true,
          error: true,
          payload: true,
        },
      }),
    ]);

    return {
      ok: true,
      rawLast24h,
      parsedLast24h,
      latestRawReceivedAt: serializeDate(recent.find((row) => row.source === "meta_whatsapp_raw")?.receivedAt),
      latestParsedReceivedAt: serializeDate(recent.find((row) => row.source === "meta_whatsapp")?.receivedAt),
      recent: recent.map((row) => {
        const payload = objectValue(row.payload);
        return {
          source: row.source,
          eventHash: row.externalEventId.slice(0, 12),
          status: row.status,
          receivedAt: serializeDate(row.receivedAt),
          processedAt: serializeDate(row.processedAt),
          parsedMessageCount: numberValue(payload.parsedMessageCount),
          direction: typeof payload.direction === "string" ? payload.direction : null,
          error: row.error,
        };
      }),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Webhook activity could not be loaded.",
    };
  }
}

export async function GET() {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || "";
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
  const configuredWabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "";
  const webhookSecretPresent = Boolean(process.env.WHATSAPP_WEBHOOK_SECRET || process.env.META_APP_SECRET);

  const base = {
    ok: true,
    env: {
      accessTokenPresent: Boolean(accessToken),
      phoneNumberIdPresent: Boolean(phoneNumberId),
      businessAccountIdPresent: Boolean(configuredWabaId),
      webhookSecretPresent,
      graphVersion: process.env.META_GRAPH_API_VERSION || "v20.0",
    },
  };

  if (!accessToken || !phoneNumberId) {
    return json(200, {
      ...base,
      phoneCheck: {
        ok: false,
        error: "WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID are required.",
      },
    });
  }

  const phoneCheck = await graphGet(
    `${encodeURIComponent(phoneNumberId)}?fields=id,display_phone_number,verified_name,quality_rating,platform_type,code_verification_status`,
    accessToken,
  );

  const phoneBusinessAccountCheck = await graphGet(
    `${encodeURIComponent(phoneNumberId)}?fields=whatsapp_business_account`,
    accessToken,
  );
  const detectedWabaId = phoneBusinessAccountCheck.ok
    ? phoneBusinessAccountCheck.data?.whatsapp_business_account?.id || ""
    : "";
  const wabaId = configuredWabaId || detectedWabaId;

  const wabaPhoneNumbersCheck = wabaId
    ? await graphGet(
      `${encodeURIComponent(wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,platform_type,code_verification_status`,
      accessToken,
    )
    : {
      ok: false,
      error: "WHATSAPP_BUSINESS_ACCOUNT_ID is required to verify WABA phone numbers and webhook subscriptions.",
    };

  const subscribedAppsCheck = wabaId
    ? await graphGet(
      `${encodeURIComponent(wabaId)}/subscribed_apps?fields=id,name,whatsapp_business_api_data,subscribed_fields`,
      accessToken,
    )
    : {
      ok: false,
      error: "WHATSAPP_BUSINESS_ACCOUNT_ID is required to verify whether this app is subscribed to WhatsApp webhooks.",
    };

  const webhookActivity = await getWebhookActivity();

  return json(200, {
    ...base,
    phoneCheck,
    phoneBusinessAccountCheck,
    detectedWabaId: detectedWabaId || null,
    configuredWabaId: configuredWabaId || null,
    effectiveWabaId: wabaId || null,
    wabaPhoneNumbersCheck,
    subscribedAppsCheck,
    webhookActivity,
    note: "No access token value is returned by this endpoint.",
  });
}
