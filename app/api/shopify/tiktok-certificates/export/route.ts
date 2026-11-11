import { NextResponse } from "next/server";
import { mobileServiceClient, requireMobileSession } from "@/lib/mobile-api";

export const runtime = "nodejs";
/** Requeue authoritative records; never send editable JSON through Shopify Flow. */
export async function POST(request: Request) {
  try {
    const session = await requireMobileSession(request);
    if (session.role !== "admin") return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
    const body = await request.json();
    const ids: unknown = body.orderIds;
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 200 || ids.some(id => typeof id !== "string" || id.length > 200)) return NextResponse.json({ error: "Select up to 200 TikTok orders." }, { status: 400 });
    const { data, error } = await mobileServiceClient().rpc("requeue_tiktok_certificates", { p_ids: [...new Set(ids)] });
    if (error) throw error;
    return NextResponse.json({ ok: true, count: data, skipped: ids.length-data }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "QUEUE_FAILED";
    return NextResponse.json({ error: message.includes("REQUIRED") ? "Sign in required." : "Certificates could not be queued." }, { status: message.includes("REQUIRED") ? 401 : 500 });
  }
}
