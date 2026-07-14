import { NextResponse } from "next/server";

import { createManualOrderDiscounts, deactivateManualOrderDiscount } from "../../../lib/manual-orders";
import { fetchManualOrders, saveManualOrder, updateManualOrder } from "../../../lib/supabase";
import type { ManualOrder } from "../../../lib/types";

export const runtime = "nodejs";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function GET() {
  try {
    return json(200, { ok: true, manualOrders: await fetchManualOrders() });
  } catch (error) {
    return json(500, { ok: false, error: error instanceof Error ? error.message : "Manual orders could not be loaded." });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      customerName?: string;
      phone?: string;
      productKey?: string;
      shippingRegion?: string;
    };
    const manualOrder = await createManualOrderDiscounts({
      customerName: body.customerName ?? "",
      phone: body.phone ?? "",
      productKey: body.productKey ?? "",
      shippingRegion: body.shippingRegion === "EAST" ? "EAST" : "WEST",
    });
    await saveManualOrder(manualOrder);
    return json(200, { ok: true, manualOrder });
  } catch (error) {
    return json(500, { ok: false, error: error instanceof Error ? error.message : "Manual order could not be created." });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as { action?: string; manualOrder?: ManualOrder };
    if (body.action !== "cancel" || !body.manualOrder) return json(400, { ok: false, error: "Invalid manual order action." });
    await deactivateManualOrderDiscount(body.manualOrder.productDiscountShopifyId);
    await deactivateManualOrderDiscount(body.manualOrder.shippingDiscountShopifyId);
    await updateManualOrder(body.manualOrder.id, { status: "cancelled" });
    return json(200, { ok: true });
  } catch (error) {
    return json(500, { ok: false, error: error instanceof Error ? error.message : "Manual order could not be updated." });
  }
}
