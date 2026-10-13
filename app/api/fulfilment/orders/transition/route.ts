import { NextResponse } from "next/server";

import { mobileServiceClient, requireMobileSession } from "@/lib/mobile-api";
import { orderStatuses, type OrderStatus } from "@/lib/types";

type TransitionRequest = {
  orderId?: string;
  fromStatus?: OrderStatus;
  toStatus?: OrderStatus;
  note?: string;
};

const next: Partial<Record<OrderStatus, OrderStatus>> = {
  awaiting_customisation: "new_order",
  new_order: "uploading_audio",
  uploading_audio: "sent_for_sewing",
  sent_for_sewing: "packed",
  packed: "shipped",
};

export async function POST(request: Request) {
  try {
    // The desktop dashboard uses the same short-lived staff session as the
    // mobile app, but it previously wrote the whole order directly from a
    // browser snapshot.  Apply each transition on the server so a refresh or
    // sales sync cannot put an already-moved order back to its old stage.
    const session = await requireMobileSession(request);
    const body = await request.json() as { transitions?: TransitionRequest[] };
    const transitions = Array.isArray(body.transitions) ? body.transitions : [];
    if (!transitions.length) return NextResponse.json({ error: "Choose at least one order." }, { status: 400 });
    if (transitions.length > 500 || new Set(transitions.map((item) => item?.orderId)).size !== transitions.length
      || transitions.some((item) => !item || !item.orderId || !item.fromStatus || !item.toStatus || !orderStatuses.includes(item.fromStatus) || !orderStatuses.includes(item.toStatus))) {
      return NextResponse.json({ error: "Invalid order transition." }, { status: 400 });
    }
    if (session.role === "staff" && transitions.some((item) => next[item.fromStatus!] !== item.toStatus)) {
      return NextResponse.json({ error: "Staff can only move an order to its next stage." }, { status: 403 });
    }

    const { data, error } = await mobileServiceClient().rpc("transition_fulfilment_orders", {
      p_transitions: transitions,
      p_actor: `${session.displayName} (${session.username})`,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json({ orders: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UPDATE_FAILED";
    const status = message === "ORDER_CHANGED" ? 409 : message.includes("REQUIRED") ? 401 : message === "ORDER_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
