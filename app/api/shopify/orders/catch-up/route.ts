import { NextResponse } from "next/server";

import { shopifyOrderToFulfilmentOrders } from "@/lib/importer";
import { fetchShopifyOrdersCreatedSince, shopifyMetafieldValue } from "@/lib/shopify-orders";
import { fetchSharedOrders, insertSharedActivity, syncCreatorCommissions, upsertSharedOrders } from "@/lib/supabase";

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
    const [existing, shopifyOrders] = await Promise.all([
      fetchSharedOrders(),
      fetchShopifyOrdersCreatedSince(date, request),
    ]);
    const imported = shopifyOrders.flatMap((order) => shopifyOrderToFulfilmentOrders(
      order,
      shopifyMetafieldValue(order),
      existing,
      "Shopify catch-up",
    ));

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
