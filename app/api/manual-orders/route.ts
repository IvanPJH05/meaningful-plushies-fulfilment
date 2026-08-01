import { NextResponse } from "next/server";

import { createManualOrderDiscounts, deactivateManualOrderDiscount, findShopifyOrderForManualOrder } from "../../../lib/manual-orders";
import { fetchManualOrders, saveManualOrder, updateManualOrder } from "../../../lib/supabase";
import type { ManualOrder } from "../../../lib/types";

export const runtime = "nodejs";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string" && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function manualOrdersCsv(manualOrders: ManualOrder[]) {
  const columns = ["buyer_status", "customer_name", "phone_number", "product", "shipping_region", "discount_code", "checkout_link", "manual_order_status", "shopify_order_id", "shopify_order_name", "created_at", "bought_at", "updated_at"] as const;
  const rows = manualOrders.map((order) => [
    order.status === "used" ? "BOUGHT" : "NOT_YET_BOUGHT", order.customerName, order.phoneNormalized || order.phoneOriginal, order.productDisplayName,
    order.shippingRegion === "EAST" ? "East Malaysia" : "West Malaysia", order.productDiscountCode, order.customerLink, order.status,
    order.shopifyOrderId, order.shopifyOrderName, order.createdAt, order.usedAt, order.updatedAt,
  ].map(csvCell).join(","));
  return `\uFEFF${[columns.join(","), ...rows].join("\r\n")}`;
}

export async function GET(request: Request) {
  try {
    const manualOrders = await fetchManualOrders();
    if (new URL(request.url).searchParams.get("format") === "csv") {
      return new Response(manualOrdersCsv(manualOrders), {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": 'attachment; filename="meaningful-plushies-manual-orders.csv"',
          "cache-control": "no-store",
        },
      });
    }
    return json(200, { ok: true, manualOrders });
  } catch (error) {
    return json(500, { ok: false, error: errorMessage(error, "Manual orders could not be loaded.") });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      customerName?: string;
      phone?: string;
      productKey?: string;
      character?: string;
      shippingRegion?: string;
    };
    const manualOrder = await createManualOrderDiscounts({
      customerName: body.customerName ?? "",
      phone: body.phone ?? "",
      productKey: body.productKey ?? "",
      character: body.character ?? "",
      shippingRegion: body.shippingRegion === "EAST" ? "EAST" : "WEST",
    });
    await saveManualOrder(manualOrder);
    return json(200, { ok: true, manualOrder });
  } catch (error) {
    return json(500, { ok: false, error: errorMessage(error, "Manual order could not be created.") });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as { action?: string; manualOrder?: ManualOrder };
    if (body.action === "cancel" && body.manualOrder) {
      await deactivateManualOrderDiscount(body.manualOrder.productDiscountShopifyId);
      await deactivateManualOrderDiscount(body.manualOrder.shippingDiscountShopifyId);
      await updateManualOrder(body.manualOrder.id, { status: "cancelled" });
      return json(200, { ok: true });
    }

    if (body.action === "refresh") {
      const manualOrders = await fetchManualOrders();
      let updated = 0;
      for (const manualOrder of manualOrders.filter((order) => order.status === "active")) {
        const match = await findShopifyOrderForManualOrder(manualOrder);
        if (!match) continue;
        await updateManualOrder(manualOrder.id, {
          status: "used",
          shopifyOrderId: match.shopifyOrderId,
          shopifyOrderName: match.shopifyOrderName,
          usedAt: match.usedAt,
        });
        updated += 1;
      }
      return json(200, { ok: true, updated, manualOrders: await fetchManualOrders() });
    }

    return json(400, { ok: false, error: "Invalid manual order action." });
  } catch (error) {
    return json(500, { ok: false, error: errorMessage(error, "Manual order could not be updated.") });
  }
}
