import { NextResponse } from "next/server";
import { mobileServiceClient, requireMobileSession } from "@/lib/mobile-api";
import { parseOrderEdit } from "@/lib/order-edit";
import { InvalidRecordingError } from "@/lib/batch-audio";
import { validateTikTokVoice } from "@/lib/tiktok-voice-validation";
import { setVoiceReviewReason, voiceReviewReason } from "@/lib/voice-review";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function PATCH(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!/^[0-9a-f-]{36}$/i.test(token)) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  try {
    const body = await request.text();
    if (body.length > 12_000_000) return NextResponse.json({ error: "Order edit is too large." }, { status: 413 });
    let input: unknown;
    try { input = JSON.parse(body); } catch { return NextResponse.json({ error: "Invalid order edit." }, { status: 400 }); }
    const edit = parseOrderEdit(input);
    const client = mobileServiceClient();
    let reviewReason = "";
    let patch = edit.patch;
    if (edit.patch.tikTokFileDataUrl) {
      const session = await requireMobileSession(request);
      if (session.role !== "admin") throw new Error("ADMIN_REQUIRED");
      let validated = false;
      try {
        validated = await validateTikTokVoice(client, edit.patch);
      } catch (error) {
        if (!(error instanceof InvalidRecordingError)) throw error;
        reviewReason = error.message;
      }
      if (validated || reviewReason) {
        const { data: current, error } = await client.from("fulfilment_orders")
          .select("notes:data->>internalNotes")
          .eq("id", edit.orderId)
          .maybeSingle();
        if (error) throw error;
        if (!current) throw new Error("ORDER_NOT_FOUND");
        const notes = current.notes ?? "";
        if (reviewReason) {
          patch = { internalNotes: setVoiceReviewReason(notes, reviewReason) };
        } else if (voiceReviewReason(edit.patch.internalNotes ?? notes)) {
          patch = { ...edit.patch, internalNotes: setVoiceReviewReason(edit.patch.internalNotes ?? notes, "") };
        }
      }
    }
    // The existing warehouse service connection owns this transaction. It
    // validates the active administrator, preserves the version check, merges
    // only edited keys and atomically queues any certificate change.
    const { data: result, error } = await client.rpc("edit_fulfilment_order", {
      p_order: edit.orderId, p_expected: edit.expectedUpdatedAt, p_patch: patch, p_token: token,
    });
    if (error) throw new Error(error.message);
    if (reviewReason) {
      return NextResponse.json({ error: reviewReason, reviewedOrder: result }, { status: 422, headers: { "cache-control": "no-store" } });
    }
    return NextResponse.json({ order: result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SAVE_FAILED";
    if (error instanceof InvalidRecordingError) return NextResponse.json({ error: message }, { status: 422 });
    if (message === "INVALID_ORDER_EDIT") return NextResponse.json({ error: "Invalid order edit." }, { status: 400 });
    if (message === "ORDER_CHANGED") return NextResponse.json({ error: "This order changed since you started editing. Your draft is kept. Review the latest order before saving again." }, { status: 409 });
    if (message === "ORDER_NOT_FOUND") return NextResponse.json({ error: "This order no longer exists." }, { status: 404 });
    if (message === "LOGIN_REQUIRED" || message === "SIGN_IN_REQUIRED") return NextResponse.json({ error: "Sign in again to save this order." }, { status: 401 });
    if (message === "ADMIN_REQUIRED" || message === "WAREHOUSE_ACCESS_REQUIRED") return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
    console.error("Order edit failed", error);
    return NextResponse.json({ error: "Order could not be saved. Your draft is kept; please retry." }, { status: 500 });
  }
}
