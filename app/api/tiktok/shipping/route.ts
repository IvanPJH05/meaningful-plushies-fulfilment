import { NextResponse } from "next/server";
import { requireTikTokAdmin } from "@/lib/tiktok-connection";
import { shippingOrderIds, type Handover } from "@/lib/tiktok-shipping-policy";
import { inspectTikTokShipping, performTikTokShipping, type ShippingReview } from "@/lib/tiktok-shipping";
export const runtime = "nodejs";
export const maxDuration = 180;
export async function POST(request: Request) {
  try { await requireTikTokAdmin(request); } catch { return NextResponse.json({ error: "Administrator sign-in required." }, { status: 403 }); }
  try {
    const body = await request.json();
    const ids = shippingOrderIds(body.orderIds);
    if (body.action === "inspect") {
      const reviews: ShippingReview[] = [];
      for (const orderId of ids) {
        try { reviews.push((await inspectTikTokShipping(orderId)).review); }
        catch (error) { reviews.push({ orderId, orderNumber: orderId.replace(/^tiktok-/, ""), error: error instanceof Error ? error.message : "Could not inspect this shipment." }); }
      }
      return NextResponse.json({ reviews }, { headers: { "cache-control": "no-store" } });
    }
    if (!["arrange", "label"].includes(body.action) || ids.length !== 1 || typeof body.packageId !== "string" || !/^\d{8,25}$/.test(body.packageId)) throw Error("Invalid shipping request. Refresh shipment details.");
    const handover = body.handover as Handover | undefined;
    if (body.action === "arrange" && (!handover || !["PICKUP", "DROP_OFF", "SHOP_DEFAULT"].includes(handover.method))) throw Error("Confirm the shipping arrangement before continuing.");
    const review = await performTikTokShipping(ids[0], body.packageId, body.action, handover);
    return NextResponse.json({ review }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "TikTok shipment request failed." }, { status: 400 });
  }
}
