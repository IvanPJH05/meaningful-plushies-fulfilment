import { NextResponse } from "next/server";
import { getTikTokConnection, requireTikTokAdmin } from "@/lib/tiktok-connection";
export async function GET(request: Request) {
  try {
    await requireTikTokAdmin(request);
    const row = await getTikTokConnection();
    return NextResponse.json({ connected: !!row, shopName: row?.shop_name, lastSyncAt: row?.last_sync_at, expiresAt: row?.refresh_expires_at }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Administrator sign-in required." }, { status: 403 }); }
}
