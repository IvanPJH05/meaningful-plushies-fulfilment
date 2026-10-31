import { createHash } from "node:crypto";
import { NextResponse, after } from "next/server";
import { mobileServiceClient } from "@/lib/mobile-api";
import { getTikTokConnection } from "@/lib/tiktok-connection";
import { extractTikTokOrderIds, verifyTikTokWebhook } from "@/lib/tiktok-orders";
import { processTikTokEvents } from "@/lib/tiktok-recovery";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) {
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 262144) return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  if (!verifyTikTokWebhook(raw, request)) return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  let payload;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  try {
    const connection = await getTikTokConnection();
    if (!connection || String(payload.shop_id || "") !== connection.shop_id) return NextResponse.json({ error: "Shop is not connected." }, { status: 403 });
    const type = String(payload.type);
    const db = mobileServiceClient();
    if (type === "6") {
      const result = await db.from("tiktok_connection").delete().eq("shop_id", connection.shop_id);
      if (result.error) throw result.error;
      return NextResponse.json({ code: 0, message: "success" });
    }
    if (!["1", "3", "11", "12"].includes(type)) return NextResponse.json({ code: 0, message: "success" });
    const ids = extractTikTokOrderIds(payload.data).slice(0, 20);
    if (!ids.length) return NextResponse.json({ code: 0, message: "success" });
    const id = createHash("sha256").update(raw).digest("hex");
    const saved = await db.from("tiktok_webhook_events").upsert({ id, shop_id: connection.shop_id, event_type: type, order_ids: ids }, { onConflict: "id", ignoreDuplicates: true });
    if (saved.error) throw saved.error;
    after(async () => { try { await processTikTokEvents(); } catch { console.error("TikTok event queue needs recovery."); } });
    return NextResponse.json({ code: 0, message: "success" });
  } catch { return NextResponse.json({ error: "Could not retain event. Please retry." }, { status: 503 }); }
}
