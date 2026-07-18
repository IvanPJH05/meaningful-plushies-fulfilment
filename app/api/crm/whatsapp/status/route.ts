import { NextResponse } from "next/server";

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
    ? await graphGet(`${encodeURIComponent(wabaId)}/subscribed_apps`, accessToken)
    : {
      ok: false,
      error: "WHATSAPP_BUSINESS_ACCOUNT_ID is required to verify whether this app is subscribed to WhatsApp webhooks.",
    };

  return json(200, {
    ...base,
    phoneCheck,
    phoneBusinessAccountCheck,
    detectedWabaId: detectedWabaId || null,
    configuredWabaId: configuredWabaId || null,
    effectiveWabaId: wabaId || null,
    wabaPhoneNumbersCheck,
    subscribedAppsCheck,
    note: "No access token value is returned by this endpoint.",
  });
}
