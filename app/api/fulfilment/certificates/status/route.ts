import { NextResponse } from "next/server";
import { mobileServiceClient, requireMobileSession } from "@/lib/mobile-api";

export async function GET(request: Request) {
  try {
    await requireMobileSession(request);
    const id = new URL(request.url).searchParams.get("orderId") || "";
    if (!id || id.length > 200) return NextResponse.json({ error: "Invalid order." }, { status: 400 });
    const { data, error } = await mobileServiceClient().rpc("read_certificate_sync_status", { p_order: id });
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    return NextResponse.json(data, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json({ error: "Could not check certificate sync." }, { status: message.includes("REQUIRED") ? 401 : 503 });
  }
}
