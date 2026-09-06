import { NextResponse } from "next/server";

import { fetchSharedOrders } from "../../../../lib/supabase";
import { whatsappCustomisationLinkForOrder } from "../../../../lib/customisation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const orderId = new URL(request.url).searchParams.get("orderId") || "";
  if (!orderId) return NextResponse.json({ ok: false, error: "Order is required." }, { status: 400 });
  try {
    const order = (await fetchSharedOrders()).find((item) => item.id === orderId);
    if (!order) return NextResponse.json({ ok: false, error: "Order not found." }, { status: 404 });
    const link = await whatsappCustomisationLinkForOrder(order);
    return NextResponse.json({ ok: true, link });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not create WhatsApp link." }, { status: 500 });
  }
}
