import { NextResponse } from "next/server";

import { shopifyOrderToFulfilmentOrders } from "../../../../../lib/importer";
import { cleanShopifyOrderNumber, fetchShopifyOrderByNumberWithMetafieldRetry, shopifyMetafieldValue, textValue } from "../../../../../lib/shopify-orders";
import { fetchSharedOrders, insertSharedActivity, upsertSharedOrders } from "../../../../../lib/supabase";
import type { Order } from "../../../../../lib/types";

export const runtime = "nodejs";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function comparableOrder(order: Order) {
  return {
    ...order,
    updatedAt: "",
  };
}

export async function POST(request: Request) {
  let body: { orderNumber?: string };
  try {
    body = await request.json() as { orderNumber?: string };
  } catch {
    return json(400, { ok: false, error: "Invalid refresh request." });
  }

  const requestedOrderNumber = cleanShopifyOrderNumber(String(body.orderNumber ?? ""));
  if (!requestedOrderNumber) return json(400, { ok: false, error: "Order number is required." });

  try {
    const existing = await fetchSharedOrders();
    const matchingExisting = existing.filter((order) => (
      order.orderNumber === requestedOrderNumber && (order.salesChannel ?? "shopify") === "shopify"
    ));
    if (!matchingExisting.length) {
      return json(404, { ok: false, error: `Shopify order #${requestedOrderNumber} is not saved in fulfilment yet.` });
    }

    const fullOrder = await fetchShopifyOrderByNumberWithMetafieldRetry(requestedOrderNumber, request);
    const syncedNumber = cleanShopifyOrderNumber(textValue(fullOrder?.name));
    if (!fullOrder || syncedNumber !== requestedOrderNumber) {
      return json(404, { ok: false, error: `Shopify order #${requestedOrderNumber} could not be found.` });
    }

    const importedOrders = shopifyOrderToFulfilmentOrders(
      fullOrder,
      shopifyMetafieldValue(fullOrder),
      existing,
      "Shopify refresh",
    ).filter((order) => order.orderNumber === requestedOrderNumber);

    if (!importedOrders.length) {
      return json(422, { ok: false, error: `Shopify order #${requestedOrderNumber} could not be converted into fulfilment orders.` });
    }

    const previousById = new Map(existing.map((order) => [order.id, order]));
    const changedOrders = importedOrders.filter((order) => {
      const previous = previousById.get(order.id);
      return !previous || JSON.stringify(comparableOrder(previous)) !== JSON.stringify(comparableOrder(order));
    });

    if (changedOrders.length) {
      await upsertSharedOrders(importedOrders);
      await insertSharedActivity({
        id: `shopify-refresh-${Date.now()}`,
        orderNumber: requestedOrderNumber,
        action: "Shopify order refreshed",
        detail: `${importedOrders.length} fulfilment row${importedOrders.length === 1 ? "" : "s"} checked, ${changedOrders.length} updated from Shopify.`,
        actor: "Shopify refresh",
        createdAt: new Date().toISOString(),
      });
    }

    return json(200, {
      ok: true,
      changed: changedOrders.length > 0,
      updated: changedOrders.length,
      orders: importedOrders,
    });
  } catch (error) {
    return json(500, {
      ok: false,
      error: error instanceof Error ? error.message : "Shopify order could not be refreshed.",
    });
  }
}
