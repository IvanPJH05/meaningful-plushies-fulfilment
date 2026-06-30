import { NextResponse } from "next/server";

import { syncTikTokOrdersByIds } from "../../../../../lib/tiktok-sync";
import { extractTikTokOrderIds, verifyTikTokWebhook } from "../../../../../lib/tiktok-orders";

export const runtime = "nodejs";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifyTikTokWebhook(rawBody, request)) {
    return json(401, { ok: false, error: "Invalid TikTok webhook signature." });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json(400, { ok: false, error: "Invalid TikTok webhook JSON." });
  }

  const orderIds = extractTikTokOrderIds(payload);
  if (!orderIds.length) {
    return json(200, { ok: true, saved: 0, message: "TikTok webhook received but no order ID was found." });
  }

  try {
    const result = await syncTikTokOrdersByIds(orderIds, "TikTok webhook");
    return json(200, { ok: true, saved: result.updated, checked: result.checked, failed: result.failed });
  } catch (error) {
    return json(500, {
      ok: false,
      error: error instanceof Error ? error.message : "TikTok webhook order could not be synced.",
    });
  }
}
