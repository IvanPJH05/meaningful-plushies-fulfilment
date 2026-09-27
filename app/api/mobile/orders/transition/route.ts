import { NextResponse } from "next/server";
import { requireMobileSession, transitionMobileOrder } from "../../../../../lib/mobile-api";
import { orderStatuses, type OrderStatus } from "../../../../../lib/types";

const next: Partial<Record<OrderStatus, OrderStatus>> = { awaiting_customisation: "new_order", new_order: "uploading_audio", uploading_audio: "sent_for_sewing", sent_for_sewing: "packed", packed: "shipped" };

export async function POST(request: Request) {
  try {
    const session = await requireMobileSession(request);
    const body = await request.json() as { orderId?: string; fromStatus?: OrderStatus; toStatus?: OrderStatus };
    if (!body.orderId || !body.fromStatus || !body.toStatus || !orderStatuses.includes(body.fromStatus) || !orderStatuses.includes(body.toStatus)) return NextResponse.json({ error: "Invalid order transition." }, { status: 400 });
    if (session.role === "staff" && next[body.fromStatus] !== body.toStatus) return NextResponse.json({ error: "Staff can only move an order to its next stage." }, { status: 403 });
    const order = await transitionMobileOrder(body.orderId, body.fromStatus, body.toStatus, `${session.displayName} (${session.username})`);
    return NextResponse.json({ order });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UPDATE_FAILED";
    const status = message === "ORDER_CHANGED" ? 409 : message.includes("REQUIRED") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export function OPTIONS() { return new NextResponse(null, { status: 204 }); }
