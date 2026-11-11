import { NextResponse } from "next/server";
import { requireTikTokAdmin } from "@/lib/tiktok-connection";
import { recoverTikTokOrders } from "@/lib/tiktok-recovery";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) {
  try { await requireTikTokAdmin(request); }
  catch { return NextResponse.json({ error: "Administrator sign-in required." }, { status: 403 }); }
  try { return NextResponse.json(await recoverTikTokOrders()); }
  catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 503 }); }
}
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try { return NextResponse.json(await recoverTikTokOrders()); }
  catch { return NextResponse.json({ error: "TikTok recovery needs attention." }, { status: 503 }); }
}
