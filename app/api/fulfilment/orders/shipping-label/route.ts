import { NextResponse } from "next/server";
import { matchBatchLabel } from "@/lib/fulfilment-batches";
import { mobileServiceClient, requireMobileSession } from "@/lib/mobile-api";

export async function PATCH(request: Request) {
  try {
    await requireMobileSession(request);
    const label = await request.json().catch(() => null);
    if (!label || typeof label.orderId !== "string" || !label.orderId || label.orderId.length > 200
      || typeof label.reference !== "string" || !/^\d{3,30}$/.test(label.reference)
      || !["tiktok", "jnt"].includes(label.source)
      || typeof label.fileName !== "string" || !label.fileName || label.fileName.length > 300
      || typeof label.url !== "string" || label.url.length > 400) {
      return NextResponse.json({ error: "Invalid shipping label." }, { status: 400 });
    }
    const url = URL.parse(label.url);
    if (!url || url.origin !== new URL(request.url).origin || !/^\/media-assets\/[a-f0-9]{64}\/original$/.test(url.pathname)
      || url.search || url.hash || url.username || url.password) {
      return NextResponse.json({ error: "Invalid shipping label URL." }, { status: 400 });
    }

    const db = mobileServiceClient();
    const { data: order, error: readError } = await db.from("fulfilment_orders")
      .select("data,order_number,status,updated_at").eq("id", label.orderId).maybeSingle();
    if (readError) throw readError;
    if (!order || !matchBatchLabel([{ orderNumber: order.order_number, salesChannel: order.data.salesChannel }], label).length) {
      return NextResponse.json({ error: "The shipping label no longer matches this order." }, { status: 409 });
    }

    const fields = {
      shippingLabelUrl: url.href,
      shippingLabelFileName: label.fileName,
      shippingLabelSource: label.source,
    };
    if (Object.entries(fields).every(([key, value]) => order.data[key] === value)) {
      return NextResponse.json({ order: { ...fields, status: order.status, updatedAt: order.updated_at } });
    }
    const updatedAt = new Date().toISOString();
    const { data: updated, error: writeError } = await db.from("fulfilment_orders")
      .update({ data: { ...order.data, ...fields, updatedAt }, updated_at: updatedAt })
      .eq("id", label.orderId).eq("updated_at", order.updated_at).select("status,updated_at").maybeSingle();
    if (writeError) throw writeError;
    if (!updated) return NextResponse.json({ error: "The order changed during import. Refresh and try again." }, { status: 409 });
    return NextResponse.json({ order: { ...fields, status: updated.status, updatedAt: updated.updated_at } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "SIGN_IN_REQUIRED") return NextResponse.json({ error: "Sign in again to pair shipping labels." }, { status: 401 });
    if (message === "WAREHOUSE_ACCESS_REQUIRED") return NextResponse.json({ error: "Warehouse access is required to pair shipping labels." }, { status: 403 });
    console.error("Shipping label save failed", error);
    return NextResponse.json({ error: "The PDF was read, but the shipping label could not be saved." }, { status: 500 });
  }
}
