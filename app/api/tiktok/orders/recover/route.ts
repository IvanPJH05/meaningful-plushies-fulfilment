import { runTutorialFaq } from "@/lib/tiktok-tutorial-faq";
import { getTikTokConnection } from "@/lib/tiktok-connection";
import { runTikTokTutorialQueue } from "@/lib/tiktok-tutorial";
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
  try {
    const results = await Promise.allSettled([
      recoverTikTokOrders(),
      runTikTokTutorialQueue(),
      getTikTokConnection().then(connection => connection ? runTutorialFaq(connection.shop_id) : undefined),
    ]);
    if (results[0].status === "rejected") throw results[0].reason;
    return NextResponse.json({ ...results[0].value, tutorialQueueOk: results[1].status === "fulfilled", faqQueueOk: results[2].status === "fulfilled" });
  }
  catch { return NextResponse.json({ error: "TikTok recovery needs attention." }, { status: 503 }); }
}
