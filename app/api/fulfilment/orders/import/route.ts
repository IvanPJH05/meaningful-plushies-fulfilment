import { NextResponse } from "next/server";
import { mobileServiceClient, requireMobileSession } from "../../../../../lib/mobile-api";
import { upsertSharedOrders } from "../../../../../lib/supabase";
import { orderStatuses, type Order } from "../../../../../lib/types";
import { InvalidRecordingError } from "../../../../../lib/batch-audio";
import { validateTikTokVoice } from "../../../../../lib/tiktok-voice-validation";

export const runtime = "nodejs";
export const maxDuration = 300;

function validOrder(value: unknown): value is Order {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const order = value as Order;
  return typeof order.id === "string" && Boolean(order.id) && order.id.length <= 200
    && typeof order.orderNumber === "string" && Boolean(order.orderNumber) && order.orderNumber.length <= 200
    && orderStatuses.includes(order.status)
    && (order.salesChannel === undefined || order.salesChannel === "tiktok" || order.salesChannel === "shopify")
    && typeof order.updatedAt === "string" && Number.isFinite(Date.parse(order.updatedAt))
    && typeof order.orderDate === "string" && (!order.orderDate || Number.isFinite(Date.parse(order.orderDate)))
    && ["customerName", "phone", "email", "address", "product", "character", "plushName", "meaningfulNote", "meaningfulMessage", "certificateCode", "trackingNumber", "paymentProcessor"].every(key => typeof (order as unknown as Record<string, unknown>)[key] === "string");
}

export async function POST(request: Request) {
  try {
    // Uses the same active, unexpired warehouse session as stage changes.
    // Service credentials stay on the server; the trigger queues certificate
    // work under this connection while queue permissions remain restricted.
    await requireMobileSession(request);
    const text = await request.text();
    if (text.length > 12_000_000) return NextResponse.json({ error: "Import batch is too large." }, { status: 413 });
    let input: { orders?: unknown };
    try { input = JSON.parse(text); } catch { return NextResponse.json({ error: "Invalid import batch." }, { status: 400 }); }
    const orders = input?.orders;
    if (!Array.isArray(orders) || !orders.length || orders.length > 25 || !orders.every(validOrder)
      || new Set(orders.map(order => order.id)).size !== orders.length) {
      return NextResponse.json({ error: "Invalid import batch." }, { status: 400 });
    }
    const client = mobileServiceClient();
    for (let offset = 0; offset < orders.length; offset += 4) {
      await Promise.all(orders.slice(offset, offset + 4).map(async (order) => {
        if (order.salesChannel !== "tiktok" || !order.tikTokFileDataUrl) return;
        try {
          await validateTikTokVoice(client, order);
        } catch (error) {
          if (!(error instanceof InvalidRecordingError)) throw error;
          throw new InvalidRecordingError(`Order #${order.orderNumber}: ${error.message}`);
        }
      }));
    }
    const outcome = await upsertSharedOrders(orders, undefined, client);
    return NextResponse.json(outcome, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "IMPORT_FAILED";
    if (error instanceof InvalidRecordingError) return NextResponse.json({ error: message }, { status: 422 });
    if (message === "SIGN_IN_REQUIRED") return NextResponse.json({ error: "Sign in again to import orders." }, { status: 401 });
    if (message === "WAREHOUSE_ACCESS_REQUIRED") return NextResponse.json({ error: "Warehouse access is required to import orders." }, { status: 403 });
    console.error("Order import failed", error);
    return NextResponse.json({ error: "Import could not be saved. Your CSV and details are kept; please retry." }, { status: 500 });
  }
}
