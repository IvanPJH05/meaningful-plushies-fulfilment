import { NextResponse } from "next/server";

import { syncTikTokOrdersByIds } from "../../../../../lib/tiktok-sync";

export const runtime = "nodejs";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
  let body: { orderId?: string; orderIds?: string[] };
  try {
    body = await request.json() as { orderId?: string; orderIds?: string[] };
  } catch {
    return json(400, { ok: false, error: "Invalid TikTok sync request." });
  }

  try {
    const result = await syncTikTokOrdersByIds([
      ...(Array.isArray(body.orderIds) ? body.orderIds : []),
      body.orderId ?? "",
    ], "TikTok manual sync");
    return json(result.ok ? 200 : 400, result);
  } catch (error) {
    return json(500, {
      ok: false,
      error: error instanceof Error ? error.message : "TikTok Shop orders could not be synced.",
    });
  }
}
