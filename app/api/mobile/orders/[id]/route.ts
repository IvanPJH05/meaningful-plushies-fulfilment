import { NextResponse } from "next/server";
import { mobileOrder, mobileServiceClient, requireMobileSession } from "../../../../../lib/mobile-api";
import type { Order } from "../../../../../lib/types";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireMobileSession(request);
    const { id } = await context.params;
    // Fulfilment orders can use Shopify numeric IDs, TikTok IDs, or UUIDs.
    // The list already returns the database ID, so do not reject valid
    // non-UUID orders before looking them up.
    const orderId = decodeURIComponent(id).trim();
    if (!orderId || orderId.length > 160) return NextResponse.json({ error: "Invalid order." }, { status: 400 });
    // A full row is read only after staff explicitly open one order. This keeps
    // the list fast while preserving every useful customer and payment detail.
    const { data, error } = await mobileServiceClient().from("fulfilment_orders").select("data").eq("id", orderId).maybeSingle();
    if (error) throw error;
    if (!data?.data) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    const order = data.data as Order;
    const externalVoice = /^https?:\/\//i.test(order.meaningfulMessage || "") ? order.meaningfulMessage : "";
    const embeddedVoice = typeof order.tikTokFileDataUrl === "string" && order.tikTokFileDataUrl.startsWith("data:audio/") ? order.tikTokFileDataUrl : "";
    return NextResponse.json({
      order: mobileOrder(order),
      details: {
        email: order.email, currency: order.currency, subtotalAmount: order.subtotalAmount, shippingAmount: order.shippingAmount,
        discountAmount: order.discountAmount, productDiscountAmount: order.productDiscountAmount, shippingDiscountAmount: order.shippingDiscountAmount,
        refundedAmount: order.refundedAmount, outstandingBalance: order.outstandingBalance, meaningfulNote: order.meaningfulNote,
        remark: order.remark, plushGender: order.plushGender, plushBirthDate: order.plushBirthDate, plushBirthPlace: order.plushBirthPlace,
        plushFavouritePerson: order.plushFavouritePerson, plushBelongsTo: order.plushBelongsTo, certificateCode: order.certificateCode,
        idWebsiteLink: order.idWebsiteLink, shippingMethod: order.shippingMethod, discountCodes: order.discountCodes ?? [],
        voice: (externalVoice || embeddedVoice) ? { url: externalVoice || embeddedVoice, fileName: order.tikTokFileName || "Voice message" } : null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ORDER_DETAILS_FAILED";
    return NextResponse.json({ error: message }, { status: message.includes("REQUIRED") ? 401 : 500 });
  }
}
