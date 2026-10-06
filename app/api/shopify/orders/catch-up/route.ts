import { NextResponse } from "next/server";

import { shopifyOrderToFulfilmentOrders } from "@/lib/importer";
import { isPlushCharmOrder } from "@/lib/plush-charm";
import { cleanShopifyOrderNumber, fetchShopifyOrdersCreatedSince, shopifyMetafieldValue, textValue } from "@/lib/shopify-orders";
import { fetchSharedOrders, fetchSharedOrdersByOrderNumber, insertSharedActivity, upsertSharedOrders } from "@/lib/supabase";
import { createCloserOrderLink, isFormattedPlushCharmLink, nextPlushCharmSequence } from "@/src/modules/closer/service";
import type { Order } from "@/lib/types";

export const runtime = "nodejs";

function malaysiaDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// A catch-up is often used when Shopify webhooks were delayed. Treat an Our
// Link as a helpful follow-up, never as a reason to omit a paid Charm order
// from fulfilment. Individual failures leave the order visible for a later
// refresh to complete.
async function addMissingPlushCharmLinks(orders: Order[]) {
  if (!orders.some((order) => isPlushCharmOrder(order) && !isFormattedPlushCharmLink(order.idWebsiteLink))) return orders;

  let nextSequence: number;
  try {
    nextSequence = nextPlushCharmSequence((await fetchSharedOrders()).filter(isPlushCharmOrder));
  } catch (error) {
    console.error("Could not reserve a Plush Charm Our Link sequence during Shopify catch-up", error);
    return orders;
  }

  return Promise.all(orders.map(async (order) => {
    if (!isPlushCharmOrder(order) || isFormattedPlushCharmLink(order.idWebsiteLink)) return order;
    try {
      return { ...order, idWebsiteLink: await createCloserOrderLink(order, nextSequence++) };
    } catch (error) {
      console.error(`Could not create an Our Link for Plush Charm order #${order.orderNumber} during Shopify catch-up`, error);
      return order;
    }
  }));
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as { date?: string };
    const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || "") ? body.date as string : malaysiaDate();
    const recentShopifyOrders = await fetchShopifyOrdersCreatedSince(date, request);
    const startOfDay = Date.parse(`${date}T00:00:00+08:00`);
    const shopifyOrders = recentShopifyOrders.filter((order) => {
      const createdAt = Date.parse(textValue(order.createdAt));
      return Number.isFinite(createdAt) && createdAt >= startOfDay;
    });
    // A recovery must not read every historical fulfilment payload. Those rows
    // can contain uploaded media, which is slow and needlessly consumes the
    // database's Disk IO budget. Compare each recent Shopify order only with
    // its own existing fulfilment row, preserving staff edits as before.
    const imported = [];
    for (const order of shopifyOrders) {
      const orderNumber = cleanShopifyOrderNumber(textValue(order.name));
      if (!orderNumber) continue;
      const existing = await fetchSharedOrdersByOrderNumber(orderNumber);
      const orders = shopifyOrderToFulfilmentOrders(
        order,
        shopifyMetafieldValue(order),
        existing,
        "Shopify catch-up",
      );
      imported.push(...await addMissingPlushCharmLinks(orders));
    }

    if (imported.length) {
      // Keep recovery writes narrow and fast. Reporting and commission
      // aggregates are maintained outside the Shopify ingestion path.
      await upsertSharedOrders(imported, { syncSales: false });
      await insertSharedActivity({
        id: `shopify-catch-up-${Date.now()}`,
        action: "Shopify catch-up completed",
        detail: `${shopifyOrders.length} Shopify order${shopifyOrders.length === 1 ? "" : "s"} checked; ${imported.length} fulfilment row${imported.length === 1 ? "" : "s"} updated for ${date}.`,
        actor: "Shopify catch-up",
        createdAt: new Date().toISOString(),
      });
    }

    return NextResponse.json({ ok: true, date, checked: shopifyOrders.length, updated: imported.length });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Shopify catch-up failed." }, { status: 500 });
  }
}
