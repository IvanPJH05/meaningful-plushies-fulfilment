import { NextResponse } from "next/server";

import { shopifyOrderToFulfilmentOrders } from "../../../../../lib/importer";
import { sendMetaPurchaseEvents } from "../../../../../lib/meta-capi";
import { cleanShopifyOrderNumber, fetchShopifyOrderByNumberWithMetafieldRetry, shopifyMetafieldValue, textValue } from "../../../../../lib/shopify-orders";
import { fetchMetaCapiSettings, fetchSharedOrders, insertSharedActivity, syncCreatorCommissions, upsertSharedOrders } from "../../../../../lib/supabase";
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

async function refreshOneOrder(requestedOrderNumber: string, existing: Order[], request: Request) {
  const matchingExisting = existing.filter((order) => (
    order.orderNumber === requestedOrderNumber && (order.salesChannel ?? "shopify") === "shopify"
  ));
  if (!matchingExisting.length) {
    return { orderNumber: requestedOrderNumber, ok: false, error: `Shopify order #${requestedOrderNumber} is not saved in fulfilment yet.`, orders: [] as Order[], updated: 0 };
  }

  const fullOrder = await fetchShopifyOrderByNumberWithMetafieldRetry(requestedOrderNumber, request);
  const syncedNumber = cleanShopifyOrderNumber(textValue(fullOrder?.name));
  if (!fullOrder || syncedNumber !== requestedOrderNumber) {
    return { orderNumber: requestedOrderNumber, ok: false, error: `Shopify order #${requestedOrderNumber} could not be found.`, orders: [] as Order[], updated: 0 };
  }

  const importedOrders = shopifyOrderToFulfilmentOrders(
    fullOrder,
    shopifyMetafieldValue(fullOrder),
    existing,
    "Shopify refresh",
  ).filter((order) => order.orderNumber === requestedOrderNumber);

  if (!importedOrders.length) {
    return { orderNumber: requestedOrderNumber, ok: false, error: `Shopify order #${requestedOrderNumber} could not be converted into fulfilment orders.`, orders: [] as Order[], updated: 0 };
  }

  const previousById = new Map(existing.map((order) => [order.id, order]));
  const changedOrders = importedOrders.filter((order) => {
    const previous = previousById.get(order.id);
    return !previous || JSON.stringify(comparableOrder(previous)) !== JSON.stringify(comparableOrder(order));
  });

  return {
    orderNumber: requestedOrderNumber,
    ok: true,
    changed: changedOrders.length > 0,
    updated: changedOrders.length,
    orders: importedOrders,
    shopifyOrder: fullOrder,
  };
}

export async function POST(request: Request) {
  let body: { orderNumber?: string; orderNumbers?: string[] };
  try {
    body = await request.json() as { orderNumber?: string; orderNumbers?: string[] };
  } catch {
    return json(400, { ok: false, error: "Invalid refresh request." });
  }

  const requestedOrderNumbers = [
    ...(Array.isArray(body.orderNumbers) ? body.orderNumbers : []),
    body.orderNumber ?? "",
  ].map((number) => cleanShopifyOrderNumber(String(number))).filter(Boolean);
  const uniqueOrderNumbers = [...new Set(requestedOrderNumbers)];
  if (!uniqueOrderNumbers.length) return json(400, { ok: false, error: "At least one order number is required." });

  try {
    const existing = await fetchSharedOrders();
    const results = [];
    for (const orderNumber of uniqueOrderNumbers) {
      results.push(await refreshOneOrder(orderNumber, existing, request));
    }

    const successful = results.filter((result) => result.ok);
    const changedOrders = successful.flatMap((result) => result.updated > 0 ? result.orders : []);
    const updatedCount = successful.reduce((sum, result) => sum + result.updated, 0);
    const checkedRows = successful.reduce((sum, result) => sum + result.orders.length, 0);

    if (changedOrders.length) {
      await upsertSharedOrders(changedOrders);
      await syncCreatorCommissions();
      await insertSharedActivity({
        id: `shopify-refresh-${Date.now()}`,
        orderNumber: uniqueOrderNumbers.length === 1 ? uniqueOrderNumbers[0] : undefined,
        action: "Shopify order refreshed",
        detail: `${checkedRows} fulfilment row${checkedRows === 1 ? "" : "s"} checked, ${updatedCount} updated from Shopify.`,
        actor: "Shopify refresh",
        createdAt: new Date().toISOString(),
      });
    }

    try {
      const metaSettings = await fetchMetaCapiSettings();
      for (const result of successful) {
        if (result.orders.length) {
          await sendMetaPurchaseEvents({
            orders: result.orders,
            shopifyOrder: result.shopifyOrder,
            settings: metaSettings,
            source: "shopify_refresh",
            request,
          });
        }
      }
    } catch (error) {
      console.error("Meta CAPI purchase event failed after Shopify refresh", error);
    }

    return json(200, {
      ok: true,
      changed: updatedCount > 0,
      updated: updatedCount,
      checked: successful.length,
      failed: results.length - successful.length,
      results,
    });
  } catch (error) {
    return json(500, {
      ok: false,
      error: error instanceof Error ? error.message : "Shopify order could not be refreshed.",
    });
  }
}
