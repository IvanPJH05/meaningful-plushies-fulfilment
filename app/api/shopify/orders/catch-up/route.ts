import { NextResponse } from "next/server";

import { shopifyOrderToFulfilmentOrders } from "@/lib/importer";
import { cleanShopifyOrderNumber, fetchShopifyOrdersCreatedSince, shopifyMetafieldValue, textValue } from "@/lib/shopify-orders";
import { fetchSharedOrdersByOrderNumber, insertSharedActivity, syncCreatorCommissions, upsertSharedOrders } from "@/lib/supabase";

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
      imported.push(...shopifyOrderToFulfilmentOrders(
        order,
        shopifyMetafieldValue(order),
        existing,
        "Shopify catch-up",
      ));
    }

    if (imported.length) {
      await upsertSharedOrders(imported);
      await syncCreatorCommissions();
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
