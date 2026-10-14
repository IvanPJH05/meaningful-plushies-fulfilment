import { NextResponse } from "next/server";
import { mobileServiceClient, requireMobileSession } from "@/lib/mobile-api";
import { batchStages } from "@/lib/fulfilment-batches";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers = { "Cache-Control": "private, no-store" };
function detailResponse(data: { orders: Record<string, unknown>[] }) {
  const strings = ["id", "orderNumber", "character", "certificateCode", "idWebsiteLink", "meaningfulMessage", "plushName", "customerName", "phone", "address", "product", "paymentProcessor", "courier", "trackingNumber", "tikTokFileName"];
  return NextResponse.json({ ...data, orders: data.orders.map(order => ({ ...order, ...Object.fromEntries(strings.map(key => [key, typeof order[key] === "string" ? order[key] : ""])), statusHistory: Array.isArray(order.statusHistory) ? order.statusHistory : [] })) }, { headers });
}
function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "BATCH_REQUEST_FAILED";
  const status = message.includes("REQUIRED") && (message.includes("SIGN_IN") || message.includes("ACCESS")) ? 401 : message === "BATCH_NOT_FOUND" ? 404 : /CHANGED|STAGE|ALREADY|COMPLETE|duplicate key/.test(message) ? 409 : /INVALID|REQUIRED|NOT_IN_BATCH|TOO_LARGE|ORDER_NOT_FOUND/.test(message) ? 400 : 500;
  const readable: Record<string, string> = {
    ORDER_STAGE_NOT_READY: "Only New Order or Uploading Audio orders can join a batch.",
    ORDER_STAGE_CHANGED: "An order changed stage. Review the batch orders before completing the NFC step.",
    BATCH_ALREADY_STARTED: "This batch has already started. Create a new batch for these orders.",
    SHIPPING_LABEL_REQUIRED: "Every order needs its shipping label before continuing.",
    ENVELOPE_NAME_REQUIRED: "Enter a name for every envelope before continuing.",
    BATCH_TOO_LARGE: "A batch can contain up to 200 orders.",
    BATCH_COMPLETE: "This batch is already complete.",
  };
  return NextResponse.json({ error: message.includes("duplicate key") ? "One of these orders is already in a batch. Refresh and check the selection." : readable[message] ?? message }, { status, headers });
}
export async function GET(request: Request) {
  try {
    await requireMobileSession(request);
    const db = mobileServiceClient(), id = new URL(request.url).searchParams.get("id");
    if (id) {
      if (!uuid.test(id)) throw new Error("INVALID_BATCH");
      const { data, error } = await db.rpc("read_fulfilment_batch", { p_batch_id: id });
      if (error) throw new Error(error.message);
      if (!data) throw new Error("BATCH_NOT_FOUND");
      return detailResponse(data);
    }
    const { data, error } = await db.rpc("list_fulfilment_batches");
    if (error) throw new Error(error.message);
    return NextResponse.json({ batches: data ?? [] }, { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const session = await requireMobileSession(request);
    const body = await request.json();
    if (!body || !uuid.test(body.batchId ?? "") || !["create", "add", "labels", "envelope_names", "advance", "nfc"].includes(body.action) || (body.action !== "create" && (!Number.isInteger(body.version) || body.version < 1))) throw new Error("INVALID_BATCH_REQUEST");
    const payload = body.payload ?? {};
    if (["create", "add"].includes(body.action) && (!Array.isArray(payload.orderIds) || payload.orderIds.length < 1 || payload.orderIds.length > 200 || payload.orderIds.some((id: unknown) => typeof id !== "string" || !id || id.length > 200) || new Set(payload.orderIds).size !== payload.orderIds.length)) throw new Error("INVALID_ORDERS");
    if (body.action === "advance" && !batchStages.slice(0, 4).includes(payload.stage)) throw new Error("INVALID_STAGE");
    if (body.action === "nfc" && (typeof payload.orderId !== "string" || !payload.orderId)) throw new Error("INVALID_ORDER");
    if (body.action === "labels") {
      if (!Array.isArray(payload.labels) || !payload.labels.length || payload.labels.length > 200) throw new Error("INVALID_LABELS");
      for (const label of payload.labels) {
        if (!label || typeof label.orderId !== "string" || typeof label.url !== "string" || typeof label.fileName !== "string" || !["jnt", "tiktok"].includes(label.source)) throw new Error("INVALID_LABEL");
        const url = new URL(label.url);
        if (url.origin !== new URL(request.url).origin || !/^\/media-assets\/[a-f0-9]{64}\/original$/.test(url.pathname)) throw new Error("INVALID_LABEL_URL");
      }
    }
    if (body.action === "envelope_names" && (!payload.names || Array.isArray(payload.names) || typeof payload.names !== "object" || Object.keys(payload.names).length > 200 || Object.values(payload.names).some(name => typeof name !== "string" || !name.trim() || name.length > 60))) throw new Error("INVALID_ENVELOPE_NAMES");
    const db = mobileServiceClient();
    const { data: id, error } = await db.rpc("mutate_fulfilment_batch", { p_action: body.action, p_batch_id: body.batchId, p_version: body.version ?? 1, p_payload: payload, p_actor: `${session.displayName} (${session.username})` });
    if (error) throw new Error(error.message);
    const { data, error: readError } = await db.rpc("read_fulfilment_batch", { p_batch_id: id });
    if (readError) throw new Error(readError.message);
    return detailResponse(data);
  } catch (error) { return failure(error); }
}
