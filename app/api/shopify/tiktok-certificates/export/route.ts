import { NextResponse } from "next/server";

import { shopDomain, shopifyGraphql, textValue } from "../../../../../lib/shopify-orders";

export const runtime = "nodejs";

type CertificatePayload = Array<Record<string, unknown>>;

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function malaysiaDateParts() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kuala_Lumpur",
    day: "numeric",
    month: "numeric",
  }).formatToParts(new Date());
  return {
    day: parts.find((part) => part.type === "day")?.value ?? "",
    month: parts.find((part) => part.type === "month")?.value ?? "",
  };
}

function todayUploadName() {
  const { day, month } = malaysiaDateParts();
  return `${day}/${month} tt`;
}

function todayHandle() {
  const { day, month } = malaysiaDateParts();
  const stamp = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kuala_Lumpur",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date()).replace(/\D/g, "");
  return `${day}-${month}-tt-${stamp}-${Date.now().toString(36)}`.toLowerCase();
}

function metaobjectType() {
  return process.env.SHOPIFY_TIKTOK_CERT_METAOBJECT_TYPE || "$app:tik_tok_shop_cert_input";
}

function uploadDateFieldKey() {
  return process.env.SHOPIFY_TIKTOK_CERT_UPLOAD_DATE_FIELD || "upload_date";
}

function inputFieldKey() {
  return process.env.SHOPIFY_TIKTOK_CERT_INPUT_FIELD || "input";
}

export async function POST(request: Request) {
  let body: { payload?: CertificatePayload };
  try {
    body = await request.json() as { payload?: CertificatePayload };
  } catch {
    return json(400, { ok: false, error: "Invalid Shopify export request." });
  }

  const payload = Array.isArray(body.payload) ? body.payload : [];
  if (!payload.length) return json(400, { ok: false, error: "Select at least one TikTok order before exporting." });

  const domain = shopDomain(request);
  if (!domain) return json(500, { ok: false, error: "SHOPIFY_SHOP_DOMAIN is not configured." });

  const uploadDate = todayUploadName();
  const handle = todayHandle();
  const inputJson = JSON.stringify(payload, null, 2);

  const result = await shopifyGraphql<{
    data?: {
      metaobjectCreate?: {
        metaobject?: { id?: string; handle?: string };
        userErrors?: Array<{ field?: string[]; message?: string; code?: string }>;
      };
    };
    errors?: Array<{ message?: string }>;
  }>(domain, `
    mutation CreateTikTokCertificateInput($metaobject: MetaobjectCreateInput!) {
      metaobjectCreate(metaobject: $metaobject) {
        metaobject { id handle }
        userErrors { field message code }
      }
    }
  `, {
    metaobject: {
      type: metaobjectType(),
      handle,
      fields: [
        { key: uploadDateFieldKey(), value: uploadDate },
        { key: inputFieldKey(), value: inputJson },
      ],
    },
  });

  const graphqlError = result?.errors?.map((error) => textValue(error.message)).filter(Boolean).join(" ");
  if (graphqlError) return json(500, { ok: false, error: graphqlError });

  const userErrors = result?.data?.metaobjectCreate?.userErrors ?? [];
  if (userErrors.length) {
    return json(500, {
      ok: false,
      error: userErrors.map((error) => error.message || error.code || "Shopify rejected the export.").join(" "),
    });
  }

  const metaobject = result?.data?.metaobjectCreate?.metaobject;
  if (!metaobject?.id) return json(500, { ok: false, error: "Shopify did not return the exported entry." });

  return json(200, {
    ok: true,
    id: metaobject.id,
    handle: metaobject.handle || handle,
    uploadDate,
    count: payload.length,
  });
}
