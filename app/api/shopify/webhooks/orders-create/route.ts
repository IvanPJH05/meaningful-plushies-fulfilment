import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { shopifyOrderToFulfilmentOrders } from "../../../../../lib/importer";
import { fetchSharedOrders, insertSharedActivity, upsertSharedOrders } from "../../../../../lib/supabase";

export const runtime = "nodejs";

const UPLOAD_LIFT_KEY = process.env.SHOPIFY_UPLOAD_LIFT_METAFIELD_KEY ?? "upload_lift_form_data";

let cachedShopifyToken: { token: string; expiresAt: number } | null = null;

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function verifyShopifyHmac(rawBody: string, hmacHeader: string | null) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) return true;
  if (!hmacHeader) return false;

  const digest = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  const expected = Buffer.from(digest, "utf8");
  const received = Buffer.from(hmacHeader, "utf8");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function textValue(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function orderNumber(value: string) {
  return value.replace(/[^0-9]/g, "");
}

function adminGraphqlOrderId(payload: Record<string, unknown>) {
  const direct = textValue(payload.admin_graphql_api_id) || textValue(payload.id);
  if (!direct) return "";
  return direct.startsWith("gid://") ? direct : `gid://shopify/Order/${direct}`;
}

function shopDomain(request: Request, payload: Record<string, unknown>) {
  const fromHeader = request.headers.get("x-shopify-shop-domain");
  const fromEnv = process.env.SHOPIFY_SHOP_DOMAIN;
  const fromPayload = textValue(payload.shop_domain);
  return (fromHeader || fromEnv || fromPayload || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
}

async function getShopifyAccessToken(domain: string) {
  const fixedToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  if (fixedToken) return fixedToken;

  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret || !domain) return "";

  const now = Date.now();
  if (cachedShopifyToken && cachedShopifyToken.expiresAt > now + 60_000) {
    return cachedShopifyToken.token;
  }

  const response = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
  });

  if (!response.ok) return "";

  const result = await response.json() as { access_token?: string; expires_in?: number };
  const token = textValue(result.access_token);
  if (!token) return "";

  cachedShopifyToken = {
    token,
    expiresAt: now + Math.max(1, Number(result.expires_in ?? 86_400)) * 1000,
  };
  return token;
}

function metafieldValue(payload: Record<string, unknown>) {
  const metafields = payload.metafields;
  const nodes = objectValue(metafields).nodes;
  const values = Array.isArray(nodes) ? nodes : Array.isArray(metafields) ? metafields : [];
  for (const item of values) {
    const field = objectValue(item);
    if (textValue(field.key) === UPLOAD_LIFT_KEY) return textValue(field.value);
  }
  return textValue(payload[UPLOAD_LIFT_KEY]);
}

function normalizeGraphqlOrder(order: Record<string, unknown>): Record<string, unknown> {
  const lineItems = objectValue(order.lineItems).nodes;
  const metafields = objectValue(order.metafields).nodes;
  return {
    ...order,
    lineItems: Array.isArray(lineItems) ? lineItems : [],
    metafields: Array.isArray(metafields) ? metafields : [],
  };
}

async function fetchShopifyOrder(payload: Record<string, unknown>, request: Request): Promise<Record<string, unknown>> {
  const domain = shopDomain(request, payload);
  const orderId = adminGraphqlOrderId(payload);
  const token = await getShopifyAccessToken(domain);
  if (!token || !domain || !orderId) return payload;

  const apiVersion = process.env.SHOPIFY_API_VERSION ?? "2026-04";
  const response = await fetch(`https://${domain}/admin/api/${apiVersion}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({
      query: `
        query OrderForFulfilment($id: ID!) {
          order(id: $id) {
            id
            name
            createdAt
            processedAt
            email
            phone
            currencyCode
            note
            currentSubtotalPriceSet { shopMoney { amount currencyCode } }
            currentTotalPriceSet { shopMoney { amount currencyCode } }
            currentTotalDiscountsSet { shopMoney { amount currencyCode } }
            totalShippingPriceSet { shopMoney { amount currencyCode } }
            totalRefundedSet { shopMoney { amount currencyCode } }
            totalOutstandingSet { shopMoney { amount currencyCode } }
            paymentGatewayNames
            shippingAddress { name address1 address2 city province zip country phone }
            billingAddress { name address1 address2 city province zip country phone }
            shippingLine { title }
            lineItems(first: 50) {
              nodes {
                name
                title
                quantity
                originalUnitPriceSet { shopMoney { amount currencyCode } }
                totalDiscountSet { shopMoney { amount currencyCode } }
              }
            }
            metafields(first: 50) {
              nodes { namespace key value }
            }
          }
        }
      `,
      variables: { id: orderId },
    }),
  });

  if (!response.ok) return payload;
  const result = await response.json() as { data?: { order?: Record<string, unknown> } };
  return result.data?.order ? normalizeGraphqlOrder(result.data.order) : payload;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifyShopifyHmac(rawBody, request.headers.get("x-shopify-hmac-sha256"))) {
    return json(401, { ok: false, error: "Invalid Shopify webhook signature." });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return json(400, { ok: false, error: "Invalid Shopify webhook JSON." });
  }

  try {
    const fullOrder = await fetchShopifyOrder(payload, request);
    const uploadLiftFormData = metafieldValue(fullOrder) || metafieldValue(payload);
    const existing = await fetchSharedOrders();
    const importedOrders = shopifyOrderToFulfilmentOrders(fullOrder, uploadLiftFormData, existing, "Shopify");
    const syncedNumber = orderNumber(
      textValue(fullOrder.name)
      || textValue(fullOrder.order_number)
      || textValue(payload.name)
      || textValue(payload.order_number),
    );
    const ordersToSave = importedOrders.filter((order) => order.orderNumber === syncedNumber);

    await upsertSharedOrders(ordersToSave);
    await insertSharedActivity({
      id: `shopify-order-${Date.now()}`,
      orderNumber: ordersToSave[0]?.orderNumber,
      action: "Shopify order imported",
      detail: `${ordersToSave.length} fulfilment order${ordersToSave.length === 1 ? "" : "s"} saved from Shopify order-created webhook.`,
      actor: "Shopify",
      createdAt: new Date().toISOString(),
    });

    return json(200, { ok: true, saved: ordersToSave.length });
  } catch (error) {
    return json(500, {
      ok: false,
      error: error instanceof Error ? error.message : "Shopify order could not be saved.",
    });
  }
}
