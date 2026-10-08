import { NextResponse } from "next/server";

import { shopifyOrderToFulfilmentOrders } from "@/lib/importer";
import { isPlushCharmOrder } from "@/lib/plush-charm";
import { addMissingOurLinks } from "@/lib/our-link";
import { bindSessionsToOrders, customisationSessionIds } from "@/lib/customisation";
import { cleanShopifyOrderNumber, fetchShopifyOrdersCreatedSince, shopifyMetafieldValue, textValue } from "@/lib/shopify-orders";
import { fetchSharedOrders, fetchSharedOrdersByOrderNumber, insertSharedActivity, upsertSharedOrders } from "@/lib/supabase";
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
      // A delayed or incomplete order-created webhook is exactly when this
      // recovery runs.  The saved customisation lives in Supabase and is
      // linked through the Shopify line-item/cart attribute, so recovery must
      // perform the same session binding as the webhook rather than restore a
      // bare order with its personalisation omitted.
      const sessionIds = customisationSessionIds(order);
      const reconciledOrders = sessionIds.length && orders.length
        ? await bindSessionsToOrders({
          orderId: textValue(order.id),
          orderNumber,
          sessionIds,
          orders,
        })
        : orders;
      imported.push(...reconciledOrders);
    }

    // Reserve Charm sales numbers once for the whole recovery batch. Doing it
    // per Shopify order would repeatedly scan fulfilment history and make a
    // normal daily recovery needlessly slow.
    const recoveredOrders = await addMissingOurLinks(imported, "Shopify catch-up");

    if (recoveredOrders.length) {
      // Keep recovery writes narrow and fast. Reporting and commission
      // aggregates are maintained outside the Shopify ingestion path.
      await upsertSharedOrders(recoveredOrders, { syncSales: false });
      await insertSharedActivity({
        id: `shopify-catch-up-${Date.now()}`,
        action: "Shopify catch-up completed",
        detail: `${shopifyOrders.length} Shopify order${shopifyOrders.length === 1 ? "" : "s"} checked; ${recoveredOrders.length} fulfilment row${recoveredOrders.length === 1 ? "" : "s"} updated for ${date}.`,
        actor: "Shopify catch-up",
        createdAt: new Date().toISOString(),
      });
    }

    return NextResponse.json({ ok: true, date, checked: shopifyOrders.length, updated: recoveredOrders.length });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Shopify catch-up failed." }, { status: 500 });
  }
}
