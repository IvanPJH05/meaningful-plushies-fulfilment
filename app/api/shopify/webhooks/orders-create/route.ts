import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { shopifyOrderToFulfilmentOrders } from "../../../../../lib/importer";
import { cleanShopifyOrderNumber, fetchShopifyOrderWithMetafieldRetry, shopifyMetafieldValue, textValue } from "../../../../../lib/shopify-orders";
import { fetchSharedOrders, insertSharedActivity, upsertSharedOrders } from "../../../../../lib/supabase";

export const runtime = "nodejs";

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
    const fullOrder = await fetchShopifyOrderWithMetafieldRetry(payload, request);
    const uploadLiftFormData = shopifyMetafieldValue(fullOrder) || shopifyMetafieldValue(payload);
    const existing = await fetchSharedOrders();
    const importedOrders = shopifyOrderToFulfilmentOrders(fullOrder, uploadLiftFormData, existing, "Shopify");
    const syncedNumber = cleanShopifyOrderNumber(
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
