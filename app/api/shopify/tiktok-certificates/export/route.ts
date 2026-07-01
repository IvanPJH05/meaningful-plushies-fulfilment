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

function metaobjectTypesToTry() {
  const configured = process.env.SHOPIFY_TIKTOK_CERT_METAOBJECT_TYPE?.trim();
  if (configured) return [configured];
  return ["$app:tik_tok_shop_cert_input", "tik_tok_shop_cert_input"];
}

function uploadDateFieldKey() {
  return process.env.SHOPIFY_TIKTOK_CERT_UPLOAD_DATE_FIELD || "upload_date";
}

function inputFieldKey() {
  return process.env.SHOPIFY_TIKTOK_CERT_INPUT_FIELD || "input";
}

function definitionInput(type: string) {
  return {
    type,
    name: "Tik Tok Shop Cert Input",
    access: {
      admin: "MERCHANT_READ_WRITE",
    },
    fieldDefinitions: [
      {
        key: uploadDateFieldKey(),
        name: "Upload Date",
        type: "single_line_text_field",
        required: true,
      },
      {
        key: inputFieldKey(),
        name: "Input",
        type: "multi_line_text_field",
        required: true,
      },
    ],
  };
}

function definitionAlreadyExists(message: string) {
  return /already exists|taken|has already been taken/i.test(message);
}

async function ensureMetaobjectDefinition(domain: string, type: string) {
  const result = await shopifyGraphql<{
    data?: {
      metaobjectDefinitionCreate?: {
        metaobjectDefinition?: { id?: string; type?: string };
        userErrors?: Array<{ field?: string[]; message?: string; code?: string }>;
      };
    };
    errors?: Array<{ message?: string }>;
  }>(domain, `
    mutation EnsureTikTokCertificateDefinition($definition: MetaobjectDefinitionCreateInput!) {
      metaobjectDefinitionCreate(definition: $definition) {
        metaobjectDefinition { id type }
        userErrors { field message code }
      }
    }
  `, {
    definition: definitionInput(type),
  });

  if (!result) return { ok: false, error: "Shopify credentials are not configured or the Admin API token could not be created." };

  const graphqlError = result.errors?.map((error) => textValue(error.message)).filter(Boolean).join(" ");
  if (graphqlError) return { ok: false, error: graphqlError };

  const userErrors = result.data?.metaobjectDefinitionCreate?.userErrors ?? [];
  const blockingErrors = userErrors.filter((error) => !definitionAlreadyExists(error.message || error.code || ""));
  if (blockingErrors.length) {
    return { ok: false, error: blockingErrors.map((error) => error.message || error.code || "Shopify rejected the metaobject definition.").join(" ") };
  }

  return { ok: true, error: "" };
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

  const errors: string[] = [];
  for (const type of metaobjectTypesToTry()) {
    const definition = await ensureMetaobjectDefinition(domain, type);
    if (!definition.ok) {
      errors.push(`${type}: ${definition.error}`);
      continue;
    }

    const result = await shopifyGraphql<{
      data?: {
        metaobjectUpsert?: {
          metaobject?: { id?: string; handle?: string };
          userErrors?: Array<{ field?: string[]; message?: string; code?: string }>;
        };
      };
      errors?: Array<{ message?: string }>;
    }>(domain, `
      mutation UpsertTikTokCertificateInput($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
        metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
          metaobject { id handle }
          userErrors { field message code }
        }
      }
    `, {
      handle: {
        type,
        handle,
      },
      metaobject: {
        fields: [
          { key: uploadDateFieldKey(), value: uploadDate },
          { key: inputFieldKey(), value: inputJson },
        ],
      },
    });

    if (!result) return json(500, { ok: false, error: "Shopify credentials are not configured or the Admin API token could not be created." });

    const graphqlError = result.errors?.map((error) => textValue(error.message)).filter(Boolean).join(" ");
    if (graphqlError) {
      errors.push(`${type}: ${graphqlError}`);
      continue;
    }

    const userErrors = result.data?.metaobjectUpsert?.userErrors ?? [];
    if (userErrors.length) {
      errors.push(`${type}: ${userErrors.map((error) => error.message || error.code || "Shopify rejected the export.").join(" ")}`);
      continue;
    }

    const metaobject = result.data?.metaobjectUpsert?.metaobject;
    if (!metaobject?.id) {
      errors.push(`${type}: Shopify did not return the exported entry.`);
      continue;
    }

    return json(200, {
      ok: true,
      id: metaobject.id,
      handle: metaobject.handle || handle,
      uploadDate,
      count: payload.length,
    });
  }

  return json(500, { ok: false, error: errors.join(" ") || `Shopify could not create a ${metaobjectType()} entry.` });
}
