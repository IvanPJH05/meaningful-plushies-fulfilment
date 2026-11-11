import { NextResponse } from "next/server";
import { mobileServiceClient } from "@/lib/mobile-api";
import { parseOrderEdit } from "@/lib/order-edit";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!/^[0-9a-f-]{36}$/i.test(token)) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  try {
    const body = await request.text();
    if (body.length > 12_000_000) return NextResponse.json({ error: "Order edit is too large." }, { status: 413 });
    let input: unknown;
    try { input = JSON.parse(body); } catch { return NextResponse.json({ error: "Invalid order edit." }, { status: 400 }); }
    const edit = parseOrderEdit(input);
    // The existing warehouse service connection owns this transaction. It
    // validates the active administrator, preserves the version check, merges
    // only edited keys and atomically queues any certificate change.
    const { data: result, error } = await mobileServiceClient().rpc("edit_fulfilment_order", {
      p_order: edit.orderId, p_expected: edit.expectedUpdatedAt, p_patch: edit.patch, p_token: token,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json({ order: result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SAVE_FAILED";
    if (message === "INVALID_ORDER_EDIT") return NextResponse.json({ error: "Invalid order edit." }, { status: 400 });
    if (message === "ORDER_CHANGED") return NextResponse.json({ error: "This order changed since you started editing. Your draft is kept. Review the latest order before saving again." }, { status: 409 });
    if (message === "ORDER_NOT_FOUND") return NextResponse.json({ error: "This order no longer exists." }, { status: 404 });
    if (message === "LOGIN_REQUIRED") return NextResponse.json({ error: "Sign in again to save this order." }, { status: 401 });
    if (message === "ADMIN_REQUIRED") return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
    console.error("Order edit failed", error);
    return NextResponse.json({ error: "Order could not be saved. Your draft is kept; please retry." }, { status: 500 });
  }
}
